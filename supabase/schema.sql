-- CENTRAL SMS MVP - canonical schema
-- Apply to a dedicated Supabase project, review in SQL editor first.

create extension if not exists pgcrypto;

do $$ begin
  create type public.wallet_transaction_type as enum ('deposit','purchase','refund','adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activation_kind as enum ('ONE_TIME_SMS','TEMPORARY_HOSTING');
exception when duplicate_object then null; end $$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  currency char(3) not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  type public.wallet_transaction_type not null,
  amount_cents bigint not null check (amount_cents <> 0),
  balance_before_cents bigint not null,
  balance_after_cents bigint not null,
  reference_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, type, reference_id)
);

create table if not exists public.service_policies (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  product text not null,
  enabled boolean not null default false,
  risk_category text not null default 'standard',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, product)
);

create table if not exists public.activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null,
  external_activation_id text,
  idempotency_key text not null unique,
  country text not null,
  operator text,
  product text not null,
  kind public.activation_kind not null,
  phone text,
  provider_cost numeric(14,4),
  provider_currency text,
  sale_price_cents bigint not null check (sale_price_cents >= 0),
  status text not null check (status in ('creating','number_received','waiting_sms','sms_received','completed','cancelled','expired','refunded','failed')),
  sms_code text,
  sms_text text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists activations_user_created_idx on public.activations(user_id, created_at desc);
create index if not exists activations_waiting_idx on public.activations(status, updated_at) where status in ('number_received','waiting_sms','sms_received');

create table if not exists public.activation_sms (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.activations(id) on delete cascade,
  provider_sms_id text,
  dedupe_key text not null,
  sender text,
  sms_text text,
  sms_code text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (activation_id, dedupe_key)
);

create index if not exists activation_sms_activation_received_idx
  on public.activation_sms(activation_id, received_at desc);

create table if not exists public.payments (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null,
  environment text not null default 'production' check (environment in ('test','production')),
  external_payment_id text not null unique,
  external_reference text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null,
  qr_code_text text,
  qr_code_base64 text,
  ticket_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_user_environment_created_idx on public.payments(user_id, environment, created_at desc);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete restrict,
  environment text not null check (environment in ('test','production')),
  idempotency_key text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null check (status in ('creating','wallet_reserved','completed')),
  external_refund_id text,
  reason text not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payment_refunds_user_created_idx on public.payment_refunds(user_id, created_at desc);

create table if not exists public.rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash, window_start)
);

create index if not exists rate_limit_buckets_expires_idx on public.rate_limit_buckets(expires_at);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_type text not null,
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.rate_limit_consume(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_CONFIG';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from public.rate_limit_buckets
  where scope = p_scope and expires_at < clock_timestamp();

  insert into public.rate_limit_buckets(scope, key_hash, window_start, hits, expires_at)
  values(p_scope, p_key_hash, v_window_start, 1, v_window_start + make_interval(secs => p_window_seconds * 2))
  on conflict(scope, key_hash, window_start)
  do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

create or replace function public.wallet_apply_transaction(
  p_user_id uuid,
  p_type public.wallet_transaction_type,
  p_amount_cents bigint,
  p_reference_id text,
  p_metadata jsonb default '{}'::jsonb
) returns table(balance_before_cents bigint, balance_after_cents bigint, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint;
  v_after bigint;
  v_id uuid;
begin
  select wt.balance_before_cents, wt.balance_after_cents, wt.id
  into v_before, v_after, v_id
  from public.wallet_transactions wt
  where wt.user_id = p_user_id and wt.type = p_type and wt.reference_id = p_reference_id;
  if found then
    return query select v_before, v_after, v_id;
    return;
  end if;

  select w.balance_cents into v_before from public.wallets w where w.user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_after := v_before + p_amount_cents;
  if v_after < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance_cents = v_after, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_transactions(user_id,type,amount_cents,balance_before_cents,balance_after_cents,reference_id,metadata)
  values(p_user_id,p_type,p_amount_cents,v_before,v_after,p_reference_id,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return query select v_before, v_after, v_id;
end;
$$;

alter table public.app_users enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.service_policies enable row level security;
alter table public.activations enable row level security;
alter table public.activation_sms enable row level security;
alter table public.payments enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.app_users, public.wallets, public.wallet_transactions, public.service_policies, public.activations, public.activation_sms, public.payments, public.payment_refunds, public.rate_limit_buckets, public.audit_logs from anon, authenticated;
revoke execute on function public.rate_limit_consume(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.wallet_apply_transaction(uuid, public.wallet_transaction_type, bigint, text, jsonb) from public, anon, authenticated;
grant select, insert, update, delete on table public.app_users, public.wallets, public.wallet_transactions, public.service_policies, public.activations, public.activation_sms, public.payments, public.payment_refunds, public.rate_limit_buckets, public.audit_logs to service_role;
grant execute on function public.rate_limit_consume(text, text, integer, integer) to service_role;
grant execute on function public.wallet_apply_transaction(uuid, public.wallet_transaction_type, bigint, text, jsonb) to service_role;

-- CENTRAL SMS — prelaunch hardening
-- Apply manually in the Central-sms-mvp Supabase SQL Editor BEFORE merging/deploying
-- the code that depends on these columns/tables.

begin;

alter table public.payments
  add column if not exists environment text;

update public.payments
set environment = 'test'
where environment is null
  and external_payment_id like 'ORDTST%';

-- One-time cleanup for this project: sandbox attempts created before the production
-- switch used local pending:* IDs and could not be identified by the ORDTST prefix.
update public.payments
set environment = 'test'
where environment is null
  and provider = 'mercado_pago_orders'
  and external_payment_id like 'pending:%'
  and amount_cents = 5000
  and created_at < timestamptz '2026-09-12 19:30:00+00';

update public.payments
set environment = 'production'
where environment is null;

alter table public.payments
  alter column environment set default 'production';

alter table public.payments
  alter column environment set not null;

alter table public.payments
  drop constraint if exists payments_environment_check;

alter table public.payments
  add constraint payments_environment_check
  check (environment in ('test', 'production'));

create index if not exists payments_user_environment_created_idx
  on public.payments(user_id, environment, created_at desc);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete restrict,
  environment text not null check (environment in ('test', 'production')),
  idempotency_key text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null check (status in ('creating', 'wallet_reserved', 'completed')),
  external_refund_id text,
  reason text not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists payment_refunds_user_created_idx
  on public.payment_refunds(user_id, created_at desc);

alter table public.payment_refunds enable row level security;
revoke all on table public.payment_refunds from anon, authenticated;
grant select, insert, update, delete on table public.payment_refunds to service_role;

commit;

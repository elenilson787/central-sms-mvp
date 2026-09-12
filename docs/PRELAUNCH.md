# Central SMS — Prelaunch checklist

## Database patch required before deploy

Apply `supabase/patches/2026-09-12_prelaunch_hardening.sql` in the **Central-sms-mvp** Supabase project before merging code that selects `payments.environment` or `payment_refunds`.

The patch:

- creates an explicit `payments.environment` (`test` / `production`);
- backfills known sandbox Orders;
- creates `payment_refunds` for safe full-refund state;
- keeps RLS enabled and grants backend access only to `service_role`.

After applying, verify:

```sql
select environment, status, amount_cents, count(*)
from public.payments
group by environment, status, amount_cents
order by environment, amount_cents;
```

Production PIX payments should be `environment = 'production'`. Historical sandbox charges should be `test`.

## Admin console

Open `/admin`. Enter `ADMIN_API_TOKEN` only in the password field. It is stored in `sessionStorage`, not in the URL.

The console can:

- find a user by Telegram ID, UUID or username;
- inspect current wallet balance;
- inspect recent PIX charges and activations;
- request a **full** refund of an approved production PIX charge.

A refund first reserves the same amount from the user's wallet. If the balance was already spent, the refund is blocked so the internal wallet cannot become negative. Provider calls use an idempotency key. If Mercado Pago fails after the wallet reservation, do not manually add money: retry the same payment through the admin flow or inspect `payment_refunds` first.

## Health check

`GET /api/health` returns only booleans/status metadata. It does not expose tokens or secret values.

## Public policy pages

- `/terms`
- `/privacy`
- `/refund-policy`
- `/support`

Telegram commands `/termos`, `/privacidade`, `/reembolso` and `/suporte` point users to these pages.

## Provider purchases

Keep `PURCHASES_ENABLED=false` until all of the following are confirmed:

- written/commercial permission for the intended resale/intermediation model;
- provider price currency and conversion policy;
- service/country allowlist;
- cancellation and automatic refund behavior;
- timeout, out-of-stock and duplicate-order behavior;
- end-to-end debit and compensating refund tests.

The Mini App must not present preview inventory as real stock before these checks are complete.

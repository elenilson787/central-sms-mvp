# Mercado Pago Orders API — PIX

Central SMS uses Checkout Transparente via the Mercado Pago Orders API for PIX.

- Create: `POST /v1/orders`
- Read/reconcile: `GET /v1/orders/{id}`
- Processing mode: `automatic`
- Payment method: `pix` / `bank_transfer`
- Webhook topic: `order`
- Idempotency: `X-Idempotency-Key`

The local `payments.external_payment_id` column stores the external Mercado Pago **order id** for this integration, despite the historical column name.

Wallet credit is only applied after server-side reconciliation confirms:

- matching `external_reference`;
- matching amount;
- PIX payment method;
- order `status=processed` and `status_detail=accredited`.

Live PIX remains gated by `PIX_ENABLED=true` and server-only Mercado Pago credentials.

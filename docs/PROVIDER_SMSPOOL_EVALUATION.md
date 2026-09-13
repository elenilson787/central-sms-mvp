# Provider evaluation — SMSPool

Status: **preferred technical candidate; live purchases remain blocked pending written commercial authorization.**

## Why SMSPool is the current first choice

- Public REST API for country/service catalogs, pricing, stock, ordering, polling and cancellation/refund flows.
- Business Account program for higher-volume API usage.
- One-time SMS and long-term rental products align with the Central SMS product model.
- Explicit compliance controls: financial services, crypto, government, telecom/carrier and identity/KYC verification are restricted/prohibited.
- Order cancellation endpoint returns provider-side refund when cancellation is accepted; orders without a received code are documented as automatically refundable on expiry.
- Provider is identified as SMSPool B.V. in the Netherlands and publishes compliance/privacy materials.

## Commercial blocker

The public documentation confirms business/API use, but it does **not** clearly grant permission to re-sell/white-label individual SMSPool numbers to our own end users with a markup.

Before `PURCHASES_ENABLED=true`, obtain written confirmation from SMSPool support that Central SMS Brasil may:

1. place orders through the SMSPool API on behalf of end users;
2. expose the resulting temporary/rental number and received SMS inside our Telegram Mini App;
3. charge our own BRL price/markup;
4. operate under a Business Account if required;
5. use one-time SMS and long-term rentals in this model.

## Required operational restrictions

Central SMS must not expose categories prohibited by the provider or by our own policy. At minimum, block:

- banks, payment services and crypto exchanges;
- government services;
- telecom/carrier services;
- identity/KYC verification services;
- spam, fraud, bulk-account creation, ban/limit evasion and other unlawful use.

Higher-risk services that SMSPool subjects to provider-side whitelisting must remain unavailable unless our SMSPool account is explicitly approved for them.

## API endpoints verified in official SMSPool/Postman documentation

- `GET https://api.smspool.net/country/retrieve_all`
- `GET https://api.smspool.net/service/retrieve_all`
- `POST https://api.smspool.net/request/pricing`
- `POST https://api.smspool.net/request/price`
- `POST https://api.smspool.net/sms/stock`
- `POST https://api.smspool.net/purchase/sms`
- `POST https://api.smspool.net/sms/check`
- `POST https://api.smspool.net/sms/cancel`
- `POST https://api.smspool.net/request/active`
- `POST https://api.smspool.net/request/balance`

## Implementation sequence

1. Obtain written commercial approval and API key.
2. Add server-only `SMSPOOL_API_KEY` and `SMSPOOL_COMMERCIAL_APPROVED=true` in Cloudflare secrets/variables.
3. Implement read-only country/service/pricing/stock catalog and cache it.
4. Populate `service_policies` only with approved products; deny by default.
5. Implement purchase transaction with idempotency, wallet reservation/debit and automatic refund on provider failure/cancellation.
6. Poll `/sms/check` using bounded backoff until completed/refunded/expired.
7. Store SMS once using `activation_sms.dedupe_key`.
8. Run controlled purchases with `PURCHASES_ENABLED=false` until admin-only diagnostics pass.
9. Enable public purchasing only after commercial approval and end-to-end tests.

## Provider support questions

Send SMSPool support a written request asking whether our described API resale model is authorized, whether a Business Account is required, whether markup/white-label presentation is permitted, and whether any service-specific restrictions apply beyond the public compliance list.

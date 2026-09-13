# Purchase confirmation UI

The Telegram Mini App uses a two-step one-time SMS purchase flow:

1. Live quote: server-side price, stock, success rate and wallet balance.
2. Review: product, country, one-time activation warning, final price, current balance and projected balance after purchase.

The final confirmation button is intentionally disabled while commercial execution is blocked. This UI does not call any purchase endpoint.

Live execution continues to require both `PURCHASES_ENABLED=true` and `SMSPOOL_COMMERCIAL_APPROVED=true`, plus the server-side purchase orchestration and service allow-list.

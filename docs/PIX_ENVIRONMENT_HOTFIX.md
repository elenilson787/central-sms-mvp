# PIX environment recovery hotfix

The Mini App pending-payment recovery must never mix Mercado Pago sandbox Orders with production Orders.

- Sandbox Orders are identified by the `ORDTST` prefix.
- When `MERCADO_PAGO_TEST_MODE=true`, recovery considers sandbox Orders (and transient `pending:` rows).
- When `MERCADO_PAGO_TEST_MODE=false`, recovery excludes `ORDTST%` Orders.

This keeps historical sandbox rows in the ledger/database without surfacing them in the production Mini App.

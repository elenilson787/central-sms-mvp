# Pesquisa técnica e decisão de providers — 11/09/2026

> Este documento registra a decisão do MVP. Preços, estoque e disponibilidade operacional nunca devem ser hardcoded: devem ser consultados na API no momento adequado.

## 1. Comparação resumida

| Item | 5SIM | SMSPool |
|---|---|---|
| Catálogo por API | Sim | Sim |
| Ativação curta / SMS único | Sim (`activation`) | Sim |
| Número por período | Sim (`hosting`) | Sim, long-term rentals |
| Consulta de SMS | Sim | Sim |
| Cancelamento | Sim | Sim |
| Melhor papel no MVP | Provider inicial | Segundo provider / fallback |
| Revenda a terceiros | **Confirmar por escrito** | **Confirmar por escrito** |

## 2. Provider escolhido: 5SIM

Motivo técnico: a documentação oficial atual concentra no mesmo protocolo as operações de catálogo e ciclo de vida necessárias ao MVP:

- países: `GET /v1/guest/countries`;
- produtos/estoque/preço: `GET /v1/guest/products/{country}/{operator}`;
- ativação curta: `GET /v1/user/buy/activation/{country}/{operator}/{product}`;
- número por período: `GET /v1/user/buy/hosting/{country}/{operator}/{product}`;
- consulta: `GET /v1/user/check/{id}`;
- cancelamento: `GET /v1/user/cancel/{id}`;
- finalização: `GET /v1/user/finish/{id}`.

O site público atual mostra preços em dólar, mas a página de referência da API consultada não explicita de forma suficientemente clara a moeda do campo numérico `Price`. O código portanto mantém `FIVESIM_PRICE_CURRENCY=UNCONFIRMED` e impede compra real até a moeda e a conversão serem confirmadas.

A documentação confirma integração por API. Não foi localizada, na pesquisa feita para este starter, autorização inequívoca para operar um marketplace revendendo ativações a usuários finais. Isso deve ser confirmado com o suporte/contrato antes de habilitar produção.

Referências oficiais:

- https://5sim.net/docs
- https://5sim.net/support/working-with-api
- https://5sim.net/prices

## 3. Segundo provider: SMSPool

A documentação oficial atual oferece compra de SMS temporário, consulta de status, lista de ativações e cancelamento. O serviço também apresenta números de longo prazo. Isso o torna adequado como segundo adapter e fallback depois que o fluxo 5SIM estiver estabilizado.

Referências oficiais:

- https://www.smspool.net/article/how-to-use-the-smspool-api
- https://www.smspool.net/long-term-sms-rentals

A permissão de revenda a terceiros também deve ser confirmada formalmente antes de usar o provider em produção.

## 4. PIX / Mercado Pago

O módulo foi desenhado com:

- criação de pagamento via `POST /v1/payments`;
- `X-Idempotency-Key` obrigatório;
- `payment_method_id: pix`;
- webhook como fonte de confirmação;
- validação da origem por `x-signature` + `x-request-id` + `data.id`;
- consulta do pagamento no Mercado Pago antes do crédito;
- ledger local com referência única para que um webhook repetido não duplique saldo.

Referências oficiais:

- https://www.mercadopago.com.br/developers/pt/docs
- https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks

## 5. Endpoints do starter

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/api/health` | health check |
| GET | `/api/catalog?country=brazil` | catálogo público, somente allowlist |
| GET | `/api/catalog?country=brazil&raw=1` | catálogo bruto, admin token |
| POST | `/api/telegram/webhook` | Telegram Bot API |
| POST | `/api/cron/activations` | polling controlado de SMS |
| POST | `/api/payments/pix` | cria PIX, admin-only no MVP |
| POST | `/api/webhooks/mercadopago` | confirmação PIX assinada |
| POST | `/api/admin/wallet/adjust` | saldo manual de teste |
| POST | `/api/admin/activations/purchase` | compra controlada de teste |

## 6. O que está deliberadamente bloqueado

- compra pública pelo Telegram;
- qualquer produto sem allowlist;
- categorias classificadas como bancos, pagamentos, cripto, KYC/identidade, governo, telecom ou fraude/abuso;
- ativação enquanto a moeda/câmbio do provider estiverem sem confirmação;
- ativação global enquanto `PURCHASES_ENABLED=false`.

Essas travas são parte da arquitetura, não pendências acidentais.

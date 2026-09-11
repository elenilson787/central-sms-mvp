# CENTRAL SMS — MVP

Starter full-stack para uma plataforma de números virtuais via Telegram. O sistema é uma camada de agregação de providers: não opera SIM cards próprios.

## O que já está implementado

- Next.js App Router com endpoints server-side.
- Telegram Bot API via webhook e `secret_token`.
- Catálogo real da 5SIM: países/produtos/preço/estoque; o catálogo público mostra somente serviços aprovados.
- Dois tipos de produto: `ONE_TIME_SMS` e `TEMPORARY_HOSTING`.
- Adapter 5SIM para compra, consulta de SMS, cancelamento e finalização.
- Histórico idempotente de SMS por ativação (`activation_sms`), inclusive vários SMS no mesmo número alugado.
- `ProviderRouter` preparado para segundo fornecedor.
- Supabase: usuários Telegram, carteira, ledger, ativações, políticas, pagamentos e auditoria.
- Débito/crédito atômico e idempotente via função Postgres.
- Compra com refund automático se o provider falhar.
- Polling por cron protegido, limitado a 25 ativações por execução, mantendo rentals/hosting ativos após o primeiro SMS.
- Notificação automática no Telegram quando um SMS novo é persistido.
- Mercado Pago PIX: criação via `/v1/payments`, `X-Idempotency-Key`, webhook HMAC e crédito idempotente.
- Compliance: serviço precisa ser explicitamente aprovado; categorias de maior risco ficam bloqueadas.
- Rate limit persistente no PostgreSQL para comandos do Telegram.
- Audit log para eventos sensíveis do fluxo de compra e ajustes administrativos.
- Endpoints administrativos protegidos para ajuste de saldo de teste e compra controlada de ativação/hosting.

## Travas de segurança/comercial

1. `PURCHASES_ENABLED=false` por padrão.
2. Todo produto precisa existir em `service_policies` com `enabled=true`.
3. Categorias bancárias, pagamentos, cripto, KYC/identidade, governo e telecom ficam bloqueadas no código.
4. `FIVESIM_PRICE_CURRENCY` está como `UNCONFIRMED`: a documentação da API mostra preço numérico, mas a página consultada não identifica a moeda. Confirme isso antes de converter para BRL.
5. A API da 5SIM permite integração automatizada, mas a permissão de revenda para usuários finais deve ser confirmada por escrito antes de colocar o marketplace em produção.

Veja também [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para o desenho técnico e [`docs/RESEARCH.md`](docs/RESEARCH.md) para a pesquisa/decisão de providers e PIX.

## Setup local

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm run dev
```

> O sandbox usado para gerar este starter não possui acesso npm externo; por isso o `package-lock.json` deve ser gerado no primeiro `npm install` em um ambiente com internet e então commitado.

## Supabase

Use um projeto dedicado. Revise `supabase/schema.sql` no SQL Editor e aplique somente após revisar. O modelo é backend-only: `anon` e `authenticated` não possuem acesso às tabelas.

Depois, adicione um serviço permitido explicitamente, por exemplo (use somente um serviço que você tenha revisado):

```sql
insert into public.service_policies(provider, product, enabled, risk_category, notes)
values ('5sim', 'SEU_PRODUCT_SLUG', true, 'standard', 'Aprovado pelo administrador após revisão de termos');
```

Não cadastre serviços de KYC, governo, bancos, pagamentos, cripto ou telecom.

## Telegram

Configure o webhook do Bot API para:

`POST https://SEU_DOMINIO/api/telegram/webhook`

Use o mesmo valor de `TELEGRAM_WEBHOOK_SECRET` como `secret_token` ao registrar o webhook.

Comandos iniciais:

- `/start`
- `/catalogo brazil`
- `/saldo`
- `/ajuda`

O catálogo público consulta a 5SIM sem gastar saldo, mas só exibe produtos previamente aprovados em `service_policies`. Para diagnóstico administrativo, `GET /api/catalog?country=brazil&raw=1` exige `Authorization: Bearer $ADMIN_API_TOKEN`.

## Fluxo de compra real

O serviço de domínio `purchaseActivation()` já implementa:

1. valida configuração e compliance;
2. busca oferta/estoque atual;
3. calcula preço de venda;
4. cria intenção idempotente;
5. debita carteira atomicamente;
6. pede o número ao provider;
7. grava número e expiração;
8. se o provider falhar, reembolsa a carteira idempotentemente.

A compra ainda não está exposta como comando público do Telegram neste starter. Isso é intencional: primeiro valide provider, moeda, regra de markup e autorização comercial. Para teste controlado existe `POST /api/admin/activations/purchase`, protegido por `ADMIN_API_TOKEN`; ele continua obedecendo `PURCHASES_ENABLED` e `service_policies`.

Para carregar saldo fictício/manual durante o MVP existe `POST /api/admin/wallet/adjust`, também protegido por `ADMIN_API_TOKEN` e com referência idempotente.

## Número temporário por período

Na 5SIM a categoria é `hosting`. O adapter usa:

`/v1/user/buy/hosting/{country}/{operator}/{product}`

Os nomes/durações disponíveis não são inventados: vêm de `/v1/guest/products/{country}/{operator}` e são filtrados pela categoria `hosting`. O banco guarda cada SMS em `activation_sms`, de forma que um número temporário por período pode receber várias mensagens sem encerrar o monitoramento após a primeira.

## PIX

`POST /api/payments/pix` está protegido por `ADMIN_API_TOKEN` e cria uma cobrança PIX com idempotência. Não coloque CPF/CNPJ em mensagens comuns do Telegram; use um formulário HTTPS/Telegram Web App antes de expor essa rota ao usuário final.

O webhook `/api/webhooks/mercadopago`:

- valida `x-signature` com HMAC-SHA256;
- consulta o pagamento no Mercado Pago;
- atualiza o registro local;
- credita saldo somente no status `approved`;
- usa referência única para impedir crédito duplicado.

## Próximas etapas

1. Criar projeto Supabase dedicado e aplicar o schema.
2. Criar bot Telegram e configurar webhook.
3. Criar conta 5SIM de teste, confirmar moeda e permissão comercial/revenda.
4. Popular apenas serviços aprovados em `service_policies`.
5. Testar catálogo em produção sem habilitar compras.
6. Inserir saldo manual de teste e executar uma ativação de baixo valor em conta própria.
7. Só depois ativar PIX e painel administrativo.
8. Adicionar SMSPool como segundo provider/fallback após confirmar catálogo e termos comerciais atuais.

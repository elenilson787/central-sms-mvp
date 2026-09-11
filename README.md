# CENTRAL SMS — MVP

Plataforma modular via Telegram para catálogo, carteira, pagamentos e integrações com provedores de números/SMS, construída com Next.js, TypeScript e Supabase/PostgreSQL.

> Estado atual: **bootstrap seguro**. A estrutura e os contratos estão no repositório, mas compras reais de números e cobranças PIX permanecem desativadas até configuração e revisão das integrações externas.

## Stack

- Next.js App Router
- TypeScript
- Supabase/PostgreSQL
- Telegram Bot API
- GitHub Actions
- Vercel como opção de deploy

## Estrutura

```text
app/                 rotas e interface Next.js
src/                 serviços de domínio e integrações
supabase/schema.sql  schema inicial do banco
tests/               smoke tests
.github/workflows/   CI
docs/                arquitetura, pesquisa e desenvolvimento
```

## Capacidades modeladas

- usuários Telegram;
- carteira em BRL com ledger;
- transações `deposit`, `purchase`, `refund` e `adjustment`;
- catálogo com allowlist por `service_policies`;
- dois tipos de número: `ONE_TIME_SMS` e `TEMPORARY_HOSTING`;
- ativações e histórico de SMS;
- pagamentos;
- rate limiting persistente;
- audit logs;
- abstração genérica de providers.

## Travas atuais

- `PURCHASES_ENABLED=false` por padrão;
- adapter externo de provider está em modo bootstrap e não executa compras;
- integração PIX está em modo bootstrap e não cria cobranças reais;
- categorias de maior risco são bloqueadas pela camada de compliance;
- nenhum segredo deve ser versionado.

Isso permite desenvolver banco, bot, painel e regras de negócio sem movimentar dinheiro nem consumir números reais por acidente.

## Setup em ambiente de desenvolvimento

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm test
npm run dev
```

Para trabalhar sem PC, use GitHub Codespaces quando disponível. O fluxo recomendado está em [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## CI

Todo Pull Request para `main` executa:

```text
npm install
npm run typecheck
npm test
npm run build
```

O workflow está em `.github/workflows/ci.yml`.

## Supabase

O schema inicial está em [`supabase/schema.sql`](supabase/schema.sql).

Ele inclui:

- `app_users`
- `wallets`
- `wallet_transactions`
- `service_policies`
- `activations`
- `activation_sms`
- `payments`
- `rate_limit_buckets`
- `audit_logs`
- funções atômicas para carteira e rate limit

O modelo inicial é backend-only: tabelas têm RLS habilitado e privilégios de `anon`/`authenticated` são revogados.

## Segurança

Nunca envie ao GitHub:

```text
.env
.env.local
TELEGRAM_BOT_TOKEN
SUPABASE_SECRET_KEY
MERCADO_PAGO_ACCESS_TOKEN
FIVESIM_TOKEN
```

Use secrets/environment variables do ambiente de deploy.

## Próximas etapas

1. Fazer o bootstrap do projeto Supabase dedicado.
2. Validar schema e advisors do Supabase.
3. Implementar o bot Telegram em feature branch.
4. Configurar catálogo somente leitura.
5. Revisar documentação/termos comerciais do provider escolhido.
6. Implementar integração externa em branch própria, mantendo compras desligadas até aprovação.
7. Implementar PIX e webhook em branch própria.
8. Adicionar painel administrativo.

Veja também:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/RESEARCH.md`](docs/RESEARCH.md)
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

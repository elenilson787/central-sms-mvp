# CENTRAL SMS — MVP

Plataforma modular via Telegram para catálogo, carteira, pagamentos e integrações com provedores de números/SMS, construída com Next.js, TypeScript e Supabase/PostgreSQL.

> Estado atual: **bootstrap seguro + Telegram Mini App**. A estrutura, autenticação da Mini App, carteira e banco estão preparados; compras reais de números e cobranças PIX permanecem desativadas até configuração e revisão das integrações externas.

## Stack

- Next.js App Router
- TypeScript
- Supabase/PostgreSQL
- Telegram Bot API + Telegram Mini App
- GitHub Actions
- Cloudflare Workers como alvo de deploy

## Estrutura

```text
app/                 rotas e interface Next.js
app/miniapp/         interface principal dentro do Telegram
src/                 serviços de domínio e integrações
supabase/schema.sql  schema inicial do banco
tests/               smoke tests
.github/workflows/   CI
docs/                arquitetura, pesquisa e desenvolvimento
```

## Capacidades modeladas

- usuários Telegram;
- Mini App autenticada por `Telegram.WebApp.initData` validado no servidor;
- carteira em BRL com ledger;
- transações `deposit`, `purchase`, `refund` e `adjustment`;
- catálogo com allowlist por `service_policies`;
- dois tipos de número: `ONE_TIME_SMS` e `TEMPORARY_HOSTING`;
- ativações e histórico de SMS;
- pagamentos;
- rate limiting persistente;
- audit logs;
- abstração genérica de providers.

## Telegram Mini App

A rota principal da interface é:

```text
/miniapp
```

O `/start` do bot envia um botão `web_app` para abrir essa interface dentro do Telegram. O backend valida a assinatura do `initData`, cria/atualiza o usuário no Supabase, garante sua carteira e retorna as ativações recentes.

O endpoint administrativo abaixo configura webhook, menu button e comandos quando o deploy estiver pronto:

```text
POST /api/admin/telegram/configure
```

Veja [`docs/TELEGRAM_MINIAPP.md`](docs/TELEGRAM_MINIAPP.md).

## Travas atuais

- `PURCHASES_ENABLED=false` por padrão;
- adapter externo de provider está em modo bootstrap e não executa compras;
- integração PIX está em modo bootstrap e não cria cobranças reais;
- categorias de maior risco são bloqueadas pela camada de compliance;
- nenhum segredo deve ser versionado;
- `initDataUnsafe` não é usado para autenticação da Mini App.

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
TELEGRAM_WEBHOOK_SECRET
SUPABASE_SECRET_KEY
MERCADO_PAGO_ACCESS_TOKEN
FIVESIM_TOKEN
```

Use secrets/environment variables do ambiente de deploy.

## Próximas etapas

1. Validar o Telegram Mini App no CI e integrar ao `main`.
2. Preparar deploy Cloudflare Workers com `vinext` em branch própria.
3. Configurar `APP_BASE_URL`, Supabase e segredos do bot no ambiente de deploy.
4. Criar/configurar o bot e executar `/api/admin/telegram/configure`.
5. Testar `/start` → Mini App → sessão Supabase de ponta a ponta.
6. Configurar catálogo somente leitura.
7. Revisar documentação/termos comerciais do provider escolhido.
8. Implementar integrações externas em branches próprias, mantendo compras desligadas até aprovação.
9. Implementar PIX e webhook em branch própria.

Veja também:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/RESEARCH.md`](docs/RESEARCH.md)
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- [`docs/TELEGRAM_MINIAPP.md`](docs/TELEGRAM_MINIAPP.md)

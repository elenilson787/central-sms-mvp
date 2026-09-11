# Telegram Mini App

## Arquitetura

```text
Telegram Bot
   ├─ /start + botão Web App
   ├─ menu button
   └─ notificações
          │
          ▼
     /miniapp
          │
          ├─ Telegram.WebApp.initData
          │        │
          │        ▼
          │  POST /api/telegram/miniapp/session
          │        │
          │        ├─ valida HMAC do Telegram
          │        ├─ valida auth_date
          │        ├─ upsert app_users
          │        ├─ garante wallet
          │        └─ carrega ativações recentes
          │
          ▼
       Supabase
```

A Mini App nunca usa `initDataUnsafe` como prova de identidade. O cliente envia o `Telegram.WebApp.initData` bruto para o backend, que valida a assinatura antes de associar a sessão a um usuário.

Documentação oficial: https://core.telegram.org/bots/webapps

## URLs

Após o deploy, configure:

```text
APP_BASE_URL=https://SEU-WORKER.workers.dev
TELEGRAM_MINI_APP_URL=
```

Se `TELEGRAM_MINI_APP_URL` ficar vazio, o backend usa automaticamente:

```text
https://SEU-WORKER.workers.dev/miniapp
```

O webhook será:

```text
https://SEU-WORKER.workers.dev/api/telegram/webhook
```

## Segredos

Configurar apenas no ambiente de deploy:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_API_TOKEN
```

Nunca colocar esses valores no GitHub.

## Configuração automática do bot

Depois que o deploy e as variáveis estiverem configurados, o endpoint administrativo:

```text
POST /api/admin/telegram/configure
Authorization: Bearer <ADMIN_API_TOKEN>
```

configura:

- webhook do Telegram com `secret_token`;
- menu button para abrir a Mini App;
- comandos `/start` e `/ajuda`.

O `/start` também envia um botão inline `web_app` apontando para a Mini App.

## Interface inicial

A rota `/miniapp` já mostra:

- saldo da carteira;
- atalhos para compra, catálogo, PIX e ativações;
- últimas 5 ativações;
- tema integrado às variáveis visuais do Telegram;
- feedback háptico quando suportado.

As ações financeiras e de compra permanecem bloqueadas nesta fase. A interface apresenta os fluxos, mas só serão conectados a operações reais depois da revisão e validação de cada integração.

## Cloudflare

Para Next.js 16 em Workers, seguir a documentação oficial do Cloudflare para `vinext`. A migração deve ser feita de forma não destrutiva e validada no CI antes do merge:

https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

Fluxo previsto:

```text
main
  ↓
feat/cloudflare-deploy
  ↓
vinext check
  ↓
vinext init
  ↓
build no GitHub Actions
  ↓
Cloudflare Workers
```

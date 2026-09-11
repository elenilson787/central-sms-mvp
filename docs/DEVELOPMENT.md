# Desenvolvimento — GitHub-first

Este repositório é a fonte oficial do projeto. Não é necessário manter uma cópia permanente no PC.

## Fluxo de trabalho

1. `main` contém somente código revisado.
2. Cada mudança relevante nasce em uma branch curta, por exemplo:
   - `feat/supabase-bootstrap`
   - `feat/telegram-bot`
   - `feat/provider-integration`
   - `feat/pix`
   - `fix/...`
   - `chore/...`
3. A branch abre um Pull Request para `main`.
4. O GitHub Actions executa instalação, typecheck, testes e build.
5. Só depois de CI verde a mudança deve ser incorporada ao `main`.

## Segredos

Nunca versionar `.env`, `.env.local`, tokens ou chaves reais.

Use:

- GitHub/Vercel Environment Variables para deploy;
- Supabase/Vercel secrets conforme o componente;
- `.env.example` apenas como inventário de variáveis, sem valores reais.

## Estado das integrações externas

No bootstrap, as interfaces existem, mas operações reais de provider e PIX permanecem desligadas. A ativação deve ocorrer em feature branch própria, depois de validar documentação atual, autorização comercial, moeda/custos, webhook e credenciais.

## Desenvolvimento sem PC

Para editar/executar manualmente no navegador, use GitHub Codespaces quando disponível:

`Code → Codespaces → Create codespace on main`

O CI continua sendo a validação automática oficial do repositório.

## Deploy Cloudflare

O Worker `central-sms-mvp` usa integração Git com a branch `main`. Depois de alterar permissões do GitHub App da Cloudflare, um novo commit em `main` deve disparar automaticamente um novo build/deploy no Workers Builds.

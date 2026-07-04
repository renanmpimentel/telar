<div align="center">

<img src="docs/telar-mark.svg" alt="Telar" width="96" height="96" />

# Telar

**Um workspace de IA local-first para gerar, editar, visualizar e exportar interfaces React a partir de um prompt.**

_Telar_ é o tear da tecelagem — você descreve uma tela e ele tece o código, ao vivo.

[English](README.md) · [Português](README.pt-BR.md)

[![Licença: MIT](https://img.shields.io/badge/License-MIT-0f766e.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Testado com Vitest](https://img.shields.io/badge/testado%20com-Vitest-6da13f?logo=vitest&logoColor=white)](https://vitest.dev)
[![E2E: Playwright](https://img.shields.io/badge/e2e-Playwright-2ead33?logo=playwright&logoColor=white)](https://playwright.dev)
[![PRs bem-vindos](https://img.shields.io/badge/PRs-bem--vindos-0f766e.svg)](#contribuindo)
[![Local-first](https://img.shields.io/badge/local--first-%E2%9C%94-0f766e.svg)](#por-que-telar)
[![i18n](https://img.shields.io/badge/i18n-en%20%C2%B7%20pt-0f766e.svg)](#internacionalização)
[![Último commit](https://img.shields.io/github/last-commit/renanmpimentel/telar?color=0f766e)](https://github.com/renanmpimentel/telar/commits)
[![Stars](https://img.shields.io/github/stars/renanmpimentel/telar?style=social)](https://github.com/renanmpimentel/telar/stargazers)

</div>

---

## Showcase

Cada tela abaixo foi gerada a partir de um único prompt em inglês e renderizada ao vivo no preview do Telar, dentro do navegador — sem nenhuma linha de código escrita à mão.

**Dashboard de analytics**

> _"A SaaS analytics dashboard with a left sidebar navigation, a top bar with search and a user avatar, four KPI summary cards, a large revenue line chart, a traffic-sources donut chart, and a recent-activity table. Clean modern light theme with a teal accent."_

![Dashboard de analytics gerado pelo Telar a partir de um prompt](docs/screenshots/01-analytics-dashboard.png)

**Landing page de SaaS**

> _"A modern landing page for a project-management SaaS: sticky nav, a bold hero with a product mockup, a three-column feature grid, a pricing section with three tiers, a testimonial, and a footer. Light theme with a vibrant indigo accent."_

![Landing page de SaaS gerada pelo Telar a partir de um prompt](docs/screenshots/02-saas-landing.png)

**Tela de configurações**

> _"A user account settings screen: a left sidebar with sections, a Profile panel with avatar and edit button, a two-column form, a Notifications card with toggles, and a sticky footer with Cancel and Save buttons. Light theme with a violet accent."_

![Tela de configurações de conta gerada pelo Telar a partir de um prompt](docs/screenshots/03-settings-profile.png)

## Por que Telar

O Telar traz o fluxo de um canvas de design para a geração de código: descreva a tela, anexe referências quando precisar e veja um app React de verdade renderizar num preview ao vivo. Tudo roda **local-first** — seus projetos ficam no navegador (IndexedDB), e você usa sua própria chave de IA ou uma CLI local. Nada é enviado para um backend do Telar.

## Recursos

- 🧵 **Do prompt à UI** — descreva uma tela e receba um projeto React completo e editável.
- 👀 **Preview ao vivo** — o app gerado roda no navegador via [WebContainers](https://webcontainers.io), com um modo mock leve para testes.
- 🗂️ **Projetos** — crie, troque, renomeie e exclua; cada um guarda sua própria conversa e histórico de versões.
- ⏪ **Versões** — cada geração é um snapshot restaurável.
- 📎 **Referências** — anexe arquivos de texto e imagem para guiar a geração.
- 🧠 **Traga sua IA** — OpenAI, Anthropic (Claude) ou um binário local **Claude CLI** / **Codex CLI** (sem API key).
- ✍️ **Skills de geração** — vem com a skill `frontend-design` ou carrega uma custom de um `SKILL.md` público do GitHub.
- 📦 **Exportar** — baixe o projeto inteiro como ZIP.
- 🚀 **Publicar** — deploy em um clique na **Vercel** (build a partir do código) ou na **Netlify** (build no navegador e envio); cole um token de acesso pessoal, sem OAuth. Veja [Provedores de deploy](#provedores-de-deploy).
- 🌐 **Internacionalização** — inglês e português, detectados automaticamente e alternáveis.
- 🎨 **UI clara e calma** — um layout "Canvas + Dock" que mantém o preview no centro.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) · [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org)
- [WebContainers](https://webcontainers.io) para o runtime de preview no navegador
- [Zod](https://zod.dev) para validação de schema · [JSZip](https://stuk.github.io/jszip/) para exportação
- [Vitest](https://vitest.dev) (unit) · [Playwright](https://playwright.dev) (e2e)
- CSS puro com design tokens — sem framework de UI

## Começando

**Requisitos:** Node.js 20+ e npm.

```bash
git clone https://github.com/renanmpimentel/telar.git
cd telar
npm install
npm run dev
```

Abra <http://localhost:3000>. Abra **Configurações** para escolher um provedor de IA e colar sua chave (ou selecionar uma CLI local detectada).

### Com Docker

```bash
docker compose up
```

### Variáveis de ambiente

Todas são opcionais:

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_PREVIEW_MODE` | Defina como `mock` para renderizar um preview leve sem WebContainers (usado nos testes). |
| `TELAR_GENERATION_MAX_MS` | Teto de segurança de uma geração em background antes de ser abortada (padrão `1200000` = 20 min). |
| `TELAR_CLAUDE_BIN` | Caminho/nome do binário da Claude CLI (padrão `claude`). |
| `TELAR_CODEX_BIN` | Caminho/nome do binário da Codex CLI (padrão `codex`). |

O deploy **não precisa de variáveis de ambiente** — você cola um token de acesso pessoal na interface (veja abaixo).

## Provedores de deploy

O drawer **Publicar** sempre oferece o download em `.zip`. O deploy em um clique é configurado **inteiramente no app** — sem variáveis de ambiente, sem OAuth, e funciona localmente:

1. Crie um token de acesso pessoal no provedor ([tokens Vercel](https://vercel.com/account/tokens) / [personal access tokens Netlify](https://app.netlify.com/user/applications#personal-access-tokens)) — cada card tem o link direto.
2. Abra **Publicar**, cole o token no card do provedor e clique **Conectar**. O token é validado na hora e guardado em **cookie httpOnly** (nunca exposto ao JavaScript).
3. Clique **Publicar** para obter a URL ao vivo.

- **Vercel** — os arquivos-fonte são enviados e a Vercel executa o build do Vite.
- **Netlify** — o projeto é compilado no seu navegador (WebContainers) e o `dist/` estático é enviado.

Nenhum redirecionamento sai do app, então funciona no `localhost`. Todas as mensagens de deploy seguem o idioma selecionado.

## Provedores de IA

O Telar é **BYOK** (traga sua própria chave). Em **Configurações → Serviço de IA** você pode escolher:

- **OpenAI** ou **Claude** — cole uma API key; a requisição vai direto ao provedor pelo route handler.
- **Claude CLI** / **Codex CLI** — usados automaticamente quando o binário é detectado no seu `PATH`; rodam localmente, sem API key. A CLI usa o modelo padrão dela, então defina um mais rápido no campo **Modelo** para acelerar.

## Internacionalização

A interface vem em **inglês** e **português**. O idioma é detectado pelo navegador (com fallback para inglês) e pode ser trocado a qualquer momento em **Configurações → Idioma**; a escolha é persistida localmente. As strings ficam em [`src/lib/i18n/dictionaries.ts`](src/lib/i18n/dictionaries.ts) — adicione um idioma espelhando o mapa `en`.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Serve o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, sem emitir |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | Testes ponta-a-ponta (Playwright) |

## Estrutura do projeto

```
src/
  app/            Rotas Next.js, layout, estilos globais, favicon
  components/     Workspace, painel de preview, marca
  lib/
    ai/           Dispatch de provedores + agente CLI
    i18n/         Dicionários, provider e hook
    preview/      Runtime WebContainer + cache de módulos
    project/      Tipos, templates, referências, skills de geração
    storage/      Persistência local dos projetos (IndexedDB)
    export/       Exportação ZIP
    deploy/       Helpers de cliente + tipos para publicação em um clique
    server/       Lógica de deploy (apenas servidor) e resolvedor de skill do GitHub
```

## Contribuindo

Contribuições são bem-vindas! Abra uma issue para discutir mudanças maiores antes. Antes de abrir um PR, rode `npm run lint`, `npm run typecheck` e `npm test`.

## Licença

[MIT](LICENSE) © Renan Pimentel

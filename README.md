# figma-fake

`figma-fake` e um studio local-first para gerar, editar, visualizar e exportar
interfaces React a partir de prompts. A ideia e aproximar o fluxo de um canvas
de design: voce descreve a tela, anexa referencias quando precisar, escolhe o
provedor de IA e acompanha o resultado em uma preview executavel.

O app usa Next.js na interface principal e gera um projeto Vite + React +
TypeScript dentro do workspace de cada projeto. Os projetos ficam salvos no
IndexedDB do navegador, e a chave de API e fornecida pelo usuario em modo BYOK
(bring your own key).

## O que o app faz

- Gera alteracoes completas para projetos Vite + React + TypeScript.
- Suporta OpenAI e Anthropic, com modelo configuravel por usuario.
- Mantem multiplos projetos locais com historico de conversa e arquivos.
- Executa a preview no navegador com WebContainer.
- Permite anexar referencias de texto, imagem e PDF para orientar a geracao.
- Exporta o projeto como ZIP, incluindo referencias permitidas.
- Permite trocar a skill de geracao por projeto:
  - padrao embutido: `frontend-design`;
  - customizada: URL publica do GitHub apontando diretamente para `SKILL.md`.
- Suporta tambem os binarios locais `claude` e `codex` como provedores (modo CLI), usando a autenticacao da propria CLI, sem API key.

## Requisitos

- Node.js 24 ou compativel com as dependencias atuais.
- npm.
- Um navegador moderno. Para preview com WebContainer, Chrome/Chromium tende a
  ser a opcao mais confiavel.
- Uma chave de API da OpenAI ou Anthropic para usar a geracao real.

## Subindo localmente

Instale as dependencias:

```bash
npm ci
```

Rode o servidor de desenvolvimento:

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

Na tela de Configuracoes, cole sua API key, escolha o provedor/modelo e gere a
primeira interface. A API key fica apenas em memoria no cliente durante a sessao;
as preferencias persistidas salvam provedor/modelo, nao a chave.

## Subindo com Docker Compose

Construa e suba o container:

```bash
docker compose up --build
```

Abra:

```text
http://localhost:3000
```

Para parar:

```bash
docker compose down
```

## Modo CLI (claude / codex)

Se os binarios `claude` (Claude Code) ou `codex` (OpenAI Codex) estiverem no
PATH da maquina que roda o Next, eles aparecem como provedores em Configuracoes.
O modo CLI usa a autenticacao da propria ferramenta (sua assinatura), nao precisa
de API key e o modelo e opcional. Para apontar um caminho customizado use as
variaveis de ambiente `LIKE_FIGMA_CLAUDE_BIN` e `LIKE_FIGMA_CODEX_BIN`.

Observacao: o modo CLI recebe apenas texto no prompt; referencias de imagem/PDF
entram somente como metadado.

## Comandos uteis

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

O projeto tambem usa Playwright para o fluxo E2E principal. Em testes, a preview
pode ser colocada em modo mock via `localStorage` para evitar depender do
WebContainer.

## Como usar skills de geracao

Cada projeto tem uma skill ativa. Por padrao, o app usa `frontend-design`, uma
instrucao embutida para gerar interfaces mais bem acabadas.

Para usar uma skill publica do GitHub:

1. Abra Configuracoes.
2. Cole uma URL `https://github.com/.../blob/.../SKILL.md` ou
   `https://raw.githubusercontent.com/.../SKILL.md`.
3. Clique em `Carregar skill`.

O servidor valida o host, normaliza URLs `github.com/.../blob/...` para raw,
baixa apenas conteudo textual publico, limita o arquivo a 100KB e nao usa token.
Repositorios privados, assets e scripts de skills Codex nao sao executados.

## Estrutura principal

```text
src/app/                 Rotas Next.js e endpoints server-side
src/components/          Workspace e preview
src/lib/ai/              Integracao com provedores e montagem de prompt
src/lib/project/         Tipos, paths, referencias, templates e skills
src/lib/storage/         Persistencia local em IndexedDB/localStorage
src/lib/preview/         Runtime WebContainer
tests/e2e/               Testes Playwright
```

## Observacoes de seguranca

- Nao commitar chaves, tokens ou arquivos `.env` reais.
- Preferir `.env.example` quando variaveis de ambiente forem adicionadas.
- Antes de concluir mudancas, rode lint, typecheck, testes, build, E2E, audit e
  um scan basico de padroes de segredo.

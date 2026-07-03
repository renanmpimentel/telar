# Task 8: Relatório de Documentação (README)

## Status
DONE

## Commit
7b8e996

## Alterações Realizadas

### 1. Adicionada bullet point à lista "O que o app faz"
- Adicionado item: "Suporta tambem os binarios locais `claude` e `codex` como provedores (modo CLI), usando a autenticacao da propria CLI, sem API key."
- Mantida consistência de estilo com os demais bullets (sem acentuação)

### 2. Adicionada nova seção "Modo CLI (claude / codex)"
- Inserida após a seção "Subindo com Docker Compose"
- Documentação cobre:
  - Condição de aparecimento (binários no PATH)
  - Autenticação (via ferramenta própria, sem API key)
  - Variáveis de ambiente para paths customizados (`LIKE_FIGMA_CLAUDE_BIN`, `LIKE_FIGMA_CODEX_BIN`)
  - Observação sobre limitações (apenas texto no prompt)

## Concerns
Nenhum. Edições seguem a convenção de estilo do arquivo e o texto foi inserido exatamente conforme especificado no brief.

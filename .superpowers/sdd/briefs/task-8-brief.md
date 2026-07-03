# Task 8: Documentação (README)

Registrar o modo CLI no README para quem for rodar o app.

## Files
- Modify: `README.md`

## Steps

### Step 1: Atualizar a lista "O que o app faz"
Localizar a lista de bullets sob "## O que o app faz" e adicionar um item (mantendo o estilo sem acentos usado no arquivo, se for o caso — inspecione os bullets vizinhos e siga a convenção deles):
```markdown
- Suporta tambem os binarios locais `claude` e `codex` como provedores (modo CLI), usando a autenticacao da propria CLI, sem API key.
```

### Step 2: Adicionar uma subseção após "## Subindo com Docker Compose"
Inserir, após o fim da seção de Docker Compose e antes da próxima seção:
```markdown
## Modo CLI (claude / codex)

Se os binarios `claude` (Claude Code) ou `codex` (OpenAI Codex) estiverem no
PATH da maquina que roda o Next, eles aparecem como provedores em Configuracoes.
O modo CLI usa a autenticacao da propria ferramenta (sua assinatura), nao precisa
de API key e o modelo e opcional. Para apontar um caminho customizado use as
variaveis de ambiente `LIKE_FIGMA_CLAUDE_BIN` e `LIKE_FIGMA_CODEX_BIN`.

Observacao: o modo CLI recebe apenas texto no prompt; referencias de imagem/PDF
entram somente como metadado.
```

### Step 3: Commit
```bash
git add README.md
git commit -m "docs: document CLI provider mode"
```

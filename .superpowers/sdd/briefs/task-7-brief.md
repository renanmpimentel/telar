# Task 7: UI de Configurações (workspace.tsx)

Mostra os providers CLI quando disponíveis, esconde a API key no modo CLI e ajusta o guard de geração. Verificação por typecheck/lint/build + checklist manual (o repo não tem testes de componente para `workspace.tsx`).

## Estado atual (JÁ FEITO por tasks anteriores — NÃO refazer)
- `ProviderId` já tem os 4 membros.
- `DEFAULT_MODELS` (linha ~69) JÁ tem `"claude-cli": ""` e `"codex-cli": ""`.
- `useEffect` JÁ está importado de react (linha 29).
- O guard de apiKey atual é ÚNICO, em `handleGenerate` (linha ~260): `if (!apiKey.trim()) { ... }`.

## Global Constraints
- Next.js 16 / React 19 / TypeScript.
- Providers CLI não usam API key; modelo é opcional.
- Não introduzir dependências novas.

## Files
- Modify: `src/components/workspace.tsx`
- Modify (se necessário): `src/app/globals.css` (só se precisar de uma classe `.drawer-hint`)

## Interfaces
- Consumes: `GET /api/agents` → `{ claude: boolean; codex: boolean }`.

## Steps

### Step 1: Estado `cliAgents`
Logo após a linha `const referenceInputRef = useRef<HTMLInputElement>(null);` (~linha 104), adicionar:
```ts
  const [cliAgents, setCliAgents] = useState<{ claude: boolean; codex: boolean }>({
    claude: false,
    codex: false,
  });
```

### Step 2: Efeito para buscar disponibilidade dos agentes
Após o `useEffect` que termina em `}, [activeDrawer, settingsNotice]);` (~linha 153), adicionar um novo efeito:
```ts
  useEffect(() => {
    let active = true;
    fetch("/api/agents")
      .then((response) => (response.ok ? response.json() : { claude: false, codex: false }))
      .then((data) => {
        if (active) setCliAgents({ claude: Boolean(data.claude), codex: Boolean(data.codex) });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
```

### Step 3: Derivado `isCliProvider`
Perto de `const selectedContent = ...` (~linha 159), adicionar:
```ts
  const isCliProvider = provider === "claude-cli" || provider === "codex-cli";
```

### Step 4: Botões de provider CLI (condicionais)
No `<div className="segmented" ...>`, logo após o botão "Claude" (o `</button>` da linha ~631, antes do `</div>` da linha 632), inserir:
```tsx
                    {cliAgents.claude ? (
                      <button
                        type="button"
                        className={provider === "claude-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("claude-cli")}
                      >
                        Claude CLI
                      </button>
                    ) : null}
                    {cliAgents.codex ? (
                      <button
                        type="button"
                        className={provider === "codex-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("codex-cli")}
                      >
                        Codex CLI
                      </button>
                    ) : null}
```

### Step 5: Esconder o card de API key no modo CLI
Envolver o `<div className="settings-card">` do campo API key (linhas ~635-652, o bloco inteiro que contém `htmlFor="api-key"`) numa condição, mostrando uma nota quando CLI:
```tsx
                {isCliProvider ? (
                  <p className="drawer-hint">Modo CLI: usa o binário local autenticado, sem API key.</p>
                ) : (
                  <div className="settings-card">
                    {/* ...conteúdo existente do card de API key, sem alterações... */}
                  </div>
                )}
```
Se a classe `.drawer-hint` não existir em `src/app/globals.css`, adicione uma regra simples reaproveitando o estilo de `.drawer-notice` (ex.: cor mais suave, `font-size` pequeno, margem). Mantenha discreto.

### Step 6: Label do modelo indica opcional no modo CLI
Trocar o conteúdo do label do modelo (linha ~655-657):
```tsx
                  <label className="field-label" htmlFor="model">
                    Modelo
                  </label>
```
por:
```tsx
                  <label className="field-label" htmlFor="model">
                    Modelo{isCliProvider ? " (opcional)" : ""}
                  </label>
```

### Step 7: Ajustar o guard de geração
Em `handleGenerate` (~linha 260), trocar:
```ts
    if (!apiKey.trim()) {
      openDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }
```
por:
```ts
    if (!isCliProvider && !apiKey.trim()) {
      openDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }
```

### Step 8: Verificar typecheck, lint e build
Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros.

### Step 9: Checklist manual (opcional se `npm run dev` disponível; senão registrar como não-verificado)
- Sem binários: só OpenAI e Claude aparecem.
- Com `claude` no PATH (ou `LIKE_FIGMA_CLAUDE_BIN` setado): botão "Claude CLI" aparece; ao selecioná-lo o card de API key some e a nota de CLI aparece; label do modelo mostra "(opcional)".

### Step 10: Commit
```bash
git add src/components/workspace.tsx src/app/globals.css
git commit -m "feat: expose CLI providers in settings UI"
```

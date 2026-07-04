# Powered by Telar — crédito nos projetos gerados

**Data:** 2026-07-04
**Status:** aprovado (design)

## Objetivo

Todo projeto gerado pelo Telar deve carregar um crédito discreto **"Powered by Telar"**
no rodapé, aparecendo de forma consistente no preview, no zip exportado e no site
publicado (deploy) — sem quebrar o layout do app gerado e permanecendo editável por
quem recebe o projeto.

## Princípio central

Preview, export e deploy derivam todos dos **mesmos arquivos do projeto**. Portanto o
crédito só precisa existir **no código gerado**; ele então aparece nas três saídas
automaticamente. Nenhuma mudança é necessária em `zip.ts`, no fluxo de deploy ou no
preview.

## O artefato (como fica na tela)

Um rodapé discreto, o mais simples possível para não conflitar com layouts:

```html
<footer>
  Powered by
  <a href="https://renanmpimentel.github.io/telar/" target="_blank" rel="noopener">Telar</a>
</footer>
```

- Texto padrão: **"Powered by Telar"** (inglês, universal — serve a apps de qualquer idioma).
- Link: `https://renanmpimentel.github.io/telar/` (URL canônica do projeto).
- Estilo discreto: fonte pequena, cor suave herdando a paleta do app, centralizado,
  padding modesto, **sem** posição `fixed`/flutuante.

## Como garantir "todo projeto gerado"

Duas alavancas complementares:

1. **Regra no `SYSTEM_PROMPT`** (`src/lib/ai/generate.ts`): uma instrução obrigatória
   para o modelo sempre incluir o footer discreto de crédito e **preservá-lo nas
   edições**. Como o `SYSTEM_PROMPT` é compartilhado pelos quatro provedores
   (`openai`, `anthropic`, `claude-cli`, `codex-cli`), cobre todos de uma vez.

2. **Seed no template padrão** (`src/lib/project/template.ts`): o `App.tsx` inicial e o
   `styles.css` já vêm com o footer. Isso (a) faz o preview mostrar o crédito mesmo
   antes de qualquer geração e (b) dá ao modelo um exemplo concreto para preservar.

## Editável por design

É código normal no projeto — quem recebe o zip pode apagar/editar livremente.
Atribuição por padrão, não travada.

## Trade-off

A garantia é a nível de prompt, então em casos raros o modelo pode esquecer o crédito
numa edição. O seed no template reduz muito esse risco (o modelo tende a preservar o
que já está no arquivo). **Não** há injeção programática pós-geração porque ela
desconheceria o layout do app e correria o risco de exatamente "estragar o layout".

## Escopo de arquivos

- `src/lib/ai/generate.ts` — nova regra no `SYSTEM_PROMPT`.
- `src/lib/project/template.ts` — footer no `App.tsx` inicial + estilo no `styles.css`.
- Sem mudanças em export, deploy ou preview.

## Não faz parte deste escopo

- Selo flutuante no canto (descartado — usuário pediu footer).
- Crédito travado/protegido contra remoção (usuário pediu editável).
- Localização do texto do crédito.

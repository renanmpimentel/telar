import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("uses a calm minimal visual system for the workspace shell", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("like-figma.previewMode", "mock");
    indexedDB.deleteDatabase("like-figma");
    localStorage.removeItem("like-figma.activeProjectId");
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();

  const visualContract = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const topbar = getComputedStyle(document.querySelector<HTMLElement>(".workspace-topbar")!);
    const previewStage = getComputedStyle(document.querySelector<HTMLElement>(".preview-stage")!);
    const previewBox = document.querySelector<HTMLElement>(".preview-region")!.getBoundingClientRect();
    const chatBox = document.querySelector<HTMLElement>(".chat-region")!.getBoundingClientRect();
    const shadowToken = root.getPropertyValue("--shadow").trim();
    const hexAlpha = shadowToken.match(/#[0-9a-f]{8}/i)?.[0]?.slice(-2);
    const rgbaAlpha = shadowToken.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/i)?.[1];

    return {
      bodyBackground: body.backgroundImage,
      panelShadowAlpha: hexAlpha ? Number.parseInt(hexAlpha, 16) / 255 : Number(rgbaAlpha ?? 1),
      previewBackground: previewStage.backgroundImage,
      topbarBackground: topbar.backgroundColor,
      previewWidth: previewBox.width,
      chatWidth: chatBox.width,
    };
  });

  expect(visualContract.bodyBackground).not.toContain("radial-gradient");
  expect(visualContract.previewBackground).not.toContain("radial-gradient");
  expect(visualContract.panelShadowAlpha).toBeLessThanOrEqual(0.04);
  expect(visualContract.topbarBackground).toBe("rgba(255, 255, 255, 0.94)");
  expect(visualContract.previewWidth).toBeGreaterThan(visualContract.chatWidth);
});

test("keeps the mobile workspace within the viewport width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("like-figma.previewMode", "mock");
    indexedDB.deleteDatabase("like-figma");
    localStorage.removeItem("like-figma.activeProjectId");
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Chat" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
});

test("prioritizes preview and chat while keeping settings and files in drawers", async ({ page }) => {
  let generationCount = 0;
  const generationRequests: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    localStorage.setItem("like-figma.previewMode", "mock");
    indexedDB.deleteDatabase("like-figma");
    localStorage.removeItem("like-figma.activeProjectId");
  });

  await page.route("**/api/generate", async (route) => {
    generationCount += 1;
    generationRequests.push(route.request().postDataJSON() as Record<string, unknown>);

    if (generationCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          change: {
            summary: "Generated notes interface",
            files: [
              {
                path: "src/App.tsx",
                content:
                  "export default function App() { return <main><h1>Generated Notes</h1><p>Capture ideas fast.</p></main>; }",
              },
              {
                path: "src/styles.css",
                content:
                  "body { margin: 0; font-family: Avenir Next, sans-serif; background: #f6f1e8; color: #171717; } main { min-height: 100vh; display: grid; place-items: center; }",
              },
            ],
            notes: [],
            errors: [],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Provider unavailable" } }),
    });
  });
  await page.route("**/api/skills/github", async (route) => {
    const body = route.request().postDataJSON() as { url?: string };
    if (body.url?.includes("example.com")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Only public GitHub SKILL.md URLs are supported." } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "github",
        name: "cinematic-ui",
        sourceUrl: "https://raw.githubusercontent.com/acme/skills/main/cinematic/SKILL.md",
        content: "Use cinematic contrast, hard shadows, and compact production controls.",
        fetchedAt: "2026-06-09T12:00:00.000Z",
      }),
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("figma-fake");
  await expect(page.locator(".brand-mark span")).toHaveText("FF");
  await expect(page.getByText("figma-fake")).toBeVisible();
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Chat" })).toBeVisible();
  const previewBox = await page.getByRole("region", { name: "Preview" }).boundingBox();
  const chatBox = await page.getByRole("region", { name: "Chat" }).boundingBox();
  expect(previewBox).toBeTruthy();
  expect(chatBox).toBeTruthy();
  expect(chatBox!.x).toBeLessThan(previewBox!.x);
  expect(chatBox!.width).toBeGreaterThanOrEqual(400);
  expect(chatBox!.width).toBeLessThanOrEqual(440);
  expect(previewBox!.width).toBeGreaterThan(chatBox!.width);
  await expect(page.getByRole("button", { name: "Projetos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Arquivos" })).toBeVisible();
  await expect(page.getByText("Studio Console")).toHaveCount(0);
  await expect(page.getByText("BYOK")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Arquivos do projeto" })).toHaveCount(0);

  await page.getByLabel("Nome do projeto").fill("Projeto inicial");
  await page.getByLabel("Nome do projeto").blur();
  await page.getByRole("button", { name: "Projetos" }).click();
  const projectsDrawer = page.getByRole("region", { name: "Projetos" });
  await expect(projectsDrawer).toBeVisible();
  await expect(projectsDrawer.getByText("Projeto inicial")).toBeVisible();
  await expect(projectsDrawer.getByText("Ativo")).toBeVisible();
  await page.getByRole("button", { name: "Novo projeto" }).click();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue("Untitled Project");
  await expect(projectsDrawer.getByText("Projeto inicial")).toBeVisible();
  await page.getByRole("button", { name: "Abrir Projeto inicial" }).click();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue("Projeto inicial");
  await page.getByRole("button", { name: "Excluir Untitled Project" }).click();
  await expect(projectsDrawer.getByText("Confirmar exclusão?")).toBeVisible();
  await expect(projectsDrawer.getByText("Untitled Project")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar exclusão de Untitled Project" }).click();
  await expect(projectsDrawer.getByText("Untitled Project")).toHaveCount(0);
  await page.getByRole("button", { name: "Excluir Projeto inicial" }).click();
  await expect(projectsDrawer.getByText("Confirmar exclusão?")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar exclusão de Projeto inicial" }).click();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue("Untitled Project");
  await expect(projectsDrawer.getByText("Ativo")).toBeVisible();
  await page.getByRole("button", { name: "Fechar projetos" }).click();
  await page.getByLabel("Nome do projeto").fill("Projeto inicial");
  await page.getByLabel("Nome do projeto").blur();

  await page.getByLabel("Descreva a tela que você quer criar").fill("Build a notes interface");
  await page.getByRole("button", { name: /Generate/i }).click();

  await expect(page.getByRole("region", { name: "Configurações" })).toBeVisible();
  await expect(page.getByText("Adicione sua chave de API para criar a tela.")).toBeVisible();
  await expect(page.getByLabel("API key")).toBeFocused();
  const settingsDrawer = page.getByRole("region", { name: "Configurações" });
  await expect(settingsDrawer.getByRole("heading", { name: "Skill de geração" })).toBeVisible();
  await expect(settingsDrawer.getByText("frontend-design")).toBeVisible();
  await settingsDrawer.getByLabel("URL pública do SKILL.md").fill("https://github.com/acme/skills/blob/main/cinematic/SKILL.md");
  await settingsDrawer.getByRole("button", { name: "Carregar skill" }).click();
  await expect(settingsDrawer.getByText("cinematic-ui")).toBeVisible();
  await expect(settingsDrawer.getByText("Skill customizada ativa.")).toBeVisible();
  await page.getByRole("button", { name: "Claude" }).click();
  await expect(page.getByLabel("Modelo")).toHaveValue("claude-sonnet-4-5");
  await page.getByRole("button", { name: "OpenAI" }).click();
  await expect(page.getByLabel("Modelo")).toHaveValue("gpt-5-mini");

  await page.getByLabel("API key").fill("test-key");
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await page.getByRole("button", { name: /Generate/i }).click();

  await expect(
    page.frameLocator('iframe[title="Project preview"]').locator(".mock-root p").getByText("Generated Notes"),
  ).toBeVisible();
  await expect(page.getByText("Generated notes interface")).toBeVisible();
  expect(generationRequests[0]?.generationSkill).toEqual(
    expect.objectContaining({
      source: "github",
      name: "cinematic-ui",
      content: expect.stringContaining("cinematic contrast"),
    }),
  );

  await page.getByLabel("Descreva a tela que você quer criar").fill("Break the provider");
  await page.getByRole("button", { name: /Generate/i }).click();

  await expect(page.getByRole("region", { name: "Chat" }).getByRole("alert")).toContainText("Provider unavailable");
  await expect(
    page.frameLocator('iframe[title="Project preview"]').locator(".mock-root p").getByText("Generated Notes"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Configurações" }).click();
  await settingsDrawer.getByRole("button", { name: "Remover skill" }).click();
  await expect(settingsDrawer.getByText("frontend-design")).toBeVisible();
  await settingsDrawer.getByLabel("URL pública do SKILL.md").fill("https://example.com/not-a-skill/SKILL.md");
  await settingsDrawer.getByRole("button", { name: "Carregar skill" }).click();
  await expect(settingsDrawer.getByRole("alert")).toContainText("Nao consegui carregar a skill");
  await page.getByRole("button", { name: "Fechar configurações" }).click();

  await page.getByRole("button", { name: "Arquivos" }).click();
  const filesDrawer = page.getByRole("region", { name: "Arquivos do projeto" });
  await expect(filesDrawer).toBeVisible();
  await expect(filesDrawer.getByRole("button", { name: "Novo projeto" })).toHaveCount(0);
  await expect(filesDrawer.getByRole("button", { name: /Abrir / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /src\/App\.tsx/ })).toBeVisible();
  await expect(page.getByLabel("Editor de arquivo")).toContainText("Generated Notes");
  const fileTreeBox = await page.getByRole("navigation", { name: "Arquivos" }).boundingBox();
  const editorBox = await page.getByLabel("Editor de arquivo").boundingBox();
  expect(fileTreeBox).toBeTruthy();
  expect(editorBox).toBeTruthy();
  expect(editorBox!.width).toBeGreaterThan(fileTreeBox!.width);

  await page.getByLabel("Anexar referências").setInputFiles([
    {
      name: "brief.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Brief\nUse the uploaded reference."),
    },
    {
      name: "hero.png",
      mimeType: "image/png",
      buffer: Buffer.from([1, 2, 3, 4]),
    },
  ]);
  await expect(filesDrawer.getByRole("heading", { name: "Referências" })).toBeVisible();
  await expect(filesDrawer.getByRole("button", { name: "Abrir referência brief.md" })).toBeVisible();
  await expect(filesDrawer.getByRole("button", { name: "Abrir referência hero.png" })).toBeVisible();

  await filesDrawer.getByRole("button", { name: "Abrir referência brief.md" }).click();
  await expect(page.getByLabel("Editor de arquivo")).toContainText("# Brief");
  await filesDrawer.getByRole("button", { name: "Abrir referência hero.png" }).click();
  await expect(filesDrawer.locator(".reference-preview-heading").getByText("image/png")).toBeVisible();
  await expect(filesDrawer.getByRole("img", { name: "hero.png" })).toBeVisible();
  await filesDrawer.getByRole("button", { name: "Remover referência hero.png" }).click();
  await expect(filesDrawer.getByText("hero.png")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export ZIP/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/projeto-inicial\.zip/i);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  await expect(zip.file("src/App.tsx")?.async("string")).resolves.toContain("Generated Notes");
  await expect(zip.file("src/references/brief.md")?.async("string")).resolves.toContain("Brief");
  expect(zip.file("src/references/hero.png")).toBeNull();

  await page.getByRole("button", { name: "Fechar arquivos" }).click();
  await page.getByLabel("Descreva a tela que você quer criar").fill("Use the markdown reference");
  await page.getByRole("button", { name: /Generate/i }).click();
  await expect(page.getByRole("region", { name: "Chat" }).getByRole("alert")).toContainText("Provider unavailable");
  expect(generationRequests.at(-1)?.references).toEqual([
    expect.objectContaining({
      name: "brief.md",
      projectPath: "src/references/brief.md",
      kind: "text",
    }),
  ]);
  expect(generationRequests.at(-1)?.generationSkill).toEqual({
    source: "builtin",
    name: "frontend-design",
  });
});

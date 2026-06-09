import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("prioritizes preview and chat while keeping settings and files in drawers", async ({ page }) => {
  let generationCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem("like-figma.previewMode", "mock");
    indexedDB.deleteDatabase("like-figma");
    localStorage.removeItem("like-figma.activeProjectId");
  });

  await page.route("**/api/generate", async (route) => {
    generationCount += 1;

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

  await page.goto("/");
  await expect(page).toHaveTitle("figma-fake");
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

  await page.getByLabel("Descreva a tela que você quer criar").fill("Break the provider");
  await page.getByRole("button", { name: /Generate/i }).click();

  await expect(page.getByRole("region", { name: "Chat" }).getByRole("alert")).toContainText("Provider unavailable");
  await expect(
    page.frameLocator('iframe[title="Project preview"]').locator(".mock-root p").getByText("Generated Notes"),
  ).toBeVisible();

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

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export ZIP/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/projeto-inicial\.zip/i);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  await expect(zip.file("src/App.tsx")?.async("string")).resolves.toContain("Generated Notes");
});

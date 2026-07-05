import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const SNAPSHOTS_DIR = path.resolve(__dirname, "../../public/snapshots");

/**
 * Prebuilds the base template `node_modules` seed and writes it to
 * `public/snapshots/`. Not a regular assertion test — it is the implementation of
 * `npm run prepare:seed`. Run it against a dev server serving `/dev/seed` (the
 * Playwright webServer already runs `npm run dev`).
 *
 * WebContainer boots a real VM and installs from the StackBlitz registry proxy, so
 * this needs network and takes a while; hence the generous timeout.
 */
test("gera o seed snapshot em public/snapshots/", async ({ page }) => {
  test.setTimeout(6 * 60_000);

  await page.goto("/dev/seed");
  const downloadPromise = page.waitForEvent("download", { timeout: 5 * 60_000 });
  await page.getByTestId("seed-start").click();

  const download = await downloadPromise;
  await expect(page.getByTestId("seed-error")).toHaveCount(0);

  const signature = await page.evaluate(() => window.__SEED_SIGNATURE__);
  expect(signature, "page must expose the dependency signature").toBeTruthy();
  const hash = createHash("sha256").update(signature as string).digest("hex").slice(0, 12);
  const filename = `${hash}.bin`;

  await mkdir(SNAPSHOTS_DIR, { recursive: true });
  await download.saveAs(path.join(SNAPSHOTS_DIR, filename));

  const manifest = {
    version: "1" as const,
    default: filename,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(SNAPSHOTS_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  await expect(page.getByTestId("seed-done")).toBeVisible();
});

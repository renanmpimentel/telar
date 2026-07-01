import { expect, it, vi } from "vitest";

import { callCliAgent, isBinaryAvailable, type CliRunner } from "@/lib/ai/cli-agent";
import { ProviderRequestError } from "@/lib/ai/errors";

const change = { summary: "ok", files: [], notes: [], errors: [] };
const schemaHint = JSON.stringify({ required: ["summary", "files", "notes", "errors"] });
const base = { systemPrompt: "SYS", userPrompt: "faz um card", schemaHint };

it("inclui o schema no prompt enviado ao binário", async () => {
  const runner: CliRunner = async (_bin, _args, opts) => {
    expect(opts.input).toContain(schemaHint);
    expect(opts.input).toContain("summary");
    return { stdout: JSON.stringify({ result: JSON.stringify(change) }), stderr: "" };
  };
  await callCliAgent({ ...base, provider: "claude-cli" }, runner);
});

it("parseia o envelope JSON do Claude", async () => {
  const runner: CliRunner = async (bin, args, opts) => {
    expect(bin).toBe("claude");
    expect(args).toEqual(["-p", "--output-format", "json"]);
    expect(opts.input).toContain("faz um card");
    return { stdout: JSON.stringify({ result: JSON.stringify(change) }), stderr: "" };
  };
  const out = await callCliAgent({ ...base, provider: "claude-cli" }, runner);
  expect(out).toEqual(change);
});

it("passa --model quando informado", async () => {
  const runner: CliRunner = async (_bin, args) => {
    expect(args).toEqual(["-p", "--output-format", "json", "--model", "claude-opus-4-8"]);
    return { stdout: JSON.stringify({ result: JSON.stringify(change) }), stderr: "" };
  };
  await callCliAgent({ ...base, provider: "claude-cli", model: "claude-opus-4-8" }, runner);
});

it("parseia a saída JSONL do Codex", async () => {
  const stdout = [
    JSON.stringify({ type: "thread.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(change) } }),
  ].join("\n");
  const runner: CliRunner = async (bin, args) => {
    expect(bin).toBe("codex");
    expect(args).toEqual(["exec", "--json"]);
    return { stdout, stderr: "" };
  };
  const out = await callCliAgent({ ...base, provider: "codex-cli" }, runner);
  expect(out).toEqual(change);
});

it("extrai JSON mesmo com cercas markdown na saída do Claude", async () => {
  const runner: CliRunner = async () => ({
    stdout: JSON.stringify({ result: "```json\n" + JSON.stringify(change) + "\n```" }),
    stderr: "",
  });
  const out = await callCliAgent({ ...base, provider: "claude-cli" }, runner);
  expect(out).toEqual(change);
});

it("mapeia ENOENT para erro amigável", async () => {
  const runner: CliRunner = async () => {
    const err = new Error("spawn claude ENOENT") as Error & { code?: string };
    err.code = "ENOENT";
    throw err;
  };
  await expect(callCliAgent({ ...base, provider: "claude-cli" }, runner)).rejects.toThrow(/não encontrado no PATH/);
});

it("mapeia exit != 0 incluindo stderr", async () => {
  const runner: CliRunner = async () => {
    const err = new Error("Command failed") as Error & { stderr?: string };
    err.stderr = "boom detail";
    throw err;
  };
  await expect(callCliAgent({ ...base, provider: "codex-cli" }, runner)).rejects.toThrow(/boom detail/);
});

it("erra em saída não-JSON", async () => {
  const runner: CliRunner = async () => ({ stdout: JSON.stringify({ result: "não é json" }), stderr: "" });
  await expect(callCliAgent({ ...base, provider: "claude-cli" }, runner)).rejects.toBeInstanceOf(ProviderRequestError);
});

it("isBinaryAvailable acha binário no PATH", async () => {
  const access = vi.fn().mockResolvedValueOnce(undefined);
  const ok = await isBinaryAvailable("claude", { PATH: "/usr/bin" } as unknown as NodeJS.ProcessEnv, access);
  expect(ok).toBe(true);
});

it("isBinaryAvailable retorna false quando ausente", async () => {
  const access = vi.fn().mockRejectedValue(new Error("no"));
  const ok = await isBinaryAvailable("codex", { PATH: "/usr/bin:/bin" } as unknown as NodeJS.ProcessEnv, access);
  expect(ok).toBe(false);
});

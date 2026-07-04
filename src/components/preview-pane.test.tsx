import { describe, expect, it } from "vitest";

import { appendReloadParam, formatElapsed } from "@/components/preview-pane";

describe("appendReloadParam", () => {
  it("adiciona o parâmetro de reload com ? quando a URL não tem query", () => {
    expect(appendReloadParam("https://x.webcontainer.io/", 2)).toBe(
      "https://x.webcontainer.io/?__preview=2",
    );
  });

  it("usa & quando a URL já tem query", () => {
    expect(appendReloadParam("https://x.webcontainer.io/?a=1", 3)).toBe(
      "https://x.webcontainer.io/?a=1&__preview=3",
    );
  });

  it("muda a cada nonce, forçando o iframe a recarregar", () => {
    const first = appendReloadParam("https://x.webcontainer.io/", 1);
    const second = appendReloadParam("https://x.webcontainer.io/", 2);
    expect(first).not.toBe(second);
  });
});

describe("formatElapsed", () => {
  it("formata segundos como m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9)).toBe("0:09");
    expect(formatElapsed(75)).toBe("1:15");
    expect(formatElapsed(600)).toBe("10:00");
  });
});

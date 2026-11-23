/**
 * 2026-11-24 实机回归：编辑器必须从**主题 token** 建 Monaco 主题（原厂 vs/vs-dark 是 bug）。
 * 覆盖：载荷优先 / 卡片 solid 作底（对比度不达标退窗口底）/ 滚动条与 minimap 上色。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeMonaco = {
  editor: {
    defineTheme: ReturnType<typeof vi.fn>;
    setTheme: ReturnType<typeof vi.fn>;
    getEditors: () => unknown[];
    getColorThemes: () => Array<{ id: string }>;
    onDidCreateEditor?: (cb: () => void) => { dispose(): void };
  };
};

function fakeMonaco(): FakeMonaco {
  return {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      getEditors: () => [],
      getColorThemes: () => [],
    },
  };
}

/** 每次重新加载模块——payloadVariables / defined / currentThemeName 都是模块级状态 */
async function loadModule() {
  vi.resetModules();
  return import("../services/theme-sync");
}

function resetDom() {
  const root = document.documentElement;
  for (const key of Array.from(root.style)) root.style.removeProperty(key);
  root.removeAttribute("data-theme");
}

describe("theme-sync：主题 token → Monaco 主题", () => {
  beforeEach(() => resetDom());

  it("从 DOM token 建主题：卡片 solid 作编辑器底色，滚动条/minimap 一并上色", async () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    root.style.setProperty("--bg-window-solid", "rgb(10,14,20)");
    root.style.setProperty("--bg-card-solid", "rgb(35,38,44)");
    root.style.setProperty("--text-primary", "#FFFFFF");
    root.style.setProperty("--text-muted", "rgba(255,255,255,0.58)");
    root.style.setProperty("--accent", "#FFB85C");
    root.style.setProperty("--bg-selection", "rgba(255,184,92,0.20)");
    root.style.setProperty("--scrollbar-thumb", "rgba(255,184,92,0.30)");
    root.style.setProperty("--border", "rgba(255,255,255,0.16)");

    const { syncMonacoTheme, getMonacoThemeName } = await loadModule();
    const monaco = fakeMonaco();
    syncMonacoTheme(monaco as never);

    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1);
    const [name, spec] = monaco.editor.defineTheme.mock.calls[0];
    expect(name).toBe(getMonacoThemeName());
    expect(name).toMatch(/^ldk-/);
    expect(spec.base).toBe("vs-dark");
    expect(spec.colors["editor.background"]).toBe("#23262c");
    expect(spec.colors["editor.foreground"]).toBe("#ffffff");
    // 🔴「最边边那条灰」：滚动条必须是主题暖金（保留 alpha），不是 Monaco 原厂 #79797966
    expect(spec.colors["scrollbarSlider.background"]).toBe("#ffb85c4d");
    expect(spec.colors["minimap.background"]).toBe("#23262c");
    expect(monaco.editor.setTheme).toHaveBeenCalledWith(name);
  });

  it("载荷 token 优先于 DOM（插件视图读不到自定义属性时仍能建主题）", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { setThemeVariables, syncMonacoTheme } = await loadModule();
    setThemeVariables({
      "bg-window-solid": "rgb(250,244,232)",
      "bg-card-solid": "rgb(253,248,239)",
      "text-primary": "#1F160D",
      accent: "#A6771B",
    });
    const monaco = fakeMonaco();
    syncMonacoTheme(monaco as never);

    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1);
    const [, spec] = monaco.editor.defineTheme.mock.calls[0];
    expect(spec.base).toBe("vs");
    expect(spec.colors["editor.background"]).toBe("#fdf8ef");
    expect(spec.colors["editor.foreground"]).toBe("#1f160d");
  });

  it("卡片 solid 是纯白而正文是白字（旧壳去 alpha 的坏值）→ 退窗口底，不把编辑器刷白", async () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    root.style.setProperty("--bg-window-solid", "rgb(10,14,20)");
    root.style.setProperty("--bg-card-solid", "rgb(255,255,255)");
    root.style.setProperty("--text-primary", "#FFFFFF");

    const { syncMonacoTheme } = await loadModule();
    const monaco = fakeMonaco();
    syncMonacoTheme(monaco as never);

    const [, spec] = monaco.editor.defineTheme.mock.calls[0];
    expect(spec.colors["editor.background"]).toBe("#0a0e14");
  });

  it("一个 token 都读不到 → 不静默停在原厂配色：回落 vs/vs-dark 且排重试", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { syncMonacoTheme, getMonacoThemeName } = await loadModule();
    const monaco = fakeMonaco();
    syncMonacoTheme(monaco as never);

    expect(monaco.editor.defineTheme).not.toHaveBeenCalled();
    expect(monaco.editor.setTheme).toHaveBeenCalledWith("vs-dark");
    expect(getMonacoThemeName()).toBe("vs-dark");
  });
});

/**
 * E4V#40e 主题同步——LinkDesk 主题 tokens → Monaco 主题（2026-11-24 token 化）。
 *
 * 🔴 旧 bug 防线（一条都不能拆；出处 `bug-atlas §B4` / E5.8#24.8 / E5#114d）：
 *   1) `monacoBootstrap` 保持 `loadThemes:true`（vs/vs-dark 必须已注册）。
 *   2) 双路径：`defineTheme` → `setTheme` → **每个 editor `updateOptions({theme})`**（含 DiffEditor 的两个 editor）。
 *   3) 自定义主题名必须**先 define 再 set**；`defineTheme` 幂等/失败回落 `vs`/`vs-dark`。
 *   4) 初始创建的主题名由本模块给出（`getMonacoThemeName()`），不读裸 `data-theme` 猜。
 *   5) 事件只走 `window.linkdesk.events`（多 WebView：不要用 CoreEvents）。
 *   6) 字体不塞进主题：fontSize/fontFamily 仍走 `editor.*` 配置（E5.8#179 双轴正交）。
 *
 * 2026-11-24 实机（编辑器仍显示 Monaco 原厂 vs/vs-dark）三条加固：
 *   7) **色值来源以 `theme:changed` 载荷为准**（`payload.variables` 与壳广播同源），DOM 自定义属性
 *      只作兜底——插件视图拿到变量的时机不可控，只读 DOM 会静默拿到空值。
 *   8) **建不出主题就重试**（10 × 150ms）＋ **新建编辑器补应用**（`onDidCreateEditor`）——
 *      不允许「静默停在原厂配色」。
 *   9) Monaco 自带的灰色件（滚动条／概览标尺／minimap／高亮／括号／诊断色）全部 token 化——
 *      原厂 `#79797966` 中性灰压在暖色主题上，就是右边缘那条「更黑的灰」。
 */
// E5.7#98：Monaco 具体类型——替代 any（monaco: any / rules: any[] / { current: any }）
import type { editor as MonacoEditorApi } from "monaco-editor";
type MonacoNs = typeof import("monaco-editor");
type Base = "vs" | "vs-dark";
type Rgb = [number, number, number];

/** Monaco 暗色 token 颜色——对标 VS Code Dark+ */
const DARK_TOKEN_RULES: MonacoEditorApi.ITokenThemeRule[] = [
  { token: "comment", foreground: "6A9955" },
  { token: "keyword", foreground: "569CD6" },
  { token: "string", foreground: "CE9178" },
  { token: "number", foreground: "B5CEA8" },
  { token: "type", foreground: "4EC9B0" },
  { token: "function", foreground: "DCDCAA" },
  { token: "variable", foreground: "9CDCFE" },
  { token: "constant", foreground: "4FC1FF" },
  { token: "operator", foreground: "D4D4D4" },
  { token: "delimiter", foreground: "D4D4D4" },
  { token: "predefined", foreground: "C586C0" }, // C 预处理器
];

/** Monaco 亮色 token 颜色——对标 VS Code Light+ */
const LIGHT_TOKEN_RULES: MonacoEditorApi.ITokenThemeRule[] = [
  { token: "comment", foreground: "008000" },
  { token: "keyword", foreground: "0000FF" },
  { token: "string", foreground: "A31515" },
  { token: "number", foreground: "098658" },
  { token: "type", foreground: "267F99" },
  { token: "function", foreground: "795E26" },
  { token: "variable", foreground: "001080" },
  { token: "constant", foreground: "0070C1" },
  { token: "operator", foreground: "000000" },
  { token: "delimiter", foreground: "000000" },
  { token: "predefined", foreground: "AF00DB" }, // C 预处理器
];

const defined = new Set<string>();
let currentThemeName: string | null = null;
/** DiffEditor 不在 `getEditors()` 里——单独登记，主题切换时同批 updateOptions（旧 latent bug 防线） */
const diffEditors = new Set<{ updateOptions(options: Record<string, unknown>): void }>();
/** 最近一次广播载荷里的 token（权威来源，防线 7） */
let payloadVariables: Record<string, string> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const RETRY_MAX = 10;
const RETRY_INTERVAL_MS = 150;

function baseTheme(): Base {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs";
}

/** 读 token：载荷优先 → 内联自定义属性 → 计算样式（防线 7） */
function readVar(name: string): string {
  const fromPayload = payloadVariables?.[name] ?? payloadVariables?.[`--${name}`];
  if (fromPayload != null && String(fromPayload).trim() !== "") return String(fromPayload).trim();
  const inline = document.documentElement.style.getPropertyValue(`--${name}`).trim();
  if (inline) return inline;
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** 把 CSS 颜色（含 var()/color-mix()/命名色）解析成 rgb()/rgba()；失败 → null */
function resolveCssColor(name: string): string | null {
  const raw = readVar(name);
  if (!raw) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^rgba?\(/i.test(raw)) return raw;
  // var()/color-mix()/命名色——交给浏览器求值：探针元素的 computed color 必为 rgb/rgba
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;";
  probe.style.color = `var(--${name})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return /^rgba?\(/i.test(resolved) ? resolved : null;
}

function parseRgba(value: string): [number, number, number, number] | null {
  const m = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  const a = m[4] == null ? 1 : Number.parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.min(1, Math.max(0, a))];
}

function parseHex(value: string): Rgb | null {
  const h = value.trim().replace(/^#/, "");
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return null;
}

function hex2(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
}

/** 取 rgb 分量（hex/rgb/rgba 都收）；解析不出 → null */
function rgbOf(value: string | null): Rgb | null {
  if (!value) return null;
  const hex = parseHex(value);
  if (hex) return hex;
  const p = parseRgba(value);
  return p ? [p[0], p[1], p[2]] : null;
}

/** rgb/rgba → #rrggbb；alpha < 1 时按底色拍平（Monaco 需要实色的件用） */
function toHex(value: string | null, bg: Rgb): string | null {
  if (!value) return null;
  const p = parseRgba(value);
  if (!p) return parseHex(value) ? `#${parseHex(value)!.map(hex2).join("")}` : null;
  const [r, g, b, a] = p;
  return `#${hex2(r * a + bg[0] * (1 - a))}${hex2(g * a + bg[1] * (1 - a))}${hex2(b * a + bg[2] * (1 - a))}`;
}

/**
 * 保留 alpha 的 hex（`#rrggbbaa`）——滚动条/高亮/边框这类件必须半透明，
 * 拍平会变成不透明死块（Monaco 官方主题全用 8 位 hex）。
 */
function toHexA(value: string | null): string | null {
  if (!value) return null;
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.toLowerCase();
  const hex = parseHex(value);
  if (hex) return `#${hex.map(hex2).join("")}ff`;
  const p = parseRgba(value);
  if (!p) return null;
  return `#${hex2(p[0])}${hex2(p[1])}${hex2(p[2])}${hex2(p[3] * 255)}`;
}

/** WCAG 相对亮度 */
function luminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

interface ThemeSpec {
  name: string;
  base: Base;
  rules: MonacoEditorApi.ITokenThemeRule[];
  colors: Record<string, string>;
}

/**
 * 编辑器底色候选：内容面（卡片 solid）优先 → 阅读面 → 窗口底。
 * 每个候选都拍平成实色并与前景比对比度，**不达标（< 4.5）退下一个**——
 * 旧壳把 `bg-card-solid` 算成纯白（提亮叠层去 alpha），暗色主题下会把编辑器刷白。
 */
function pickBackground(fg: Rgb | null): { hex: string; rgb: Rgb } | null {
  const windowSolid = resolveCssColor("bg-window-solid") ?? resolveCssColor("bg-window");
  const windowRgb = rgbOf(windowSolid) ?? [0, 0, 0];
  const candidates = [
    resolveCssColor("bg-card-solid"),
    resolveCssColor("surface-reading"),
    windowSolid,
  ];
  let best: { hex: string; rgb: Rgb } | null = null;
  let bestRatio = -1;
  for (const raw of candidates) {
    const hex = toHex(raw, windowRgb);
    const rgb = hex ? rgbOf(hex) : null;
    if (!hex || !rgb) continue;
    const ratio = fg ? contrast(rgb, fg) : 21;
    if (ratio >= 4.5) return { hex, rgb };
    if (ratio > bestRatio) {
      best = { hex, rgb };
      bestRatio = ratio;
    }
  }
  return best;
}

/** 从生效 token 构建 Monaco 主题；关键字缺失到无法成立 → null（回落内置） */
function buildThemeSpec(): ThemeSpec | null {
  const base = baseTheme();
  const fg = rgbOf(resolveCssColor("text-primary"));
  const bgPick = pickBackground(fg);
  if (!bgPick) return null;
  const bg: Rgb = bgPick.rgb;
  const colors: Record<string, string> = {};
  /** 实色键（按编辑器底色拍平 alpha） */
  const solid = (key: string, raw: string | null) => {
    const hex = toHex(raw, bg);
    if (hex) colors[key] = hex;
  };
  /** 半透明键（保留 alpha）——滚动条/高亮/边框 */
  const alpha = (key: string, raw: string | null) => {
    const hex = toHexA(raw);
    if (hex) colors[key] = hex;
  };

  colors["editor.background"] = bgPick.hex;
  solid("editor.foreground", resolveCssColor("text-primary"));
  if (!colors["editor.foreground"]) return null;

  // 行号 / 光标 / 选区
  solid("editorLineNumber.foreground", resolveCssColor("text-muted") ?? resolveCssColor("text-secondary"));
  solid("editorLineNumber.activeForeground", resolveCssColor("text-primary"));
  solid("editorCursor.foreground", resolveCssColor("accent"));
  alpha("editor.selectionBackground", resolveCssColor("bg-selection"));
  alpha("editor.inactiveSelectionBackground", resolveCssColor("bg-selection"));
  alpha("editor.selectionHighlightBackground", resolveCssColor("bg-selection"));
  alpha("editor.wordHighlightBackground", resolveCssColor("bg-selection"));
  alpha("editor.wordHighlightStrongBackground", resolveCssColor("bg-selection"));
  alpha("editor.lineHighlightBackground", resolveCssColor("bg-input") ?? resolveCssColor("bg-card"));

  // 悬浮件（补全/悬停）——吃卡片 solid，不再拍成纯白
  const widgetBg = resolveCssColor("bg-card-solid") ?? bgPick.hex;
  solid("editorWidget.background", widgetBg);
  alpha("editorWidget.border", resolveCssColor("border"));
  solid("editorSuggestWidget.background", widgetBg);
  alpha("editorSuggestWidget.border", resolveCssColor("border"));
  solid("editorSuggestWidget.foreground", resolveCssColor("text-primary"));
  alpha("editorSuggestWidget.selectedBackground", resolveCssColor("bg-selection"));
  solid("editorHoverWidget.background", widgetBg);
  alpha("editorHoverWidget.border", resolveCssColor("border"));
  solid("editorHoverWidget.foreground", resolveCssColor("text-primary"));
  solid("editorHoverWidget.highlightForeground", resolveCssColor("accent"));
  alpha("editorWidget.shadow", resolveCssColor("context-menu-shadow") ?? resolveCssColor("border"));

  // 滚动条 / 概览标尺（🔴「最边边那条灰」就是它）——跟主题滚条与强调色，不再用 Monaco 中性灰
  alpha("scrollbarSlider.background", resolveCssColor("scrollbar-thumb"));
  alpha("scrollbarSlider.hoverBackground", resolveCssColor("scrollbar-thumb-hover") ?? resolveCssColor("accent"));
  alpha("scrollbarSlider.activeBackground", resolveCssColor("accent"));
  alpha("scrollbar.shadow", resolveCssColor("context-menu-shadow"));
  alpha("editorOverviewRuler.border", resolveCssColor("separator") ?? resolveCssColor("border"));

  // 缩进参考线 / 空白字符 / 括号配对
  alpha("editorIndentGuide.background1", resolveCssColor("border"));
  alpha("editorIndentGuide.activeBackground1", resolveCssColor("text-muted") ?? resolveCssColor("border"));
  alpha("editorWhitespace.foreground", resolveCssColor("text-muted"));
  alpha("editorBracketMatch.background", resolveCssColor("bg-selection"));
  alpha("editorBracketMatch.border", resolveCssColor("accent"));

  // 查找 / 链接 / 诊断色
  alpha("editor.findMatchBackground", resolveCssColor("bg-selection"));
  alpha("editor.findMatchHighlightBackground", resolveCssColor("bg-selection"));
  alpha("editor.findMatchBorder", resolveCssColor("accent"));
  solid("editorLink.activeForeground", resolveCssColor("accent"));
  solid("editorError.foreground", resolveCssColor("error"));
  solid("editorWarning.foreground", resolveCssColor("warning"));
  solid("editorInfo.foreground", resolveCssColor("success"));

  // minimap / 吸顶 / 装订线
  colors["minimap.background"] = bgPick.hex;
  alpha("minimap.selectionHighlight", resolveCssColor("accent"));
  alpha("minimap.findMatchHighlight", resolveCssColor("accent"));
  solid("editorStickyScroll.background", widgetBg);
  alpha("editorStickyScrollHover.background", resolveCssColor("bg-input"));
  colors["editorGutter.background"] = bgPick.hex;

  const name = `ldk-${hash(JSON.stringify({ base, colors }))}`;
  return { name, base, rules: base === "vs-dark" ? DARK_TOKEN_RULES : LIGHT_TOKEN_RULES, colors };
}

function defineThemeSafe(monaco: MonacoNs, spec: ThemeSpec): boolean {
  if (defined.has(spec.name)) return true;
  try {
    monaco.editor.defineTheme(spec.name, {
      base: spec.base,
      inherit: true,
      rules: spec.rules,
      colors: spec.colors,
    });
    defined.add(spec.name);
    return true;
  } catch {
    // 已定义过（同名）或运行时不接受——退回内置，绝不留下未注册的主题名
    defined.add(spec.name);
    const list = (monaco.editor as unknown as { getColorThemes?: () => Array<{ id: string }> }).getColorThemes?.() ?? [];
    return list.some((t) => t.id === spec.name);
  }
}

function applyToEditors(monaco: MonacoNs, theme: string): void {
  const editors = monaco.editor.getEditors?.() ?? [];
  for (const ed of editors) {
    try { (ed as MonacoEditorApi.IStandaloneCodeEditor).updateOptions({ theme }); } catch { /* editor 已销毁 */ }
  }
  for (const ed of diffEditors) {
    try { ed.updateOptions({ theme }); } catch { diffEditors.delete(ed); }
  }
}

/** 当前应使用的 Monaco 主题名——供 editor.create() 初始 options（必须已 define 过） */
export function getMonacoThemeName(): string {
  return currentThemeName ?? baseTheme();
}

/** 登记广播载荷里的 token（`theme:changed` / `accent:changed` 都带）——色值权威来源（防线 7） */
export function setThemeVariables(variables: Record<string, string> | undefined | null): void {
  if (!variables) return;
  payloadVariables = { ...(payloadVariables ?? {}), ...variables };
}

/** 注册 DiffEditor——`getEditors()` 只返回 standalone code editor，DiffEditor 必须单独更新 */
export function registerDiffEditor(editor: MonacoEditorApi.IStandaloneDiffEditor): () => void {
  diffEditors.add(editor as unknown as { updateOptions(options: Record<string, unknown>): void });
  return () => { diffEditors.delete(editor); };
}

function scheduleRetry(monaco: MonacoNs): void {
  if (retryTimer !== null || retryCount >= RETRY_MAX) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryCount += 1;
    syncMonacoTheme(monaco);
  }, RETRY_INTERVAL_MS);
}

export function syncMonacoTheme(monaco: MonacoNs): void {
  const base = baseTheme();
  const spec = buildThemeSpec();
  if (!spec) {
    // 变量还没到（视图挂载早于壳广播）——重试，绝不静默停在原厂配色（防线 8）
    scheduleRetry(monaco);
    if (currentThemeName !== base) {
      currentThemeName = base;
      monaco.editor.setTheme(base);
      applyToEditors(monaco, base);
    }
    return;
  }
  retryCount = 0;
  const theme = defineThemeSafe(monaco, spec) ? spec.name : base;
  currentThemeName = theme;
  // 路径 1：全局 setTheme（通知 VS Code service 层；异步管道可能慢）
  monaco.editor.setTheme(theme);
  // 路径 2：实例级 updateOptions——绕过 StandaloneWorkbenchThemeService 异步竞态
  applyToEditors(monaco, theme);
}

/** 新建的编辑器补应用——`editor.create()` 早于主题定义时不会自己跟上（防线 8） */
export function watchEditorCreation(monaco: MonacoNs): () => void {
  const disposable = (monaco.editor as unknown as {
    onDidCreateEditor?: (cb: () => void) => { dispose(): void };
  }).onDidCreateEditor?.(() => {
    if (currentThemeName && currentThemeName !== baseTheme()) applyToEditors(monaco, currentThemeName);
  });
  return () => disposable?.dispose();
}

export function subscribeThemeSync(monacoNsRef: { readonly current: MonacoNs | null }): () => void {
  // E5.5#7 Bug B fix：必须走 window.linkdesk.events（多 WebView 下 CoreEvents 是隔离实例）。
  // 2026-11-24：accent:changed 也要重算——光标/选区/keyword 受有效强调色影响。
  const lk = window.linkdesk;
  const handle = (payload: unknown) => {
    const vars = (payload as { variables?: Record<string, string> } | null)?.variables;
    setThemeVariables(vars);
    if (monacoNsRef.current) syncMonacoTheme(monacoNsRef.current);
  };
  const offTheme = lk?.events?.on?.("theme:changed", handle) ?? (() => {});
  const offAccent = lk?.events?.on?.("accent:changed", handle) ?? (() => {});
  return () => { offTheme(); offAccent(); };
}

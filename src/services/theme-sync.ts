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
 * 主题颜色取自池文档上的生效 CSS 变量（含玻璃/整窗合成后的 solid 值）；`var()`/`color-mix()` 经
 * 探针元素解析成 rgb 再转 hex。解析不出的键跳过；整组不成立 → 回落内置 vs/vs-dark。
 */
// E5.7#98：Monaco 具体类型——替代 any（monaco: any / rules: any[] / { current: any }）
import type { editor as MonacoEditorApi } from "monaco-editor";
type MonacoNs = typeof import("monaco-editor");
type Base = "vs" | "vs-dark";

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

function baseTheme(): Base {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs";
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** 把 CSS 颜色（含 var()/color-mix()）解析成 rgb()/rgba()；失败 → null */
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

function hex2(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
}

/** rgb/rgba → #rrggbb；alpha < 1 时按底色拍平（Monaco 主题色只收实色） */
function toHex(value: string | null, bg: [number, number, number]): string | null {
  if (!value) return null;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  const p = parseRgba(value);
  if (!p) return null;
  const [r, g, b, a] = p;
  return `#${hex2(r * a + bg[0] * (1 - a))}${hex2(g * a + bg[1] * (1 - a))}${hex2(b * a + bg[2] * (1 - a))}`;
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

/** 从生效 CSS 变量构建 Monaco 主题；关键字缺失到无法成立 → null（回落内置） */
function buildThemeSpec(): ThemeSpec | null {
  const base = baseTheme();
  const bgRaw = resolveCssColor("bg-window-solid") ?? resolveCssColor("bg-window") ?? resolveCssColor("bg-card-solid");
  const fgRaw = resolveCssColor("text-primary");
  if (!bgRaw || !fgRaw) return null;
  const bgRgb = parseRgba(bgRaw);
  const bg: [number, number, number] = bgRgb ? [bgRgb[0], bgRgb[1], bgRgb[2]] : base === "vs-dark" ? [0, 0, 0] : [255, 255, 255];
  const colors: Record<string, string> = {};
  const put = (key: string, v: string | null) => { const hex = toHex(v, bg); if (hex) colors[key] = hex; };

  put("editor.background", bgRaw);
  put("editor.foreground", fgRaw);
  put("editorLineNumber.foreground", resolveCssColor("text-muted") ?? resolveCssColor("text-secondary"));
  put("editorLineNumber.activeForeground", fgRaw);
  put("editorCursor.foreground", resolveCssColor("accent"));
  put("editor.selectionBackground", resolveCssColor("bg-selection"));
  put("editor.inactiveSelectionBackground", resolveCssColor("bg-selection"));
  put("editor.lineHighlightBackground", resolveCssColor("bg-input") ?? resolveCssColor("bg-card"));
  put("editorWidget.background", resolveCssColor("bg-card-solid") ?? bgRaw);
  put("editorWidget.border", resolveCssColor("border"));
  put("editorSuggestWidget.background", resolveCssColor("bg-card-solid") ?? bgRaw);
  put("editorSuggestWidget.border", resolveCssColor("border"));
  put("editorHoverWidget.background", resolveCssColor("bg-card-solid") ?? bgRaw);
  put("editorHoverWidget.border", resolveCssColor("border"));
  put("editorIndentGuide.background1", resolveCssColor("border"));
  put("editorIndentGuide.activeBackground1", resolveCssColor("text-muted") ?? resolveCssColor("border"));
  put("editorGutter.background", bgRaw);

  if (!colors["editor.background"] || !colors["editor.foreground"]) return null;
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

/** 注册 DiffEditor——`getEditors()` 只返回 standalone code editor，DiffEditor 必须单独更新 */
export function registerDiffEditor(editor: MonacoEditorApi.IStandaloneDiffEditor): () => void {
  diffEditors.add(editor as unknown as { updateOptions(options: Record<string, unknown>): void });
  return () => { diffEditors.delete(editor); };
}

export function syncMonacoTheme(monaco: MonacoNs): void {
  const base = baseTheme();
  // 旧防线：先确保内置主题可用（loadThemes:true 已注册；这里再兜一层）
  const spec = buildThemeSpec();
  let theme: string = base;
  if (spec && defineThemeSafe(monaco, spec)) theme = spec.name;
  currentThemeName = theme;
  // 路径 1：全局 setTheme（通知 VS Code service 层；异步管道可能慢）
  monaco.editor.setTheme(theme);
  // 路径 2：实例级 updateOptions——绕过 StandaloneWorkbenchThemeService 异步竞态
  applyToEditors(monaco, theme);
}

export function subscribeThemeSync(monacoNsRef: { readonly current: MonacoNs | null }): () => void {
  // E5.5#7 Bug B fix：必须走 window.linkdesk.events（多 WebView 下 CoreEvents 是隔离实例）。
  // 2026-11-24：accent:changed 也要重算——光标/选区/keyword 受有效强调色影响。
  const lk = window.linkdesk;
  const offTheme = lk?.events?.on?.("theme:changed", () => {
    if (monacoNsRef.current) syncMonacoTheme(monacoNsRef.current);
  }) ?? (() => {});
  const offAccent = lk?.events?.on?.("accent:changed", () => {
    if (monacoNsRef.current) syncMonacoTheme(monacoNsRef.current);
  }) ?? (() => {});
  return () => { offTheme(); offAccent(); };
}

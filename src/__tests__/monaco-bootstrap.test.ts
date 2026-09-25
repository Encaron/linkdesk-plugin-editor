/**
 * monaco-bootstrap——启动编排护栏。E6#150 补测（本格唯一的「可裁决延后」口：先量，再定做/延后）。
 *
 * 本文件钉的是**四条竞态教训在代码里的形状**，不是 Monaco 的功能：
 *   ① `getMonaco()` 在补丁前必须**抛错**（静默返回半初始化命名空间 = 暗色字体黑那个 bug 的入口）；
 *   ② `bootstrapMonaco()` **幂等**、并发共享同一 promise（全局一次）；
 *   ③ 模块顶层就把 `MonacoEnvironment.getWorker` 挂在 `globalThis`，且按 label 分派（TS/HTML 语言
 *      服务全挂、Enter 键失效那个 bug 的防线 = 这个函数必须在）；
 *   ④ `?url` 产物必须经 `new URL(…, import.meta.url)` **锚定**后再交 workerFactory
 *      （E6#15o：直接交相对串会按宿主 document 解析到 app.asar）。
 *
 * 技法：`vi.mock` 替掉 monaco-languageclient 两处 ＋ monaco-editor（整包）＋ 八个 `?url`/`?worker`
 * 资产导入——此处只断言**装配形状**，⛔ 不起真 Worker、⛔ 不碰共享地基。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  useWorkerFactory: vi.fn(),
  wrapperConfigs: [] as unknown[],
  /** 每个 worker 替身带一个可辨识 label，供断言「按 label 分派」 */
  worker: (label: string) => ({
    default: class {
      label = label;
    },
  }),
}));

// 替身照契约：库在 start() 期间调用 config.monacoWorkerFactory 装配 Worker（见源码 setupWorkerFactory）
vi.mock("monaco-languageclient/vscodeApiWrapper", () => ({
  MonacoVscodeApiWrapper: class {
    constructor(public config: { monacoWorkerFactory?: () => void }) {
      h.wrapperConfigs.push(config);
    }
    async start(): Promise<void> {
      await h.start();
      this.config.monacoWorkerFactory?.();
    }
  },
}));

vi.mock("monaco-languageclient/workerFactory", () => ({ useWorkerFactory: h.useWorkerFactory }));

vi.mock("monaco-editor", () => ({ __monaco: true }));

vi.mock("@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js?url", () => ({
  default: "/assets/editor.worker-abc.js",
}));
vi.mock("@codingame/monaco-vscode-api/workers/extensionHost.worker?url", () => ({
  default: "/assets/extensionHost.worker-def.js",
}));
vi.mock("@codingame/monaco-vscode-textmate-service-override/worker?url", () => ({
  default: "/assets/textmate.worker-ghi.js",
}));

vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => h.worker("editor"));
vi.mock("monaco-editor/esm/vs/language/typescript/ts.worker?worker", () => h.worker("ts"));
vi.mock("monaco-editor/esm/vs/language/json/json.worker?worker", () => h.worker("json"));
vi.mock("monaco-editor/esm/vs/language/css/css.worker?worker", () => h.worker("css"));
vi.mock("monaco-editor/esm/vs/language/html/html.worker?worker", () => h.worker("html"));

type BootstrapModule = typeof import("../services/monaco-bootstrap");

let mod: BootstrapModule;

beforeEach(async () => {
  vi.resetModules(); // 模块级 _bootstrapped / _bootstrapPromise 必须每例清零
  h.start.mockClear();
  h.useWorkerFactory.mockClear();
  h.wrapperConfigs.length = 0;
  delete (globalThis as Record<string, unknown>).MonacoEnvironment;
  mod = await import("../services/monaco-bootstrap");
});

describe("monaco-bootstrap · 护栏时序", () => {
  it("未 bootstrap 就 getMonaco() → **抛错**（静默返回 = 暗色字体黑那个 bug 的入口）", async () => {
    await expect(mod.getMonaco()).rejects.toThrow(/monacoBootstrap/);
  });

  it("bootstrapMonaco() 幂等——调两次只装配一次", async () => {
    await mod.bootstrapMonaco(() => Promise.resolve());
    await mod.bootstrapMonaco(() => Promise.resolve());

    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("并发调用只装配一次（两个编辑器同时开也不会各起一套）", async () => {
    // ⚠️ `bootstrapMonaco` 是 async ⇒ 每次调用**都是新 promise**（不能拿引用相等当判据）；
    //    真正的契约是「内部只装配一次」：start 一次、config 只造一份。
    const a = mod.bootstrapMonaco(() => Promise.resolve());
    const b = mod.bootstrapMonaco(() => Promise.resolve());

    await Promise.all([a, b]);
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.wrapperConfigs).toHaveLength(1);
  });

  it("bootstrap 完成后 getMonaco() 给出 monaco 命名空间，且**缓存共享**（第二次拿到同一个对象）", async () => {
    await mod.bootstrapMonaco(() => Promise.resolve());

    const [m1, m2] = await Promise.all([mod.getMonaco(), mod.getMonaco()]);
    expect(m1).toEqual({ __monaco: true });
    expect(m2).toBe(m1);
    expect(await mod.getMonaco()).toBe(m1); // 串行取用也是同一份
  });

  it("送上 config 的三件硬约束：loadThemes:true ＋ EditorService 视图 ＋ 接了壳回调", async () => {
    const openEditor = () => Promise.resolve();
    await mod.bootstrapMonaco(openEditor);

    expect(h.wrapperConfigs).toHaveLength(1);
    const cfg = h.wrapperConfigs[0] as {
      $type: string;
      advanced: { loadThemes: boolean };
      viewsConfig: { $type: string; openEditorFunc: unknown };
      monacoWorkerFactory: unknown;
    };
    expect(cfg.$type).toBe("extended");
    // 教训 1：loadThemes 必须 true，否则 vs-dark 未注册 ⇒ 暗色字体黑
    expect(cfg.advanced.loadThemes).toBe(true);
    // 视图接壳标签页：补丁后 monaco-languageclient 转调这个回调
    expect(cfg.viewsConfig.$type).toBe("EditorService");
    expect(cfg.viewsConfig.openEditorFunc).toBe(openEditor);
    expect(typeof cfg.monacoWorkerFactory).toBe("function");
  });
});

describe("monaco-bootstrap · Worker 装配（模块顶层即生效）", () => {
  it("MonacoEnvironment.getWorker 按 label 分派——TS/JS、json、css 系、html 系、其余兜底", () => {
    const env = (globalThis as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (id: string, label: string) => { label: string };
    };
    expect(env).toBeDefined();

    expect(env.getWorker("", "typescript").label).toBe("ts");
    expect(env.getWorker("", "javascript").label).toBe("ts");
    expect(env.getWorker("", "json").label).toBe("json");
    for (const l of ["css", "scss", "less"]) expect(env.getWorker("", l).label).toBe("css");
    for (const l of ["html", "handlebars", "razor"]) expect(env.getWorker("", l).label).toBe("html");
    expect(env.getWorker("", "plaintext").label).toBe("editor");
  });

  it("workerFactory 拿到的是 **new URL(…, import.meta.url) 锚定**后的绝对串（E6#15o：裸相对串会解析到 app.asar）", async () => {
    await mod.bootstrapMonaco(() => Promise.resolve());

    expect(h.useWorkerFactory).toHaveBeenCalledTimes(1);
    const { workerLoaders } = h.useWorkerFactory.mock.calls[0][0] as {
      workerLoaders: Record<string, () => { url: string; options: { type: string } }>;
    };
    expect(Object.keys(workerLoaders).sort()).toEqual([
      "TextMateWorker",
      "editorWorkerService",
      "extensionHostWorkerMain",
    ]);
    for (const [name, load] of Object.entries(workerLoaders)) {
      const { url, options } = load();
      expect(url, name).toMatch(/^[a-z]+:\/\//); // 已锚定成绝对 URL（不再是 /assets/… 这种根相对串）
      expect(url, name).toContain(".js");
      expect(options.type, name).toBe("module");
    }
  });
});

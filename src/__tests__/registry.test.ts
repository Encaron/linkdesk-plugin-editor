/**
 * registry——lsp-bridge 五份模块级容器的**单一属主**。E6#150 补测。
 *
 * 为什么单独立文件：这五份 Map/Set 是整个 LSP 桥的状态底座，既有测试零断言。源码头注点名了
 * 散开后的病征——「第二份 `_clients` ⇒ 表现为 LSP 客户端重复起 / 状态不刷新」⇒ 键控隔离
 * （按语言 ID）与覆盖语义必须钉住。
 *
 * 模块级容器 ⇒ 每例 `vi.resetModules()` + 动态 `import()` 取一份**全新**注册表（会话二教训：
 * 这条只对纯模块成立，⛔ 不可与 `renderHook` 同用——本文件本就不需要 RTL）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonacoLanguageClient } from "monaco-languageclient";

type RegistryModule = typeof import("../services/lsp-bridge/registry");

let reg: RegistryModule;

/** 客户端替身——注册表只存引用，不碰它的任何成员 */
function client(tag: string): MonacoLanguageClient {
  return { tag } as unknown as MonacoLanguageClient;
}

beforeEach(async () => {
  vi.resetModules();
  reg = await import("../services/lsp-bridge/registry");
});

describe("registry · 客户端表（_clients）", () => {
  it("未注册 → undefined", () => {
    expect(reg.getLspClient("demo")).toBeUndefined();
  });

  it("注册后取回同一实例", () => {
    const c = client("c1");
    reg.setLspClient("demo", c);
    expect(reg.getLspClient("demo")).toBe(c);
  });

  it("重复注册同一语言 → 后者覆盖前者（重启客户端路径，不留旧实例）", () => {
    const first = client("first");
    const second = client("second");
    reg.setLspClient("demo", first);
    reg.setLspClient("demo", second);
    expect(reg.getLspClient("demo")).toBe(second);
  });

  it("按语言 ID 隔离——一个语言有客户端不代表别的语言有", () => {
    reg.setLspClient("demo", client("c1"));
    expect(reg.getLspClient("demo")).toBeDefined();
    expect(reg.getLspClient("demo2")).toBeUndefined();
  });
});

describe("registry · 启动中 promise（_pending）", () => {
  it("未设 → undefined；设了 → 取回同一个 promise", () => {
    expect(reg.getPendingStart("demo")).toBeUndefined();

    const p = Promise.resolve(client("c1"));
    reg.setPendingStart("demo", p);

    expect(reg.getPendingStart("demo")).toBe(p);
  });

  it("clearPendingStart → 回到 undefined（启动结束必须清，否则下次启动被旧 promise 挡住）", () => {
    reg.setPendingStart("demo", Promise.resolve(client("c1")));
    reg.clearPendingStart("demo");
    expect(reg.getPendingStart("demo")).toBeUndefined();
  });

  it("启动中的两个编辑器拿同一个 promise——同语言不各起一个进程", async () => {
    const c = client("c1");
    const p = Promise.resolve(c);
    reg.setPendingStart("demo", p);
    expect(reg.getPendingStart("demo")).toBe(p);
    expect(await reg.getPendingStart("demo")).toBe(c);
  });
});

describe("registry · 档位表（_states）与订阅", () => {
  it("未设过的语言 → undefined（= 这个语言压根没配 LSP）", () => {
    expect(reg.getLspState("demo")).toBeUndefined();
  });

  it("setLspState 后 getLspState 读到最新档位（starting → ready 覆盖）", () => {
    reg.setLspState("demo", "starting");
    expect(reg.getLspState("demo")).toBe("starting");

    reg.setLspState("demo", "ready");
    expect(reg.getLspState("demo")).toBe("ready");
  });

  it("setLspState 通知所有订阅者（语言 ID + 新档位）", () => {
    const a = vi.fn();
    const b = vi.fn();
    reg.onLspStateChange(a);
    reg.onLspStateChange(b);

    reg.setLspState("demo", "failed");

    for (const cb of [a, b]) {
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith("demo", "failed");
    }
  });

  it("退订后不再收到（EditorView 在 mount/unmount 里配对挂摘）", () => {
    const cb = vi.fn();
    const off = reg.onLspStateChange(cb);

    off();
    reg.setLspState("demo", "ready");

    expect(cb).not.toHaveBeenCalled();
  });

  it("订阅是按语言全播的——档位变化不看语言 ID 过滤（订阅者自己按 ID 挑）", () => {
    const cb = vi.fn();
    reg.onLspStateChange(cb);

    reg.setLspState("demo", "starting");
    reg.setLspState("demo2", "starting");

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenNthCalledWith(1, "demo", "starting");
    expect(cb).toHaveBeenNthCalledWith(2, "demo2", "starting");
  });
});

describe("registry · 一次性发言权（_blockedNoticed）", () => {
  it("首次取到 → true；同一语言再取 → false（每轮只出一次声）", () => {
    expect(reg.claimBlockedNotice("demo")).toBe(true);
    expect(reg.claimBlockedNotice("demo")).toBe(false);
    expect(reg.claimBlockedNotice("demo")).toBe(false);
  });

  it("按语言各记各的——一个语言说过了不影响别的语言", () => {
    expect(reg.claimBlockedNotice("demo")).toBe(true);
    expect(reg.claimBlockedNotice("demo2")).toBe(true);
  });

  it("resetBlockedNotice → 新一轮启动，发言权重新发放", () => {
    reg.claimBlockedNotice("demo");
    reg.resetBlockedNotice("demo");
    expect(reg.claimBlockedNotice("demo")).toBe(true);
  });

  it("取发言权**不改档位**——它只是「该不该出声」的判据底料", () => {
    reg.setLspState("demo", "starting");
    reg.claimBlockedNotice("demo");
    expect(reg.getLspState("demo")).toBe("starting");
  });
});

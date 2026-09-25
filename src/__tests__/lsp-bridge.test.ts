/**
 * lsp-bridge（门面）——对外契约：五个转出必须**就是**源头那几个，一个字不许走样。E6#150 补测。
 *
 * 为什么单独立文件：`E6#87c` 把 250 行单文件拆成同名夹，本文件是门面，**消费方 import 路径零变更**
 * 全靠它转出。这类「转发门面」最典型的坏法是：门面自己抄了一份实现（第二份 `_clients` ⇒ LSP
 * 客户端重复起 / 状态不刷新——registry 头注点名的病征），或漏转一个 ⇒ 消费方拿到 `undefined`
 * 而本仓编译不报（TS 在**消费方**才红）。
 *
 * 判据 = **引用相等**（`toBe`），不是「行为相同」：行为相同只能证明「有个能跑的东西」，
 * 引用相等才能证明「没有第二份」。`startLspClient` 也一并比对——它是跳转的最后一环，
 * 漏转的话 F12 直接静默失效。
 */

import { describe, expect, it, vi } from "vitest";
import type { MonacoLanguageClient } from "monaco-languageclient";
import * as facade from "../services/lsp-bridge";
import * as registry from "../services/lsp-bridge/registry";
import * as notice from "../services/lsp-bridge/notice";
import * as start from "../services/lsp-bridge/start";

// 门面会连带加载 start.ts（真库 `monaco-languageclient` 的 barrel 拉进 @codingame 的 `.css`，
// vitest 的 node 管线转不动）——本条测的是**转发契约**，不需要真库 ⇒ 整包替掉，只留类型。
vi.mock("monaco-languageclient", () => ({ MonacoLanguageClient: class {} }));

describe("lsp-bridge 门面（转出一致性）", () => {
  it("registry 转出的三个访问器 = registry 本体那三个（无第二份实现）", () => {
    expect(facade.getLspClient).toBe(registry.getLspClient);
    expect(facade.getLspState).toBe(registry.getLspState);
    expect(facade.onLspStateChange).toBe(registry.onLspStateChange);
  });

  it("notice / start 转出同源", () => {
    expect(facade.takeBlockedNotice).toBe(notice.takeBlockedNotice);
    expect(facade.startLspClient).toBe(start.startLspClient);
  });

  it("门面自己的函数导出面就这五个——多出来的名字意味着有人在门面里另起了实现", () => {
    const fns = Object.entries(facade)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    expect(fns).toEqual(["getLspClient", "getLspState", "onLspStateChange", "startLspClient", "takeBlockedNotice"]);
  });

  it("转出的是同一批模块级容器——经 registry 写的状态，经门面读得到（无「两份 _clients」）", () => {
    const c = { tag: "via-facade" } as unknown as MonacoLanguageClient;
    registry.setLspClient("demo", c);
    expect(facade.getLspClient("demo")).toBe(c);
  });
});

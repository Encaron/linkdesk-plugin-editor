/**
 * notice（takeBlockedNotice）——「现在点跳转也没用」的一次性发言权。E6#150 补测。
 *
 * 为什么单独立文件：它只读 registry 不写，判据全在「档位 + 本轮的发言权」两把锁上，既有测试零断言。
 * 三档语义必须钉住：`starting` / `failed` 该出声（用户按 F12 得到一片安静 = 以为坏了的病根）；
 * `ready` 不出声（正常跳转）；`undefined` 不出声（这个语言本来就没配 LSP，提示它反而是噪音）。
 *
 * 模块级容器在 registry ⇒ 每例 `vi.resetModules()` + 动态 import（registry 先入缓存，notice 拿到同一份）。
 */

import { beforeEach, describe, expect, it } from "vitest";

type RegistryModule = typeof import("../services/lsp-bridge/registry");
type NoticeModule = typeof import("../services/lsp-bridge/notice");

let reg: RegistryModule;
let notice: NoticeModule;

beforeEach(async () => {
  vi.resetModules();
  reg = await import("../services/lsp-bridge/registry");
  notice = await import("../services/lsp-bridge/notice");
});

describe("takeBlockedNotice", () => {
  it("`starting` → 出声一次；再问就没了（F12 连按不刷屏）", () => {
    reg.setLspState("demo", "starting");

    expect(notice.takeBlockedNotice("demo")).toBe("starting");
    expect(notice.takeBlockedNotice("demo")).toBeNull();
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("`failed` → 同样出声一次（起来失败了更要告诉用户）", () => {
    reg.setLspState("demo", "failed");

    expect(notice.takeBlockedNotice("demo")).toBe("failed");
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("`ready` → 恒 null（正常跳转路径，不该弹任何东西）", () => {
    reg.setLspState("demo", "ready");

    expect(notice.takeBlockedNotice("demo")).toBeNull();
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("未设过档位（undefined）→ 恒 null——这个语言本来就没配 LSP，提示反而是噪音", () => {
    expect(notice.takeBlockedNotice("demo")).toBeNull();
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("新一轮启动（resetBlockedNotice）后又能出声一次", () => {
    reg.setLspState("demo", "starting");
    expect(notice.takeBlockedNotice("demo")).toBe("starting");
    expect(notice.takeBlockedNotice("demo")).toBeNull();

    reg.resetBlockedNotice("demo"); // 重启客户端时调用
    expect(notice.takeBlockedNotice("demo")).toBe("starting");
  });

  it("按语言各记各的发言权——py 弹过了，ts 仍能弹", () => {
    reg.setLspState("demo", "starting");
    reg.setLspState("demo2", "starting");

    expect(notice.takeBlockedNotice("demo")).toBe("starting");
    expect(notice.takeBlockedNotice("demo2")).toBe("starting");
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("档位在发声后转 `ready` → 不再出声（发言权已用掉，状态也走了）", () => {
    reg.setLspState("demo", "starting");
    expect(notice.takeBlockedNotice("demo")).toBe("starting");

    reg.setLspState("demo", "ready");
    expect(notice.takeBlockedNotice("demo")).toBeNull();
  });

  it("取声**不改档位**——它只读不写容器（源码头注点名的分工）", () => {
    reg.setLspState("demo", "starting");
    notice.takeBlockedNotice("demo");

    expect(reg.getLspState("demo")).toBe("starting");
    expect(reg.getLspClient("demo")).toBeUndefined();
    expect(reg.getPendingStart("demo")).toBeUndefined();
  });
});

/**
 * forceTextActions 单测——命令面桥（`editor.forceOpenAsText` ⇄ 提示页第三颗钮）。
 *
 * 判据：显式 filePath 优先；缺省 = 唯一登记者（多个取最早登记）；同路径重登记覆盖旧动作，
 * 旧注销器不得误删新登记（闭包身份比对）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerForceTextAction,
  getForceTextAction,
  __resetForceTextActionsForTest,
} from "../services/forceTextActions";

const runA = async (): Promise<void> => {};
const runB = async (): Promise<void> => {};

describe("forceTextActions（命令面桥）", () => {
  beforeEach(() => __resetForceTextActionsForTest());

  it("显式 filePath 取用；未登记 ⇒ null；注销器注销后归 null", () => {
    expect(getForceTextAction("/a.pdf")).toBeNull();
    const off = registerForceTextAction("/a.pdf", runA);
    expect(getForceTextAction("/a.pdf")).toBe(runA);
    off();
    expect(getForceTextAction("/a.pdf")).toBeNull();
  });

  it("缺省取唯一登记者；多个 ⇒ 取最早登记的（命令面板无参场景）", () => {
    registerForceTextAction("/a.pdf", runA);
    registerForceTextAction("/b.png", runB);
    expect(getForceTextAction()).toBe(runA);
  });

  it("同路径重登记覆盖旧动作；旧注销器不误删新登记", () => {
    const off1 = registerForceTextAction("/a.pdf", runA);
    const off2 = registerForceTextAction("/a.pdf", runB);
    off1();
    expect(getForceTextAction("/a.pdf")).toBe(runB);
    off2();
    expect(getForceTextAction("/a.pdf")).toBeNull();
  });
});

/**
 * binaryNoticeToast 单测——toast 文案只承诺**真的渲染出来的钮**（2026-10-06 纠正案加严 V6/V7 同律）。
 *
 * 判据两条：
 * ① 四种组合各对应一个**整句键**（控件可见性 ↔ 文案说没说到那件事，一一对上）；
 * ② 🔴 **恒不提右键菜单**——老文案承诺的「可右键选择打开方式」，对没人认领的扩展名是假话
 *    （`file-tree` 的右键项此时整条隐藏），所以这里钉死「任何组合下都不出现『右键』」。
 */

import { describe, expect, it } from "vitest";
import { binaryNoticeToastKey } from "../components/binaryNoticeToast";

const HEAD = "「{{name}}」无法作为文本显示";

describe("binaryNoticeToastKey", () => {
  it("两颗钮都在 ⇒ 两句都说", () => {
    expect(binaryNoticeToastKey(true, true)).toBe(
      `${HEAD} —— 可用「打开方式」换一种打开，或在市场搜索阅读器`,
    );
  });

  it("只有「打开方式」⇒ 只说它", () => {
    expect(binaryNoticeToastKey(true, false)).toBe(`${HEAD} —— 可用「打开方式」换一种打开`);
  });

  it("只有「在市场搜索阅读器」⇒ 只说它", () => {
    expect(binaryNoticeToastKey(false, true)).toBe(`${HEAD} —— 可在市场搜索阅读器`);
  });

  it("两颗钮都不在（旧壳 + 无市场）⇒ 只说事实，⛔ 不给任何动作", () => {
    expect(binaryNoticeToastKey(false, false)).toBe(HEAD);
  });

  it("🔴 任何组合下都不提右键菜单（那是看不见条件的承诺 = 假话）", () => {
    for (const canOpenWith of [true, false]) {
      for (const canSearchMarket of [true, false]) {
        expect(binaryNoticeToastKey(canOpenWith, canSearchMarket)).not.toContain("右键");
      }
    }
  });

  it("键都是整句（含占位名 head），⛔ 不是拼出来的碎片——译文按整句给", () => {
    for (const canOpenWith of [true, false]) {
      for (const canSearchMarket of [true, false]) {
        expect(binaryNoticeToastKey(canOpenWith, canSearchMarket)).toContain("{{name}}");
      }
    }
  });
});

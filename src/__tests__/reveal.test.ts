/**
 * reveal（focusAt）——三处揭示路径共用的那段动作。E6#150 补测。
 *
 * 为什么单独立文件：mount 双 rAF 定位 / 标签激活 / 跨文件跳转三条链都调它，而三条链外层各有时序
 * （rAF / consume），既有测试都不碰 ⇒ 本函数零断言。它的存在理由就是源码头注那句
 * 「免得三份各写各的、其中一处漏掉 `focus()`（漏了的表现是跳过去了但焦点没跟过去，Ctrl+S 保存错文件）」
 * ⇒ **`focus()` 必须在**，这条要钉住。
 *
 * 替身：只实现被用到的三个成员的**假 editor 对象**（本文件内，⛔ 不动共享地基、⛔ 不搭真视口）。
 */

import { describe, expect, it, vi } from "vitest";
import { focusAt } from "../views/EditorView/reveal";
import type { MonacoEditor } from "../views/EditorView/types";

function fakeEditor() {
  const setPosition = vi.fn();
  const revealPositionInCenter = vi.fn();
  const focus = vi.fn();
  const editor = { setPosition, revealPositionInCenter, focus } as unknown as MonacoEditor;
  return { editor, setPosition, revealPositionInCenter, focus };
}

describe("focusAt", () => {
  it("三件事都做：定位 + 视野中央揭示 + **获焦**（漏 focus 就是「保存错文件」那个 bug）", () => {
    const { editor, setPosition, revealPositionInCenter, focus } = fakeEditor();

    focusAt(editor, 12, 7);

    expect(setPosition).toHaveBeenCalledTimes(1);
    expect(setPosition).toHaveBeenCalledWith({ lineNumber: 12, column: 7 });
    expect(revealPositionInCenter).toHaveBeenCalledTimes(1);
    expect(revealPositionInCenter).toHaveBeenCalledWith({ lineNumber: 12, column: 7 });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("顺序：先定位 → 再揭示 → 最后获焦", () => {
    const { editor, setPosition, revealPositionInCenter, focus } = fakeEditor();

    focusAt(editor, 3, 1);

    const [p, r, f] = [setPosition, revealPositionInCenter, focus].map((m) => m.mock.invocationCallOrder[0]);
    expect(p).toBeLessThan(r);
    expect(r).toBeLessThan(f);
  });

  it("定位与揭示用的是同一个位置对象形态（{lineNumber, column}）——两处不许各造一套", () => {
    const { editor, setPosition, revealPositionInCenter } = fakeEditor();

    focusAt(editor, 42, 9);

    expect(setPosition.mock.calls[0][0]).toEqual(revealPositionInCenter.mock.calls[0][0]);
  });

  it("参数原样透传、本函数**不钳制**（0 / 负数 / 超大行号照传，钳制由 Monaco 自理）——照现状", () => {
    const { editor, setPosition } = fakeEditor();

    focusAt(editor, 0, 0);
    focusAt(editor, -5, -1);

    expect(setPosition).toHaveBeenNthCalledWith(1, { lineNumber: 0, column: 0 });
    expect(setPosition).toHaveBeenNthCalledWith(2, { lineNumber: -5, column: -1 });
  });

  it("本函数不吞异常——editor 已释放时由调用方那一层兜（三处调用点各有时序上下文）", () => {
    const { editor } = fakeEditor();
    (editor.setPosition as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("editor disposed");
    });

    expect(() => focusAt(editor, 1, 1)).toThrow("editor disposed");
  });
});

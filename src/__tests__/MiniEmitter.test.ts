/**
 * MiniEmitter——editor 本地的 pub/sub 工具类。E6#150 补测。
 *
 * 为什么单独立文件：编辑器里「外部重载 / 光标 / 保存」几条链都靠它派发，既有 2 个测试文件
 * （`EditorModel` / `language-map`）都不碰它 ⇒ 退订、错误隔离、dispose 零断言。
 * 错误隔离那条尤其要紧：一个订阅者崩了不能连累其余订阅者（源码里写明的设计）。
 *
 * ⛔ 不动共享地基；本文件零 DOM、零 IPC。
 */

import { describe, expect, it, vi } from "vitest";
import { MiniEmitter } from "../utils/MiniEmitter";

describe("MiniEmitter（editor）", () => {
  it("event 订阅 + fire——每个监听器都收到同一份数据", () => {
    const em = new MiniEmitter<string>();
    const a = vi.fn();
    const b = vi.fn();
    em.event(a);
    em.event(b);

    em.fire("changed");

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith("changed");
    expect(b).toHaveBeenCalledWith("changed");
  });

  it("退订函数摘掉自己——其余监听器不受影响", () => {
    const em = new MiniEmitter<number>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = em.event(a);
    em.event(b);

    offA();
    em.fire(1);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("一个监听器抛错不阻塞其余——错误隔离", () => {
    const em = new MiniEmitter<string>();
    const boom = vi.fn(() => {
      throw new Error("listener boom");
    });
    const after = vi.fn();
    em.event(boom);
    em.event(after);

    expect(() => em.fire("x")).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith("x");
  });

  it("派发中退订——尚未轮到的监听器本轮收不到，且摘掉是持久的", () => {
    const em = new MiniEmitter<string>();
    const seen: string[] = [];
    let offB: (() => void) | undefined;
    em.event(() => {
      seen.push("a");
      offB?.();
    });
    offB = em.event(() => {
      seen.push("b");
    });

    em.fire("x");
    expect(seen).toEqual(["a"]);

    em.fire("y");
    expect(seen).toEqual(["a", "a"]);
  });

  it("dispose 清空全部监听器——之后 fire 静默", () => {
    const em = new MiniEmitter<string>();
    const fn = vi.fn();
    em.event(fn);

    em.dispose();
    em.fire("x");

    expect(fn).not.toHaveBeenCalled();
  });

  it("event 每次取用都是新函数（无记忆化）——照现状钉住：消费者若把它写进依赖数组会每渲染换一次", () => {
    // ⚠️ 与 file-tree 那份同名 MiniEmitter 的行为**不同**（那边 getter 记忆化 ⇒ 同一引用）。
    //    两份都是生产现状，本测试只负责让差异可见——改实现要连同消费者一起看。
    const em = new MiniEmitter<void>();
    expect(em.event).not.toBe(em.event);
  });
});

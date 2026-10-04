/**
 * EditorModel.load —— T1 二进制守卫单测。
 *
 * 覆盖四条：壳判二进制 ⇒ 不解码；壳判文本 ⇒ 照旧解码；**旧壳无 `isBinary` 面 ⇒ 特性探测降级**
 * （走今日纯文本路径，乱码照旧但非新引入）；二进制模型不可保存（防回写抹平原文件）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EditorModel } from "../services/EditorModel";

/* 共享地基只 mock 六个通用命名空间，encoding 面按需在本文件补桩（SDK 头注：专属桩不进共享地基） */
const lk = window.linkdesk as unknown as {
  filesystem: { readBinaryFile: (p: string) => Promise<Uint8Array>; writeTextFile: (p: string, d: string) => Promise<void>; writeBinaryFile: (p: string, d: Uint8Array) => Promise<void> };
  encoding: { detect: (b: Uint8Array) => Promise<string>; decode: (b: Uint8Array, e: string) => Promise<string>; encode: (t: string, e: string) => Promise<Uint8Array>; isBinary?: (b: Uint8Array) => Promise<boolean> };
};

describe("EditorModel.load —— T1 二进制守卫", () => {
  beforeEach(() => {
    lk.filesystem.readBinaryFile = vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00]));
    lk.filesystem.writeTextFile = vi.fn(async () => {});
    lk.filesystem.writeBinaryFile = vi.fn(async () => {});
    lk.encoding = {
      detect: vi.fn(async () => "utf8"),
      decode: vi.fn(async () => "PLAIN TEXT"),
      encode: vi.fn(async () => new Uint8Array()),
    };
  });

  it("壳判二进制 ⇒ 不解码、内容留空、isBinary=true", async () => {
    lk.encoding.isBinary = vi.fn(async () => true);
    const m = await EditorModel.load("/a/paper.pdf");
    expect(m.isBinary).toBe(true);
    expect(m.getValue()).toBe("");
    expect(lk.encoding.decode).not.toHaveBeenCalled();
  });

  it("壳判文本 ⇒ 走今日解码路径", async () => {
    lk.encoding.isBinary = vi.fn(async () => false);
    const m = await EditorModel.load("/a/b.ts");
    expect(m.isBinary).toBe(false);
    expect(m.getValue()).toBe("PLAIN TEXT");
    expect(lk.encoding.decode).toHaveBeenCalled();
  });

  it("旧壳无 isBinary 面 ⇒ 特性探测降级（照旧纯文本，不误判二进制）", async () => {
    delete lk.encoding.isBinary;
    const m = await EditorModel.load("/a/paper.pdf");
    expect(m.isBinary).toBe(false);
    expect(m.getValue()).toBe("PLAIN TEXT");
    expect(lk.encoding.decode).toHaveBeenCalled();
  });

  it("二进制模型 save() 不落盘（防把原文件抹平）", async () => {
    lk.encoding.isBinary = vi.fn(async () => true);
    const m = await EditorModel.load("/a/paper.pdf");
    await expect(m.save()).rejects.toThrow();
    expect(lk.filesystem.writeTextFile).not.toHaveBeenCalled();
    expect(lk.filesystem.writeBinaryFile).not.toHaveBeenCalled();
  });
});

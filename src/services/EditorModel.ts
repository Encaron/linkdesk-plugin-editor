/**
 * E4V#40c EditorModel——文件内容唯一真相源。
 *
 * 每个打开的文件一个 EditorModel 实例。EditorTab（E4V#40f）消费。
 *
 * 职责：
 *   - load()：readBinaryFile → EncodingService.detect → decode
 *   - save()：encode → writeFile
 *   - isDirty()：_value !== _savedValue
 *   - onDidChangeContent / onDidSave：Emitter 通知 UI
 *
 * 设计原则：归一化——编辑器内所有对文件内容的读写走这一个对象。
 * 不散落在 EditorView/EditorTab/快捷键 handler 各写各的。
 */
// E5.6#11.5i：Emitter → 内联 MiniEmitter，EncodingService → lk.encoding.*（async IPC）
import { MiniEmitter } from "../utils/MiniEmitter";
import { getLanguageFromPath } from "./language-map";

const lk = window.linkdesk;

/** EditorModel.load 的选项——forceText：二进制也按文本解码（提示页第三颗钮 / `editor.forceOpenAsText` 命令专用） */
export interface EditorLoadOptions {
  forceText?: boolean;
}

export class EditorModel {
  /** 当前文件路径——E5.8#25.3 setFilePath 可迁移（重命名联动）；save/reload/uri 派生自动切换 */
  filePath: string;
  /** 当前语言——随 setFilePath 从新扩展名重派生 */
  language: string;
  readonly encoding: string;
  /** T1 二进制守卫——壳判定命中：内容**不解码**（解出来是乱码）、**不可保存**（否则回写毁原文件）。
   *  呈现由 EditorTab 画提示块；本标志 = 「这是二进制」这一事实在插件侧的落点。 */
  readonly isBinary: boolean;
  /** 兜底链修复（2026-10-07，D1=乙）——用户在提示页点了「仍旧以该编辑器插件打开」：二进制**按文本**
   *  强制解码出内容。与 isBinary 分开记的理由：isBinary 是壳判定的**事实**，forcedText 是**用户选择**
   *  （只能由第三颗钮 / 命令置位，常规加载永不置位）——保存闸据此放行（写前确认在 useEditorSave）。 */
  readonly forcedText: boolean;

  /** 当前内存中的值 */
  private _value: string;
  /** 上次保存时的值——脏状态比较基准 */
  private _savedValue: string;

  /** 内容变更——EditorView onChange → setValue → fire */
  readonly onDidChangeContent = new MiniEmitter<string>();
  /** 保存成功——EditorTab save → markSaved → fire */
  readonly onDidSave = new MiniEmitter<void>();

  private constructor(filePath: string, content: string, encoding: string, isBinary = false, forcedText = false) {
    this.filePath = filePath;
    this._value = content;
    this._savedValue = content;
    this.encoding = encoding;
    this.isBinary = isBinary;
    this.forcedText = forcedText;
    this.language = getLanguageFromPath(filePath);
  }

  /** Monaco model URI——file:/// 协议，跨文件 TS 解析用 */
  get uri(): string {
    const n = lk.path.normalize(this.filePath);
    return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
  }

  getValue(): string {
    return this._value;
  }

  /**
   * E5.8#25.3——文件重命名/移动后路径迁移。内容（_value/_savedValue）不动 →
   * dirty 状态天然保留（isDirty 比较两者）；uri/save/reload 的派生路径自动切换。
   * 语言随新扩展名重派生（对标 VS Code：改名 .txt→.ts 语言即切换）。
   */
  setFilePath(newPath: string): void {
    this.filePath = lk.path.normalize(newPath);
    this.language = getLanguageFromPath(this.filePath);
  }

  setValue(v: string): void {
    this._value = v;
    this.onDidChangeContent.fire(v);
  }

  /** 是否有未保存的更改 */
  isDirty(): boolean {
    return this._value !== this._savedValue;
  }

  /** 标记为已保存（_savedValue 同步到 _value） */
  markSaved(): void {
    this._savedValue = this._value;
    this.onDidSave.fire();
  }

  /** E5.8#0d.9——从磁盘重载：磁盘内容 ≠ 当前内容 → 返回新内容；无差异（含自己 Ctrl+S）或读失败 → null。
   *  调用方据此决定是否应用/弹确认框——本方法只比较不落盘。
   *  🔴 保持强制态：强制文本模型的 reload 若不带 forceText，重载会退回提示页模型（内容空串），
   *  外部变更比较就会误报「有差异」并把乱码内容顶成空 —— 必须按原态重载。 */
  async reloadFromDisk(): Promise<string | null> {
    try {
      const fresh = await EditorModel.load(this.filePath, { forceText: this.forcedText });
      return fresh.getValue() === this._value ? null : fresh.getValue();
    } catch {
      // 读失败保守 no-op——文件被占用/瞬时删除，等下一次事件再比
      return null;
    }
  }

  /** 从内存内容创建（不解码）——E4V#40n Hot Exit 恢复用 */
  static fromContent(filePath: string, content: string): EditorModel {
    return new EditorModel(lk.path.normalize(filePath), content, "utf-8");
  }

  /** 从磁盘加载文件 */
  static async load(filePath: string, opts?: EditorLoadOptions): Promise<EditorModel> {
    const normalized = lk.path.normalize(filePath);
    const buffer = await lk.filesystem.readBinaryFile(normalized);

    // T1 二进制守卫——判定归壳（lk.encoding.isBinary 一处真相源）。**特性探测**：旧壳没有这个面
    // （本插件可跑在未升级的壳上）⇒ 探测不到就退回今日的纯文本路径（乱码照旧，但不是新引入的 bug）。
    const probe = (lk.encoding as { isBinary?: (b: Uint8Array) => Promise<boolean> } | undefined)?.isBinary;
    const isBinary = typeof probe === "function" ? await probe.call(lk.encoding, buffer) : false;
    if (isBinary && !opts?.forceText) {
      // 二进制不解码（硬解只会得到乱码，还白白跑一遍 detect/decode）；内容留空，由 EditorTab 画提示块
      return new EditorModel(normalized, "", "utf-8", true);
    }

    const encoding = await lk.encoding.detect(buffer);
    const content = await lk.encoding.decode(buffer, encoding);
    // forceText ⇒ 乱码照实显示（D1=乙：可编辑可保存，写前确认在保存管线）；forcedText 只随二进制置位
    return new EditorModel(normalized, content, encoding, isBinary, isBinary);
  }

  /** 保存到磁盘——UTF-8 走文本写入，GBK/UTF-16 走二进制写入保持编码 */
  async save(): Promise<void> {
    // T1：提示页模型（二进制且未强制文本）不作为文本回写——内容根本没解码（_value 是空串），
    // 写下去就是把原文件抹平。forcedText（D1=乙）＝用户显式选择按文本打开 ⇒ 内容已解码，
    // 允许保存；写前确认在保存管线（useEditorSave，每标签会话一次）。
    if (this.isBinary && !this.forcedText) throw new Error("binary-file-not-editable");
    if (this.encoding === "utf-8" || this.encoding === "utf8") {
      await lk.filesystem.writeTextFile(this.filePath, this._value);
    } else {
      // E4V#40w——iconv-lite 编码 → 二进制写入，保持原编码
      const data = await lk.encoding.encode(this._value, this.encoding);
      await lk.filesystem.writeBinaryFile(this.filePath, data);
    }
  }
}

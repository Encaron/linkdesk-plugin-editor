/**
 * forceTextActions——「仍旧以该编辑器插件打开」的**命令面桥**（硬约束 26：每个用户动作至少一条非鼠标路径）。
 *
 * 提示块那颗钮活在 EditorTab 的 React state 里；命令面板（`editor.forceOpenAsText`）够不着组件实例
 * ⇒ 每个二进制提示页标签挂载时把自己的「强制文本」动作登记到这张模块级表，命令面按 filePath 取用。
 * 只登记动作、不持模型——动作闭包归标签所有，标签卸载 / 进入强制态即注销（登记器的返回值即注销器）。
 *
 * 取用口径：显式 filePath 优先；不给 ⇒ 唯一登记者（多个取最早登记的——命令面板场景通常只有一个
 * 提示页在前台；多标签歧义由 params.filePath 消除，plugin.json 的 meta 里写明）。
 */

const actions = new Map<string, () => Promise<void>>();

/** 登记某标签的强制文本动作，返回注销器（标签卸载 / 退出提示页时调用） */
export function registerForceTextAction(filePath: string, run: () => Promise<void>): () => void {
  actions.set(filePath, run);
  return () => {
    if (actions.get(filePath) === run) actions.delete(filePath);
  };
}

/** 取强制文本动作：显式 filePath 优先；缺省 = 唯一登记者（多个取最早登记的）；没有 ⇒ null */
export function getForceTextAction(filePath?: string): (() => Promise<void>) | null {
  if (filePath) return actions.get(filePath) ?? null;
  const first = actions.values().next();
  return first.done ? null : first.value;
}

/** 测试辅助：清空登记表（模块单例，逐用例复位同 `clearFileAssociations` 先例） */
export function __resetForceTextActionsForTest(): void {
  actions.clear();
}

import React from "react";
import { useTranslation } from "react-i18next";
import EditorTab from "./components/EditorTab";
import DiffEditor from "./views/DiffEditor";
import { initHotExit } from "./services/hot-exit";
import { getForceTextAction } from "./services/forceTextActions";
import "./styles/editor.css"; initHotExit();

// 兜底链修复（2026-10-07，硬约束 26）——提示页第三颗钮的非鼠标路径：命令面板直达。
// 动作本体在 EditorTab 的 React state 里 ⇒ 命令面经 forceTextActions 登记表按 filePath 取用；
// 没有处于提示页的标签时静默 no-op（命令对「不适用」场景不报错，与探面隐藏同律）。
const cmds = window.linkdesk?.commands as unknown as {
  registerCommand?: (id: string, handler: (params?: { filePath?: string }) => Promise<void>) => void;
} | undefined;
if (cmds?.registerCommand) {
  cmds.registerCommand("editor.forceOpenAsText", async (params) => {
    const run = getForceTextAction(params?.filePath);
    if (run) await run();
  });
}

const EditorPlugin: React.FC<{ isActive?: boolean; tabId?: string; sourceId?: string }> = ({ sourceId: propId, isActive, tabId }) => {
  // E5#84 → E5.7#98：filePath 单通道——pool 经 props 传入（PluginComponent sourceId）。
  // 原 IPC 优先通道（pluginRequest.handle("openFile")）随 E5.7#43 整删（preload-pool
  // 不再暴露 pluginRequest），死 no-op 代码摘除（serial-monitor 同款）。
  // E5.7 fix（2026-08-16）：isActive 原被硬编码丢弃——keep-alive 下每个标签都自认激活，
  // EditorView 激活 focus / autoSave onFocusChange 全部死链 → Ctrl+S 打错编辑器。
  // 透传 PluginComponent 的真实 isActive（契约：{ isActive, tabId?, sourceId? }）。
  // tabId 同透传——tab:focusRequested 点击聚焦订阅的匹配键（点已激活标签 isActive
  // 不翻转，需点击事件补焦——分屏 Ctrl+S 保存错文件场景）。
  const { t } = useTranslation();
  const fp = propId;
  if (!fp) return <div>{t("编辑器（双击文件打开）")}</div>;
  if (fp.includes("|||")) { const [o, m] = fp.split("|||"); return <DiffEditor originalPath={o} modifiedPath={m} isActive={!!isActive} />; }
  return <EditorTab filePath={fp} isActive={!!isActive} tabId={tabId} />;
};
export default EditorPlugin;

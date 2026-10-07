/**
 * E4V#40f EditorTab——文件打开/保存接线。
 *
 * 这是"编辑器标签页"的 React 组件——index.tsx 中收到 sourceId（filePath）后渲染它。
 *
 * 职责：
 *   - mount 时 EditorModel.load(filePath) → 得到 model
 *   - 渲染 EditorView——传入 value/language/filePath/isActive
 *   - onChange → model.setValue → 检测脏状态 → 更新标签栏标题（● 前缀）
 *   - Ctrl+S → onSave → model.save() → markSaved → 清除 ●
 *   - 保存失败 toast 报错（只读/权限不足/磁盘满）
 *   - E4V#40j——渲染 EditorStatusBar（行:列/编码/语言/缩进/EOL）
 *
 * E6#87c：原 443 行单文件拆为同名夹，本文件 = **门面**（components/ 用夹内门面的形态）。
 * 消费方 import 路径零变更；state → 各管线 hook → 本门面只负责组装与渲染。
 */
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import EditorView from "../views/EditorView";
import type { EditorViewHandle } from "../views/EditorView";
import EditorStatusBar from "./EditorStatusBar";
import EditorBreadcrumb from "./EditorBreadcrumb";
import BinaryNotice from "./BinaryNotice";
import { Button } from "@linkdesk/ui";
import type { EditorTabProps } from "./EditorTab/types";
import { useEditorTabState } from "./EditorTab/useEditorTabState";
import { useEditorStatus } from "./EditorTab/useEditorStatus";
import { useMonacoOptions } from "./EditorTab/useMonacoOptions";
import { useEditorLoad } from "./EditorTab/useEditorLoad";
import { useEditorRename } from "./EditorTab/useEditorRename";
import { useEditorSave } from "./EditorTab/useEditorSave";
import { useEditorExternalReload } from "./EditorTab/useEditorExternalReload";
import { useEditorTabFocus } from "./EditorTab/useEditorTabFocus";
import { useEditorForceText } from "./EditorTab/useEditorForceText";

export type { EditorTabProps } from "./EditorTab/types";

const EditorTab: React.FC<EditorTabProps> = ({ filePath, isActive, tabId }) => {
  const { t } = useTranslation();
  const state = useEditorTabState(filePath);
  const { editorStatus, patchStatus, handleCursorChange, handleLspStateChange, handleEditorMount } = useEditorStatus();
  // E4V#40q——EditorView ref → 运行时 updateOptions
  const editorViewRef = useRef<EditorViewHandle>(null);
  // E4V#40q——编辑器选项（异步加载配置）
  const editorOptions = useMonacoOptions(editorViewRef);

  useEditorLoad(state, t, patchStatus);
  useEditorRename(state, patchStatus);
  const { markClean, handleSave, handleChange } = useEditorSave(state, t, isActive);
  useEditorExternalReload(state, t, markClean, editorViewRef);
  useEditorTabFocus(editorViewRef, tabId);
  // 兜底链修复（2026-10-07）——强制文本态：第三颗钮 / 退回提示页的状态与动作（含命令面登记）
  const { showNotice, handleForceText, backToNotice } = useEditorForceText(state, t, patchStatus);

  if (state.loading) {
    return <div>{t("加载中…")}</div>;
  }

  if (state.error) {
    return <div>{state.error}</div>;
  }

  if (!state.model) {
    return <div>{t("无法打开文件")}</div>;
  }

  const m = state.model;

  // T1 二进制守卫——壳判定命中且未强制文本：不挂 Monaco（内容没解码，挂上去就是一片乱码），画提示块。
  // 提示块自带面包屑；状态栏（行:列/编码/语言）对提示块无意义，一并省掉。
  // 强制文本态（D1=乙）：内容已按文本解码 ⇒ Monaco 可编辑可保存（写前确认在保存管线），
  // 顶部细警示条声明状态 ＋「退回提示页」（再点第三颗钮直接回来，不重读盘）。
  const forcedBar = m.isBinary && !showNotice;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorBreadcrumb filePath={m.filePath} />
      {forcedBar && (
        <div className="editor-forced-text-bar">
          <span>{t("已按文本强制打开 · 可编辑（保存前会确认：写回会覆盖原二进制内容）")}</span>
          <Button variant="ghost" onClick={backToNotice}>
            {t("退回提示页")}
          </Button>
        </div>
      )}
      {m.isBinary && showNotice ? (
        <BinaryNotice filePath={m.filePath} onForceText={handleForceText} />
      ) : (
        <>
          {/* E4V#40q——编辑器选项（异步加载自 lk.configuration） */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <EditorView
              ref={editorViewRef}
              value={state.value}
              language={m.language}
              filePath={m.filePath}
              isActive={isActive}
              onChange={handleChange}
              onSave={handleSave}
              onCursorChange={handleCursorChange}
              onEditorMount={handleEditorMount}
              onLspStateChange={handleLspStateChange}
              options={editorOptions}
            />
          </div>
          <EditorStatusBar {...editorStatus} />
        </>
      )}
    </div>
  );
};

export default EditorTab;

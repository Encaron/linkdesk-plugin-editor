/**
 * 强制文本态（兜底链修复 2026-10-07，D1=乙）——提示页第三颗钮 ＋「退回提示页」的状态与动作。
 *
 * showNotice 口径：二进制且（未强制 ‖ 用户点了退回）⇒ 画提示块；其余照常画 Monaco。
 * 已强制过再退回 ⇒ 再点第三颗钮**直接复用已解码的 model**（不重读盘——每标签会话口径，
 * 乱码内容不变就没必要再跑一遍 detect/decode）。
 * 命令面动作（`editor.forceOpenAsText`）在标签处于提示页时登记进 forceTextActions，退出即注销。
 */
import { useCallback, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { EditorModel } from "../../services/EditorModel";
import { registerForceTextAction } from "../../services/forceTextActions";
import type { EditorTabState, PatchStatus } from "./types";

export function useEditorForceText(
  state: EditorTabState,
  t: TFunction,
  patchStatus: PatchStatus,
): {
  showNotice: boolean;
  handleForceText: () => Promise<void>;
  backToNotice: () => void;
} {
  const { model, setModel, setValue, setLoading, setError, initialFilePathRef } = state;
  const [returnedToNotice, setReturnedToNotice] = useState(false);

  const showNotice = !!model?.isBinary && (!model.forcedText || returnedToNotice);

  const handleForceText = useCallback(async () => {
    try {
      setLoading(true);
      // 已解码过（退回再进）⇒ 直接复用不重读盘；首次 ⇒ 按文本强制加载（乱码照实显示）
      const forced =
        model?.forcedText && model.isBinary
          ? model
          : await EditorModel.load(initialFilePathRef.current, { forceText: true });
      setModel(forced);
      setValue(forced.getValue());
      patchStatus({ encoding: forced.encoding, language: forced.language });
      setReturnedToNotice(false);
    } catch (err) {
      console.error(`[EditorTab] 强制文本加载失败: ${initialFilePathRef.current}`, err);
      setError(`${t("无法打开文件")}: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [model, initialFilePathRef, setModel, setValue, setLoading, setError, patchStatus, t]);

  const backToNotice = useCallback(() => setReturnedToNotice(true), []);

  // 命令面（editor.forceOpenAsText）：处于提示页时登记本标签的动作；进入强制态 / 卸载即注销
  useEffect(() => {
    if (!model?.isBinary || model.forcedText) return;
    return registerForceTextAction(model.filePath, handleForceText);
  }, [model, handleForceText]);

  return { showNotice, handleForceText, backToNotice };
}

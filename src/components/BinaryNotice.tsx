/**
 * T1 二进制守卫——「此文件无法作为文本显示」提示块。
 *
 * 判定归壳（`lk.encoding.isBinary`，一处真相源），**呈现归被兜底的插件**——本块是 editor 自绘的
 * 私有视图件（D10：⛔ 不预造 `@linkdesk/ui` 共享件，第二个真实消费者出现才共享）。
 *
 * 两颗钮一律**特性探测接线**，面/命令不在就隐藏（⛔ 不留死钮，与 E17/E39 同律）：
 *   - 「打开方式…」——T2 的选择器命令（`file-tree.openWith`）尚未落地 ⇒ 命令不存在 ⇒ 隐藏；
 *     T2 落地后此处零改动自动显形。首参 = 文件路径。
 *   - 「在市场搜索阅读器」——市场插件被卸载/禁用 ⇒ 隐藏。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const lk = () => window.linkdesk;

/** T2 选择器命令 id（file-tree 提供）——未落地前探测不到 ⇒ 按钮隐藏 */
const OPEN_WITH_COMMAND = "file-tree.openWith";
/** 市场插件 id——揭示其侧栏容器（与点图标栏同一路径） */
const MARKETPLACE_PLUGIN_ID = "marketplace";

export default function BinaryNotice({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const [canOpenWith, setCanOpenWith] = useState(false);
  const [canSearchMarket, setCanSearchMarket] = useState(false);

  const fileName = useMemo(() => filePath.split(/[\\/]/).pop() || filePath, [filePath]);

  // 探面：命令在不在 / 市场插件在不在（旧壳或插件缺席 ⇒ 按钮隐藏，不留死钮）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cmds = await lk().commands?.getCommands?.();
        if (!cancelled) setCanOpenWith(!!cmds?.some((c) => c.id === OPEN_WITH_COMMAND));
      } catch { /* 探测失败 = 面不在 */ }
      try {
        const list = await lk().pluginManager?.list?.();
        if (!cancelled) setCanSearchMarket(!!list?.some((p) => p.pluginId === MARKETPLACE_PLUGIN_ID));
      } catch { /* 同上 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 右下角 toast——本块随标签挂载一次，故每次打开只弹一次
  useEffect(() => {
    lk().notifications?.show?.(
      t("「{{name}}」无法作为文本显示 —— 可右键选择打开方式或在市场搜索阅读器", { name: fileName }),
      { type: "warning", source: "editor" },
    );
  }, [t, fileName]);

  const handleOpenWith = useCallback(() => {
    lk().commands?.executeCommand?.(OPEN_WITH_COMMAND, filePath).catch(() => { /* 命令自会提示失败 */ });
  }, [filePath]);

  const handleSearchMarket = useCallback(() => {
    // 市场侧栏的搜索词是市场插件**内部** state（无跨插件入口）⇒ v1 只能把市场侧栏揭示出来，
    // 与点图标栏走同一条 icon:selected 路径。已在市场容器上则不再发——那条路对同容器是「折叠」语义。
    // `pool.getLayout` 是「读本窗最近一次布局快照」的同步面；旧壳/脱出窗探测不到 ⇒ 退化为直接发。
    type LayoutProbe = { getLayout?: () => { sidebar?: { containerId?: string | null } } | null };
    const probe = (lk().pool as unknown as LayoutProbe | undefined)?.getLayout;
    const current = typeof probe === "function" ? probe.call(lk().pool)?.sidebar?.containerId : undefined;
    if (current === MARKETPLACE_PLUGIN_ID) return;
    lk().events?.emit("icon:selected", MARKETPLACE_PLUGIN_ID);
  }, []);

  return (
    <div className="editor-binary-notice">
      <div className="editor-binary-notice-title">{t("此文件无法作为文本显示")}</div>
      <div className="editor-binary-notice-desc">
        {t("「{{name}}」是二进制文件，以文本打开只会得到乱码。", { name: fileName })}
      </div>
      <div className="editor-binary-notice-actions">
        {canOpenWith && (
          <button type="button" className="editor-binary-notice-btn primary" onClick={handleOpenWith}>
            {t("打开方式…")}
          </button>
        )}
        {canSearchMarket && (
          <button type="button" className="editor-binary-notice-btn" onClick={handleSearchMarket}>
            {t("在市场搜索阅读器")}
          </button>
        )}
      </div>
    </div>
  );
}

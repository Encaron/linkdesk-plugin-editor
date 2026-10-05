/**
 * T1 二进制守卫——「此文件无法作为文本显示」提示块。
 *
 * 判定归壳（`lk.encoding.isBinary`，一处真相源），**呈现归被兜底的插件**。
 *
 * 两颗钮：① 视觉一律用共享 `Button`（壳按钮同一套主题/字号/hover——⛔ 不再手搓 `<button>`）；
 * ② 动作**探测接线**：面/命令不在就隐藏（⛔ 不留死钮，与 E17/E39 同律）。
 *   - 「在市场搜索阅读器」——市场插件被卸载/禁用 ⇒ 隐藏。
 *   - 「打开方式…」——宿主命令 `SHELL_COMMANDS.openWith`（SDK 子路径 `@linkdesk/plugin-sdk/shell-commands`）不在册 ⇒ 隐藏。
 *     旧写法（本纠正案已废止）是拿一个 `OPEN_WITH_WIRED` **硬编码开关**顶替探测——那是把
 *     「宿主有没有实现」写死在插件里，必然过期；现在探测的是**命令注册面**这个事实。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@linkdesk/ui";
import { SHELL_COMMANDS, openWith } from "@linkdesk/plugin-sdk/shell-commands";

const lk = () => window.linkdesk;

/** 市场插件 id——揭示其侧栏容器（与点图标栏同一路径） */
const MARKETPLACE_PLUGIN_ID = "marketplace";

/** 本文件路径的扩展名（无点、小写）——`{ uri }` 之外补个 `ext`，面板按类型选处理器时不必再猜 */
function extOf(filePath: string): string | undefined {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : undefined;
}

export default function BinaryNotice({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const [canSearchMarket, setCanSearchMarket] = useState(false);
  const [canOpenWith, setCanOpenWith] = useState(false);

  const fileName = useMemo(() => filePath.split(/[\\/]/).pop() || filePath, [filePath]);

  // 探面：市场插件在不在（旧壳或插件缺席 ⇒ 按钮隐藏，不留死钮）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await lk().pluginManager?.list?.();
        if (!cancelled) setCanSearchMarket(!!list?.some((p) => p.pluginId === MARKETPLACE_PLUGIN_ID));
      } catch { /* 探测失败 = 面不在 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 探面：宿主「打开方式」命令在不在册（⛔ 不看 `placeholder` 标记——那条路会说谎，见文件头）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await lk().commands?.getCommands?.();
        if (!cancelled) setCanOpenWith(!!list?.some((c) => c?.id === SHELL_COMMANDS.openWith));
      } catch { /* 探测失败 = 面不在 */ }
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
    // 编辑器手上就是一个真实文件 ⇒ 给 `uri`（面板居中升起，无 anchor）
    openWith({ uri: filePath, name: fileName, ext: extOf(filePath) });
  }, [filePath, fileName]);

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
          <Button variant="ghost" onClick={handleOpenWith}>
            {t("打开方式…")}
          </Button>
        )}
        {canSearchMarket && (
          <Button variant="ghost" onClick={handleSearchMarket}>
            {t("在市场搜索阅读器")}
          </Button>
        )}
      </div>
    </div>
  );
}

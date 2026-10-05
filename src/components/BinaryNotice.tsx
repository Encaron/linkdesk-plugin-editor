/**
 * T1 二进制守卫——「此文件无法作为文本显示」提示块。
 *
 * 判定归壳（`lk.encoding.isBinary`，一处真相源），**呈现归被兜底的插件**——本块是 editor 自绘的
 * 私有视图件（D10：⛔ 不预造 `@linkdesk/ui` 共享件，第二个真实消费者出现才共享）。
 *
 * 两颗钮一律**探测接线**，面/命令不在就隐藏（⛔ 不留死钮，与 E17/E39 同律）：
 *   - 「在市场搜索阅读器」——市场插件被卸载/禁用 ⇒ 隐藏。
 *   - 「打开方式…」——见 `OPEN_WITH_WIRED`：接线留着，但宿主侧动作**尚未实现**，故先不显示。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const lk = () => window.linkdesk;

/** 选择器命令 id（file-tree 提供）。首参 = 文件路径——该接口对面已固定。 */
const OPEN_WITH_COMMAND = "file-tree.openWith";

/**
 * 「打开方式…」是否上屏——**宿主侧动作落地前必须为 false**。
 *
 * 🔴 为什么不是一个「命令在不在」的探测（实测读数，2026-10-05 dev）：
 *   `commands.getCommands()` 里**每一条插件声明的命令**都带 `placeholder: true`——那是
 *   「元数据由 loader 注册、执行转发给池」的**路由标记**，不是「有没有实现」的判据
 *   （`file-tree.openFile` / `file-tree.revealInOS` 这些**真能跑**的命令同样是 true）。
 *   第 1 波时 `file-tree.openWith` 在 file-tree 的 manifest 里挂着、实现未接（描述自陈
 *   「占位命令——未接实现，调用无效果」）⇒ 探测只会得到一个**点了没反应的空钮**。
 *   ⇒ 宿主未实现前，唯一诚实的表达就是不显示它。
 * ✅ 2026-10-05 第 3 波（AI-3）：file-tree 1.0.27 已真接 `file-tree.openWith`（打开方式选择器，
 *   命令收 filePath 字符串或 { uri, anchor } 上下文，旧宿主/无面时命令自身 no-op）⇒ 本旗翻 true，
 *   钮上屏（T1 交付判据③的「特性开关式接线」在此合龙）。
 */
const OPEN_WITH_WIRED = true;
/** 市场插件 id——揭示其侧栏容器（与点图标栏同一路径） */
const MARKETPLACE_PLUGIN_ID = "marketplace";

export default function BinaryNotice({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const [canSearchMarket, setCanSearchMarket] = useState(false);

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
        {OPEN_WITH_WIRED && (
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

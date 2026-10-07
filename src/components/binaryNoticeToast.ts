/**
 * binaryNoticeToast——T1 二进制守卫的 toast 文案**选键**（纯函数，零 React、零 window.linkdesk）。
 *
 * ## 为什么单摘一个文件
 *
 * 文案是**用户可见的承诺**：老写法恒说「可右键选择打开方式」，而右键里那一项的条件是
 * 「该扩展名有 handler ＋ 宿主命令在册」（`file-tree/src/components/FileTreeContextMenu/Menu.tsx`）——
 * 对**没人认领**的扩展名，那一项整条隐藏 ⇒ 这句承诺是**假话**（与纠正案「不留死钮」同律：
 * 说当下为真的话，没把握就别说）。
 *
 * ⇒ 口径：**只描述真的渲染出来的钮**——「打开方式…」/「在市场搜索阅读器」两颗看探面
 * （`canOpenWith` / `canSearchMarket`），「仍旧以该编辑器插件打开」（兜底链修复 2026-10-07）
 * 是**本插件自有动作、恒在** ⇒ 四种组合都提「文本方式」这条第三路（D3 拍板：提第三路）。
 * ⛔ 不再提右键菜单（编辑器看不见它的条件）。
 *
 * 摘成纯函数是为了**测得动**：四种组合 × 输出键，一条判据一张表（`src/__tests__/binaryNoticeToast.test.ts`）。
 * 四个键都是**整句**（不是拼出来的）——译文按整句给，避免各语言语序拼错。
 */

/** 首句：恒定不变的事实（这块提示的标题本身就是它） */
const HEAD = "「{{name}}」无法作为文本显示";

/** 第三路（恒在的那颗钮）——四种组合都收尾在它上面 */
const FORCE = "或仍以文本方式打开";

/**
 * 选 toast 的文案键（key = 中文原文，译文住 `i18n/en.json`）。
 *
 * @param canOpenWith 宿主「打开方式」命令在册（决定第一颗钮出不出）
 * @param canSearchMarket 市场插件在场（决定第二颗钮出不出）
 */
export function binaryNoticeToastKey(canOpenWith: boolean, canSearchMarket: boolean): string {
  if (canOpenWith && canSearchMarket)
    return `${HEAD} —— 可用「打开方式」换一种打开，或在市场搜索阅读器，${FORCE}`;
  if (canOpenWith) return `${HEAD} —— 可用「打开方式」换一种打开，${FORCE}`;
  if (canSearchMarket) return `${HEAD} —— 可在市场搜索阅读器，${FORCE}`;
  return `${HEAD} —— ${FORCE}`;
}

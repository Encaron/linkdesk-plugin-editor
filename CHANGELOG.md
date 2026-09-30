# 更新日志

## v1.0.16（2026-09-30）

- **自有翻译归位（E6#161「谁的仓谁译文」）**：本仓 7 条可渲染文案的英文译名住进**本仓字典** `i18n/en.json`（新增 7 条） ＋ `contributes.i18n` 声明——不再依赖 `lang-defaults` 代管：文案在本仓声明、译名却在别的仓的字典里，本仓加一条声明那只仓无从跟上（跨仓追不上）。译名取值：池里现成的照抄（同键同值 ⇒ 按 E6#161「同值覆盖不出声」规则运行时零变化），池里没有的 1 条新写。
- **判据随 SDK 下发**：`@linkdesk/plugin-sdk` ^0.1.46 → **^0.1.61**——`npm run verify` 第 ⑧ 段「自有字典覆盖度」（manifest 渲染串缺口 🔴 / 源码 `t()` 缺口 ⚠️）由 `@linkdesk/plugin-sdk/own-dict-coverage` 判定（判据本体在 SDK，⛔ 不在本仓复制）。
- **版本真源同步**：`package.json` 1.0.13（此前与 `plugin.json` 1.0.15 不同步）随本笔对齐到 **1.0.16**。

## v1.0.15（2026-09-28）

- **删两条死命令声明**（M2 AI#28 尺子附带名单的复核裁决）：`editor.reopenClosedEditor`／`editor.compareFiles` 在 plugin.json 里挂着标题、却在**任何地方都没有 handler**——本仓源码零处 `registerCommand`，壳侧也没有这两条 id（"重新打开已关闭的编辑器"真正的实现是壳命令 `workbench.action.reopenClosedEditor`，Ctrl+Shift+T；"比较文件"那件事的实现是 file-tree 的 `file-tree.selectForCompare` ＋ `file-tree.compareWithSelected`）。这两条是编辑器内迁插件仓之前、命令 id 还是 `editor.*` 时代的残留。
- **为什么不补 description 而是删**：声明会进命令索引（AI 选命令、快捷键列表都看得到）——给一条**永远不会执行成功**的命令补说明，等于在索引里立两块指向空地的路牌，比没有更糟。删掉之后索引少两条假条目；真实能力**一条没少**（两条都各自有活的等价命令，且都有快捷键/命令路径）。仓库外若有人把用户快捷键绑到这两条旧 id 上，它们在今天也同样从未生效过——删除不改变任何行为。
- 版本 1.0.14 → **1.0.15**（PATCH）。无代码变化，纯 manifest 订正。

## v1.0.14（2026-09-20）

- **删四处死类名引用**（E6#136 普查裁决）：`editor-container`／`editor-empty`／`editor-error`／`editor-loading` 在仓内 CSS 零定义、querySelector 式消费零处——SDK 新腿（0.1.44 自有类名引用悬空判据）指出它们是「挂了名但没有样式」的死引用（分属 `src/index.tsx`、`src/components/EditorTab.tsx`、`src/views/DiffEditor.tsx`）。删掉 className 里的死名，DOM 结构与渲染结果零变化，无功能变化。



## v1.0.13（2026-09-19）

- **重打可复现**：@linkdesk/plugin-sdk 0.1.42 起 zip 目录条目时间戳钉死，同一份源码重打逐字节一致。插件内容零变化（仅 plugin.json 版本号随包更新）。

## v1.0.12（2026-09-17）

- **设置键带上归属**（E6#111n-2）：`files.autoSave` → `editor.autoSave`——本键原住在 `files.*` 公共前缀下（与 `file-tree` 的 `files.exclude` 同族），但它由本插件声明与消费，前缀对不上归属。本版起归入本插件命名空间，
  词干一字未动（值域 `off` / `afterDelay` / `onFocusChange` 与默认值 `off` 全部不变）
- **老用户的值不会丢**：宿主侧的改名迁移带 `next in schema` 门禁（新名没被声明就不搬），1.42 那一轮因此**正确地跳过**了本键（当时本仓还声明着旧名）。
  本版发布后新名进宿主 schema，**下一次启动自动把用户已存的旧值搬到新名下**——无需任何手动操作
- 无功能变化——本版只为让设置键与插件身份对齐

## v1.0.11（2026-09-15）

- **分发件补上 MIT LICENSE**：`LICENSE` 早就在本仓里（E6#108g 那批加的），但**已发布的那版产物比它早** ⇒ 用户手上那份 zip 里一直没有版权声明。MIT 要求「副本里带声明」，而 zip 才是用户真正拿到的那份
- **不再夹带仓库面文件**：`@linkdesk/plugin-sdk` 升到 0.1.19（^0.1.14 → ^0.1.19）——旧 SDK 的打包通道会把 `marketplace.json` / `scripts/ci-verify.mjs` / `AGENTS.md` 这类**仓库面文件**一起装进 zip（那是给仓库看的，不是给用户看的），0.1.19 的排除表已覆盖
- 无功能变化——本版只为让「用户拿到的产物」与仓库对齐

## v1.0.10（2026-09-14）

- 源码迁入独立仓（E6#99，L7 第 7.2 轮）——从壳仓 `Encaron/linkdesk` 抽出本插件子树，历史全保（hash 变）
- 随包 `plugin.json` 显式声明 `pluginId`（E6#98g）：插件身份不再靠目录名兜底，独立仓构建出的包名与身份稳定
- `$schema` 改指本仓 `node_modules/@linkdesk/plugin-sdk`（脱离壳仓后原相对路径指到仓外，编辑器补全/校验会失效）


## v1.0.9（2026-09-11）

- 三张图归位到 `resources/`（E6#93a 资源与目录归位）：身份图与场景封面搬进约定目录，README 相对引用同步改写；未被任何地方引用的 `cover-brutalist.svg`（E6#68 的 A/B 备选稿）删除

## v1.0.8（2026-09-11）

- 更新记录迁入包内的 `CHANGELOG.md`（E6#92 元数据归一）——此前写在 `plugin.json` 的 `changelog` 字段里，市场详情页读不到

## v1.0.7（2026-09-11）

- 内部整理（E6#87c 文件整理层）：标签页 / 主视图 / LSP 桥三处超大文件按体积上限拆为同名夹，LSP 的五份模块级容器集中到 registry.ts 单一属主——功能与界面零变化

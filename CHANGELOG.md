# Changelog

MyWorkbench 2.0 的版本记录。2.0 与 1.x（`json-formatter-workbench` 仓库 main / vue 分支）是不同的技术栈与代码库，版本号从 2.0.0-alpha 起步。

## [2.0.0-alpha.2] - 2026-11-18

视觉打磨 + 主题系统升级（骨架仍不含业务逻辑）：

- **主题 6 档 + 跟随系统**：Light / Dark 规范档保留，加回用户喜欢的 Tokyo Night（深海军蓝 #1a1b26，1.x 配色原样移植，logo 蓝紫渐变），新增三个 signature 主题——Paper 暖纸（暖米纸色 + 琥珀）、Terminal 终端绿（磷光绿黑底）、Sakura 樱花（柔和粉紫）；每档有自己的主色、品牌渐变与 JSON 语法色。顶栏主题切换改成下拉选择（色板圆点 + 中文名 + 英文名 + 一句话描述），⌘K 命令面板可直接切主题；切换仍平滑无闪烁（首绘前内联脚本定主题）。
- **视觉打磨**：侧边栏加「工具」分组、激活态左侧主题色指示条 + 彩色图标、logo 改主题渐变、底部版本 chip + ⌘K 提示；顶栏改成搜索式 ⌘K 按钮、面包屑带工具图标与首页链接；命令面板分「工具 / 主题」两组；全局细化圆角、阴影、间距与悬停过渡，滚动条改细。
- **四个占位页做成像真工具的预览**：JSON 页有五语言示例切换、语法高亮、树形视图与功能预览；密码页有三模式切换（随机密码含强度与备选、助记词 12 词卡用 BIP39 官方测试向量、随机数）、检查我的密码示例分析；QR 页有格式/尺寸切换、QR 矩阵与条码预览、GS1 参数表；到站页有三模式切换（87M / 1 路 / 荃湾线）、下三班到站卡与刷新动效。全部是静态示例，不迁业务逻辑。

## [2.0.0-alpha] - 2026-11-18 (a75b7654)

Phase 1 骨架上线（skeleton only，不含业务逻辑）：

- **新技术栈**：Vite 6 + Vue 3.5（`<script setup lang="ts">`）+ TypeScript `strict` + Tailwind CSS 3.4 + shadcn-vue（`reka-ui` 原语）+ Vue Router 4，全依赖本地打包、零 CDN。
- **四条懒加载路由**：`/json-sql`、`/password`、`/qr-barcode`、`/gmb`，history 模式 + Vercel SPA fallback。
- **App Shell**：可折叠侧边栏 + 顶部状态栏 + ⌘K 命令面板 + CopyButton（含复制成功动效）+ ErrorBoundary。
- **主题**：Light / Dark / System 三档（默认跟随系统），`<head>` 内联无闪烁脚本首绘前定主题，切换时 0.25s 平滑过渡；减弱动态效果的用户不播动画。
- **配套动画**：路由切换 180ms 淡入上浮、Toast 200ms 淡入、复制 0.3s 回弹。

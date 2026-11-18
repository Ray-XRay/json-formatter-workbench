# Changelog

MyWorkbench 2.0 的版本记录。2.0 与 1.x（`json-formatter-workbench` 仓库 main / vue 分支）是不同的技术栈与代码库，版本号从 2.0.0-alpha 起步。

## [2.0.0-alpha.3] - 2026-11-18

Phase 2 业务迁移（vue2-phase2 分支，四个工具的功能从 1.x 完整迁入，App Shell 与路由不变）。注：本分支基于 2.0.0-alpha 骨架；打磨线在 vue2 分支同期做到 2.0.0-alpha.2（6 档主题 + 界面精修），两路在集成时再合流，版本号以合流时为准：

- **JSON / SQL 工作台**：JSON 格式化/压缩/校验（报错带行列号）、语法高亮、树形视图（展开/折叠/搜索/点叶复制）、按键名深排序、粘贴自动格式化、JSONPath 查询、生成 TypeScript 类型、转 YAML、JSON 对比、转义/去转义、修复 JSON、分享链接 `#j=`、历史记录（5 条、7 天过期）、草稿自动保存 +「记住输入草稿与历史」开关；SQL 用 sql-formatter 15.9.0（解析失败回退轻量版并注明「轻量模式」）；Python / Go / Java 轻量整理。
- **密码与助记词**：随机密码（8–64 位、字符集可勾选、可排除易混淆字符，一次 5 个）、BIP39 助记词（2048 官方词表本地引入、校验和、12/15/18/21/24 词、钱包样式词卡网格、查看已有助记词并校验、复制同时写富文本表格 + 纯文本）、随机数（范围/个数/补零/PIN 快捷）、检查我的密码（本地算强度/熵/破解时间、141 个常见弱密码比对）；生成物不写 localStorage，只记选项。
- **QR / 条码**：QR Code + Code 128；二维码尺寸精确固定小 200 / 中 300 / 大 400 px（整数倍率渲染 + 最近邻重采样）；GS1 参数表（AI 名称可改、日期类显示 YYYY-MM-DD、「GS1 示例」、模板导入）；生成历史（5 条、7 天过期）。
- **到站看板**：小巴/巴士/港铁实时到站（三个政府域名）；同编号多来源全部列出任选；最近路线记来源；三张到站卡刷新动效（只有分钟数变了的卡才动，错开 70ms）；30 秒自动刷新。
- **安全头**：vercel.json 加 CSP（`script-src 'self'`，无 `unsafe-eval`、无 `unsafe-inline`；`connect-src` 只放行三个政府 ETA 域名）与 nosniff / Referrer-Policy / Permissions-Policy；首绘主题脚本改成同源外链 `public/theme-init.js` 以保持 CSP 严格。
- **依赖**：sql-formatter 15.9.0、bwip-js 4.11.4 均经 npm 本地打包进构建产物，零 CDN；bwip-js 类型用本地 `src/vendor/bwip-js.d.ts`（包内类型走不通 exports、`@types/bwip-js` 缺 `toSVG` 与 `eclevel`）。

## [2.0.0-alpha] - 2026-11-18 (a75b7654)

Phase 1 骨架上线（skeleton only，不含业务逻辑）：

- **新技术栈**：Vite 6 + Vue 3.5（`<script setup lang="ts">`）+ TypeScript `strict` + Tailwind CSS 3.4 + shadcn-vue（`reka-ui` 原语）+ Vue Router 4，全依赖本地打包、零 CDN。
- **四条懒加载路由**：`/json-sql`、`/password`、`/qr-barcode`、`/gmb`，history 模式 + Vercel SPA fallback。
- **App Shell**：可折叠侧边栏 + 顶部状态栏 + ⌘K 命令面板 + CopyButton（含复制成功动效）+ ErrorBoundary。
- **主题**：Light / Dark / System 三档（默认跟随系统），`<head>` 内联无闪烁脚本首绘前定主题，切换时 0.25s 平滑过渡；减弱动态效果的用户不播动画。
- **配套动画**：路由切换 180ms 淡入上浮、Toast 200ms 淡入、复制 0.3s 回弹。

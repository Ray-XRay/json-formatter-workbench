# Changelog

MyWorkbench 2.0 的版本记录。2.0 与 1.x（`json-formatter-workbench` 仓库 main / vue 分支）是不同的技术栈与代码库，版本号从 2.0.0-alpha 起步。

## [2.0.0-alpha] - 2026-11-18

Phase 1 骨架上线（skeleton only，不含业务逻辑）：

- **新技术栈**：Vite 6 + Vue 3.5（`<script setup lang="ts">`）+ TypeScript `strict` + Tailwind CSS 3.4 + shadcn-vue（`reka-ui` 原语）+ Vue Router 4，全依赖本地打包、零 CDN。
- **四条懒加载路由**：`/json-sql`、`/password`、`/qr-barcode`、`/gmb`，history 模式 + Vercel SPA fallback。
- **App Shell**：可折叠侧边栏 + 顶部状态栏 + ⌘K 命令面板 + CopyButton（含复制成功动效）+ ErrorBoundary。
- **主题**：Light / Dark / System 三档（默认跟随系统），`<head>` 内联无闪烁脚本首绘前定主题，切换时 0.25s 平滑过渡；减弱动态效果的用户不播动画。
- **配套动画**：路由切换 180ms 淡入上浮、Toast 200ms 淡入、复制 0.3s 回弹。

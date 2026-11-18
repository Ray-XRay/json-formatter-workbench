# MyWorkbench 2.0

四合一工具站的全新一代：JSON / SQL 格式化工作台、密码与助记词、QR / 条码、香港到站看板。

## 技术栈

- **Vue 3.5** + `<script setup lang="ts">`，TypeScript `strict`
- **Vite 6** 构建（零 CDN，全部依赖本地打包）
- **Vue Router 4**（history 模式，四条懒加载路由）
- **Tailwind CSS 3.4** + shadcn-vue 设计令牌（`reka-ui` 原语）
- **lucide-vue-next** 图标、`@vueuse/core` / `@vueuse/motion`、`@formkit/auto-animate`
- **Light / Dark / System** 三档主题（跟随系统，切换无闪烁）
- **业务依赖全部本地打包**：sql-formatter 15.9.0（SQL 格式化）、bwip-js 4.11.4（QR / 条码渲染），零 CDN

## 开发

```bash
npm install
npm run dev        # 本地开发，http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run typecheck  # 仅类型检查
npm run preview    # 预览生产构建
```

## 目录结构

```
├── index.html                  # 入口 HTML
├── public/
│   ├── favicon.svg             # </> 站标
│   └── theme-init.js           # 首绘前定主题（同源外链，保持 CSP 严格）
├── src/
│   ├── main.ts                 # 应用入口（router / auto-animate / motion）
│   ├── App.vue                 # 根组件
│   ├── assets/
│   │   └── main.css            # Tailwind + shadcn 设计令牌 + 动画
│   ├── components/             # 共享组件（AppShell、CommandPalette、CopyButton、ErrorBoundary…）
│   ├── composables/            # useTheme / useToast / useSidebar / useCommandPalette
│   ├── layouts/                # 布局
│   ├── lib/
│   │   ├── utils.ts            # cn() 等工具函数
│   │   ├── jsonsql/            # JSON/SQL 逻辑（格式化、高亮、树形、JSONPath、YAML、对比…）
│   │   ├── password/           # 密码/助记词/随机数/强度检查逻辑
│   │   ├── qr/                 # QR/条码渲染、GS1、历史记录
│   │   └── gmb/                # 到站看板 API、港铁站表、最近路线
│   ├── router/
│   │   └── index.ts            # /json-sql /password /qr-barcode /gmb
│   ├── vendor/
│   │   ├── bip39-words.ts      # BIP39 官方 2048 词表
│   │   └── bwip-js.d.ts        # bwip-js 本地类型声明
│   └── views/                  # 四个工具页面（已迁移完成功能，见下）
├── tailwind.config.js          # shadcn 令牌 + JetBrains Mono
├── vercel.json                 # SPA fallback + 安全头（CSP 等）
└── vite.config.ts              # @ → /src 别名，端口 5173
```

## 四个工具（Phase 2 已迁移完成）

- **JSON / SQL 工作台**（`/json-sql`）：JSON 格式化/压缩/校验（报错带行列号）、树形视图、按键名排序、粘贴自动格式化、JSONPath 查询、生成类型、转 YAML、JSON 对比、转义/去转义、修复 JSON、分享链接、历史记录与草稿自动保存；SQL 用 sql-formatter（失败回退轻量版并注明「轻量模式」）；Python / Go / Java 轻量整理。
- **密码与助记词**（`/password`）：随机密码、 BIP39 助记词（生成 + 查看校验）、随机数、检查我的密码；生成物不写 localStorage，只记选项。
- **QR / 条码**（`/qr-barcode`）：QR Code + Code 128；二维码尺寸精确固定小 200 / 中 300 / 大 400 px；GS1 参数表；生成历史。
- **到站看板**（`/gmb`）：小巴/巴士/港铁实时到站，同编号多来源任选，30 秒自动刷新，只有分钟数变了的卡才播刷新动效。

## Phase 1 范围

Phase 1 只做**骨架**：App Shell（可折叠侧边栏 + 顶部状态栏 + ⌘K 命令面板 + CopyButton + ErrorBoundary）、四条懒加载路由、Light / Dark / System 主题与配套动画。业务逻辑已在 Phase 2（本分支）迁入，见上。

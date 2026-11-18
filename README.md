# MyWorkbench 2.0

四合一工具站的全新一代：JSON / SQL 格式化工作台、密码与助记词、QR / 条码、香港到站看板。

## 技术栈

- **Vue 3.5** + `<script setup lang="ts">`，TypeScript `strict`
- **Vite 6** 构建（零 CDN，全部依赖本地打包）
- **Vue Router 4**（history 模式，四条懒加载路由）
- **Tailwind CSS 3.4** + shadcn-vue 设计令牌（`reka-ui` 原语）
- **lucide-vue-next** 图标、`@vueuse/core` / `@vueuse/motion`、`@formkit/auto-animate`
- **Light / Dark / System** 三档主题（跟随系统，切换无闪烁）

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
├── index.html                  # 入口 HTML（含无闪烁主题脚本）
├── public/
│   └── favicon.svg             # </> 站标
├── src/
│   ├── main.ts                 # 应用入口（router / auto-animate / motion）
│   ├── App.vue                 # 根组件
│   ├── assets/
│   │   └── main.css            # Tailwind + shadcn 设计令牌 + 动画
│   ├── components/             # 共享组件（AppShell、CommandPalette、CopyButton、ErrorBoundary…）
│   ├── composables/            # useTheme / useToast / useSidebar / useCommandPalette
│   ├── layouts/                # 布局
│   ├── lib/
│   │   └── utils.ts            # cn() 等工具函数
│   ├── router/
│   │   └── index.ts            # /json-sql /password /qr-barcode /gmb
│   └── views/                  # 四个工具页面（骨架）
├── tailwind.config.js          # shadcn 令牌 + JetBrains Mono
├── vercel.json                 # SPA fallback（history 路由）
└── vite.config.ts              # @ → /src 别名，端口 5173
```

## Phase 1 范围

Phase 1 只做**骨架**：App Shell（可折叠侧边栏 + 顶部状态栏 + ⌘K 命令面板 + CopyButton + ErrorBoundary）、四条懒加载路由、Light / Dark / System 主题与配套动画。**不迁移任何业务算法**——四个工具页目前是空壳占位，业务逻辑在后续阶段迁入。

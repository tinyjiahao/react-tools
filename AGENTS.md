# AGENTS.md

面向 AI 编码代理（以及人类协作者）的前端开发规范。本仓库是一个纯前端的 React 工具集合应用，部署在 Cloudflare Pages，后端为独立的 Cloudflare Worker（R2 网关）。

> **权威参考**：`README.md` 是 CRA 时期的遗留文档，**已过时，不要依据它**。架构与约定以本文件、`frame.md`、`package.json` 中的实际脚本为准。

---

## 1. 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 19（新 JSX 转换，**无需 `import React`**）+ TypeScript 5.9（strict） |
| 构建 | Vite 8 + `@vitejs/plugin-react` |
| 代码编辑器 | `monaco-editor` + `@monaco-editor/react`（**本地打包，禁止走 CDN**） |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| Diff | `diff` + `react-diff-view` |
| 其它 | `qrcode.react`、`highlight.js`、`pako`/`snappyjs`（压缩）、`jsonpath`、`html2canvas` |
| 状态管理 | 无 Redux/Zustand/Context，组件内 `useState` 自治；`App.tsx` 仅持有 UI 偏好 |
| 路由 | 手写（基于 `window.history`），**不使用 react-router** |
| 样式 | 原生全局 CSS + CSS 变量主题，无 CSS Modules / Tailwind / styled-components |
| 测试 | 当前无测试框架；如需新增建议用 Vitest |

---

## 2. 目录结构

```
react-tools/
├── src/
│   ├── index.tsx              # 入口：StrictMode + createRoot；必须最先 import './lib/monaco'
│   ├── index.css              # 仅做 reset
│   ├── App.tsx                # 唯一状态中枢：导航注册表 + 客户端路由 + 主题 + 布局
│   ├── App.css                # 全局样式与 CSS 变量主题系统（单体大文件）
│   ├── lib/                   # 共享非 UI 模块
│   │   ├── types.ts           # Config、FileItem 等跨组件共享类型
│   │   ├── storage.ts         # STORAGE_KEYS 常量 + 安全读写函数
│   │   ├── r2Api.ts           # callWorkerApi / uploadWithProgress（Worker 网关）
│   │   └── monaco.ts          # Monaco 本地打包 + Web Worker 配置
│   ├── types/                 # 第三方库的 ambient 声明（如 snappyjs.d.ts）
│   └── components/            # 全部工具组件（PascalCase .tsx，default 导出）
├── public/                    # 原样拷贝到构建产物（含 _redirects、sitemap、manifest）
├── docs/
│   ├── worker.js              # 独立部署的 Cloudflare Worker 后端（R2 代理）
│   └── CLOUDFLARE_R2_SETUP.md
├── frame.md                   # 中文架构文档（权威）
├── vite.config.ts
├── tsconfig.json              # strict + noUnusedLocals/Parameters + composite
└── package.json               # "type": "module"，脚本 dev/build/preview
```

注意：**没有** `pages/`、`hooks/`、`utils/`、`services/` 目录，结构是扁平的。共享逻辑统一放 `src/lib/`。

---

## 3. 常用命令

```bash
npm run dev       # 启动开发服务器（端口 3000，沿用 CRA 旧端口）
npm run build     # tsc -b 类型检查 → vite build（类型错误会阻断构建）
npm run preview   # 预览构建产物
```

构建产物输出到 `build/`（刻意保留 CRA 的目录名，避免改动 Cloudflare Pages 配置）。

---

## 4. 代码规范（前端开发基本要求）

### 4.1 组件

- **函数组件 + Hooks**，禁止 class 组件。
- 工具类「页面」组件用 `const X = () => { ... }` 形式；小型展示型子组件可用 `React.FC<Props>`。
- 非组件的辅助函数用普通 `function` 声明（如 `buildCurl`、`formatTimestamp`）。
- 每个组件文件 **default 导出** 一个组件。

### 4.2 TypeScript

- 类型严格（`tsconfig.json` 已开 `strict`、`noUnusedLocals`、`noUnusedParameters`）。
- 对象/组件形状用 `interface`；联合类型用 `type`（如 `type ToolType = 'json' | 'diff' | ...`）。
- Props 必须显式定义 interface。
- 类型导入用 `import type { Config, FileItem } from '../lib/types'`。
- 新增无类型的第三方库时，在 `src/types/` 下补 ambient 声明（参考 `snappyjs.d.ts`）。

### 4.3 状态与副作用

- 状态由各组件 `useState` 自治，`App.tsx` 只存 UI 偏好（当前工具、布局、暗色模式）。
- 大量使用 `useEffect` 做 localStorage 同步与数据加载；`useCallback` 包装异步处理函数。
- 需要不触发重渲染的可变值用 `useRef`，典型场景：防抖定时器、并发锁标志、用于绕过闭包陈旧值的「最新值镜像」（见 `NotesManager.tsx` 的 `currentNoteRef` / `originalNoteRef` / `isSavingRef`）。
- 残留的 `// eslint-disable-next-line react-hooks/exhaustive-deps` 注释可忽略（ESLint 已在迁移 Vite 时移除，未重新配置）。

### 4.4 命名

- 组件文件 PascalCase `.tsx`；`lib/`、`types/` 用 camelCase `.ts`。
- 组件内常量用 UPPER_SNAKE（`THEME_OPTIONS`、`LANGUAGE_OPTIONS`、`STORAGE_KEYS`）。
- UI 文案与代码注释使用中文。

### 4.5 样式

- 绝大多数样式写在 `src/App.css`（全局 + CSS 变量主题）。
- 主题通过 `<html data-theme="dark|light">` + CSS 变量实现；强调色用 JS 动态注入：
  ```ts
  document.documentElement.style.setProperty('--cf-orange', themeColor);
  ```
- 第三方 CSS 直接在组件内 `import`（如 `'highlight.js/styles/github-dark.css'`）。
- 动态/一次性样式才用内联 `style={{}}`，常规样式走 CSS 类。

### 4.6 持久化（localStorage）

- **所有 key 集中声明**在 `src/lib/storage.ts` 的 `STORAGE_KEYS` 常量里，禁止散落硬编码。
- 读取用 `safeGetConfig`（带字段校验、绝不抛错）或 `safeGetJSON<T>`；写入用 `safeSetItem`（捕获 `QuotaExceededError`）。
- UI 偏好推荐用 `useState` 惰性初始化 + `useEffect` 落盘：
  ```ts
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  ```

### 4.7 路由与新增工具

- 客户端路由手写在 `App.tsx`（`toolIdToPath` / `pathToToolId`），用 `window.history.replaceState` 同步 URL。
- **新增一个工具需要改 `App.tsx` 五处**：`ToolType` 联合类型、`toolCategories`、`toolIdToPath`、`pathToToolId`、条件渲染块。
- SPA 深链靠 `public/_redirects`（`/* /index.html 200`）兜底。

---

## 5. 关键模式

### 5.1 Monaco 本地打包 + Worker（`src/lib/monaco.ts`）

- 在 `index.tsx` 中 **必须最先 import**，先于 `<App/>` 挂载。
- 用 Vite 的 `?worker` 后缀导入 5 个语言 worker，按 `label` 路由，并调用 `loader.config({ monaco })` 让 `@monaco-editor/react` 使用本地实例而非 jsDelivr CDN。

### 5.2 Cloudflare Worker 网关（`src/lib/r2Api.ts`）

- `callWorkerApi(action, config, body)`：JSON POST（`list` / `delete` / `rename`）。
- `uploadWithProgress(config, formData, onProgress)`：XHR 上传以支持进度回调。
- **Token 只走 `Authorization: Bearer` 请求头，绝不放入 URL 查询串**（历史上有过泄露修复 `153cea5`）。

### 5.3 NotesManager 的持久化与历史

- 笔记是 R2 中的 `notes/{id}.json`；历史快照在 `notes_history/{noteId}/{timestamp}.json`（刻意用不同前缀，避免被 `list(prefix:'notes/')` 列出）。
- 1.5s 防抖自动保存，从 `currentNoteRef` 读取最新内容绕过闭包陈旧问题。
- 保存并发用 `isSavingRef` + `isSavePendingRef` 双标志保证最后一次编辑一定落盘。
- 版本历史每 5 分钟最多一份，仅保留最近 10 份（`cleanupHistory` 通过 Worker `delete` 清理）。
- `visibilitychange`（页面隐藏）、`beforeunload`、组件卸载均触发 `flushSave()`。

### 5.4 图标

- 单一 `Icon` 组件，内联 SVG 按 `name` 字符串选取，**不引入图标库**。

---

## 6. 后端说明（前端无需改动，但需知晓）

- R2 后端是 `docs/worker.js`，**独立部署**，提交信息中的 `fix(worker)` 指向该文件。
- 文件上传有「key 前缀」处理，曾因前缀白名单导致上传失败（修复见 `d1fb4a2`）。

---

## 7. Git 提交规范

遵循 **Conventional Commits**（规则见 `.claude/skills/commit-messages/SKILL.md`）：

```
type(scope): 简短描述（英文，≤50 字符）
```

- **type**：`feat` / `fix` / `refactor` / `docs` / `build` / `chore`
- **scope**（常用）：`NotesManager`、`R2FileManager`、`JsonlViewer`、`worker`、`r2`、`frontend`、`frame`
- 描述用英文，主题行控制在 50 字符内；如需展开，空一行后写 body。

示例：
```
feat(NotesManager): add version history (keep latest 10)
fix(worker): drop key prefix allowlist that broke R2FileManager uploads
build: migrate from CRA to Vite and upgrade all deps to latest
```

---

## 8. 改动前的检查清单

- [ ] 新增 localStorage key → 已加入 `STORAGE_KEYS`
- [ ] 新增工具组件 → 已在 `App.tsx` 五处注册
- [ ] 类型变更 → `npm run build` 通过 `tsc -b` 类型检查
- [ ] 引入第三方库 → 补齐类型声明，避免破坏 `strict` 模式
- [ ] 涉及 Monaco → 保持本地打包，不要切回 CDN
- [ ] 涉及鉴权 → token 仅放请求头，不进 URL
- [ ] 提交信息 → 符合 Conventional Commits

> 部署约定：Cloudflare Workers 统一部署。Vite Cloudflare 插件构建 dist/client 与 dist/worker；npm run deploy 使用生成的 dist/worker/wrangler.json。同源 /api，SPA fallback 由 Wrangler assets 配置负责。详情见 docs/CLOUDFLARE_R2_SETUP.md。

# AGENTS.md

面向 AI 编码代理（以及人类协作者）的前端开发规范。本仓库是一个 React 工具集合应用，前端静态资源与 Hono/R2 网关通过 Cloudflare Workers 统一部署。

> **权威参考**：`README.md` 是 CRA 时期的遗留文档，**已过时，不要依据它**。架构与约定以本文件、`frame.md`、`package.json` 中的实际脚本为准。

---

## 1. 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 19（新 JSX 转换，**无需 `import React`**）+ TypeScript 6（strict） |
| 构建 | Vite 8 + `@vitejs/plugin-react` |
| 代码编辑器 | `monaco-editor` + `@monaco-editor/react`（**本地打包，禁止走 CDN**） |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| Diff | `diff` + `react-diff-view` |
| 其它 | `qrcode.react`、`highlight.js`、`pako`/`snappyjs`（压缩）、`jsonpath`、`html2canvas` |
| 状态管理 | 无 Redux/Zustand/Context，组件内 `useState` 自治；`App.tsx` 仅持有 UI 偏好 |
| 路由 | React Router（入口 BrowserRouter，App 使用 useLocation/useNavigate） |
| 样式 | 原生全局 CSS + CSS 变量主题，无 CSS Modules / Tailwind / styled-components |
| 测试 | Vitest + Testing Library + jsdom；测试与被测模块同目录 |

---

## 2. 目录结构

```text
react-tools/
├── src/
│   ├── index.tsx / index.css  # 入口、Monaco 初始化、基础 reset
│   ├── App.tsx / App.css      # 应用框架、导航、主题及全局样式
│   ├── app/tools.ts          # 工具分类、ToolType 与路由映射
│   ├── components/
│   │   ├── common/           # Icon、MessageToast、SettingsDialog
│   │   ├── json/             # JSON 工作区、文件树、编辑器、面包屑
│   │   ├── llm/              # JSONL、IMPL、SSE 查看器
│   │   ├── text/             # Diff、Base64、字节、URL 编解码、正则
│   │   ├── network/          # cURL、JWT、二维码
│   │   ├── storage/          # R2 文件/图片、Markdown、笔记、Drawio
│   │   └── developer/        # 性能分析及甘特图、时间戳、UUID
│   ├── lib/
│   │   ├── json/             # IndexedDB、自动保存 hook、结构解析及 worker
│   │   ├── performance/      # 性能分析示例数据
│   │   └── *.ts              # 跨功能共享：monaco、storage、r2Api、types
│   ├── types/                # 第三方 ambient 类型声明
│   └── setupTests.ts         # Vitest 测试初始化
├── worker/
│   ├── index.ts              # Hono 入口，同源 /api 路由
│   └── services/storage.js   # R2 存储代理
├── public/                   # 静态资源
├── shared/ / data/           # 现有 JSON 样例文件
├── docs/                     # 部署说明、设计与实施方案
├── frame.md                  # 架构说明
├── vite.config.ts / vitest.config.ts
├── wrangler.jsonc            # Workers 统一部署配置
└── package.json              # dev/build/test:run/deploy 等脚本
```

组件按导航功能分类，跨工具 UI 放 `components/common/`；非 UI 逻辑放 `lib/`，领域专用逻辑放其子目录。`*.test.ts(x)` 与被测文件同目录，专用 CSS 与组件同目录。新增文件优先放入已有分类，不再堆放在 components 根目录。

---

## 3. 常用命令

```bash
npm run dev       # 启动开发服务器（端口 3000，沿用 CRA 旧端口）
npm run build     # tsc -b 类型检查 → vite build（类型错误会阻断构建）
npm run preview   # 预览构建产物
```

构建产物输出到 `dist/client` 和 `dist/worker`；`npm run test:run` 运行测试，`npm run deploy` 构建并统一部署。

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

- 工具定义及路由映射集中在 `src/app/tools.ts`，`App.tsx` 通过 React Router 切换页面。
- 新增工具时更新 `tools.ts` 中的类型、分类与路径映射，并在 `App.tsx` 导入和渲染对应分类下的组件。
- SPA 深链由 Wrangler assets 的 single-page-application 配置兜底。

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

- R2 后端实现在 `worker/services/storage.js`，由 `worker/index.ts` 挂载到同源 `/api`，与静态资源统一部署。
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
- [ ] 新增工具组件 → 已更新 `app/tools.ts` 与 `App.tsx` 的渲染入口
- [ ] 类型变更 → `npm run build` 通过 `tsc -b` 类型检查
- [ ] 引入第三方库 → 补齐类型声明，避免破坏 `strict` 模式
- [ ] 涉及 Monaco → 保持本地打包，不要切回 CDN
- [ ] 涉及鉴权 → token 仅放请求头，不进 URL
- [ ] 提交信息 → 符合 Conventional Commits

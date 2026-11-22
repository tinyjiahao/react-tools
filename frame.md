# React Tools 项目架构文档

一个部署在 **Cloudflare Workers** 上的纯前端开发者工具箱（React 19 + TypeScript），通过同源 **Cloudflare Worker** 提供对象存储（R2）代理。所有工具完全运行在浏览器端，后端仅承担存储代理职责。

---

## 1. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | React 19 + TypeScript 6 | 新 JSX transform（无需 `import React`） |
| 构建 | Vite 8 + @vitejs/plugin-react | `npm run build` 产出到 `dist/client` 与 `dist/worker`；dev server 端口 3000 |
| 部署 | Cloudflare Workers | 静态资源与 Worker 统一部署，Wrangler assets 提供 SPA fallback |
| 后端 | Cloudflare Worker | 同源统一部署，作为 R2 存储代理（见 `worker/services/storage.js`） |
| 存储 | Cloudflare R2 | 对象存储，存放文件/图片/笔记/Markdown |
| 编辑器 | Monaco Editor | **本地打包**（`src/lib/monaco.ts` 配置 worker 与 loader，不依赖 CDN） |
| 渲染 | react-markdown + remark-gfm + rehype-highlight | Markdown 渲染 |
| 其他 | highlight.js、qrcode.react、pako、snappyjs、react-diff-view、html2canvas、jsonpath、diff | 各工具专用依赖 |

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

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    浏览器（Cloudflare Workers）                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  App.tsx                                                │  │
│  │   ├─ 顶部/侧边 导航（分类 → 工具下拉）                    │  │
│  │   ├─ 客户端路由（URL pathname ↔ 工具 ID）                │  │
│  │   ├─ 主题：深色模式 + 主题色（localStorage）              │  │
│  │   └─ 布局切换：顶部栏 ↔ 左侧栏                            │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │ 条件渲染                            │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │              分类工具组件（components/）                 │  │
│  │   纯前端工具 ────────────────────────────────────────    │  │
│  │   JSON / Diff / QR / URL / Byte / Base64 / JSONL ...    │  │
│  │   云端存储工具 ─────────────────────────────────────     │  │
│  │   R2FileManager / MarkdownViewer / NotesManager /        │  │
│  │   R2ImageManager ──┐                                    │  │
│  └────────────────────┼────────────────────────────────────┘ │
└───────────────────────┼──────────────────────────────────────┘
                        │ fetch（Bearer token）
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                Cloudflare Worker（同源统一部署）                    │
│   worker/services/storage.js                                             │
│   ├─ GET  /file/{key}     文件直读（图片免 token）             │
│   ├─ POST ?action=list    列文件（支持 prefix 目录过滤）       │
│   ├─ POST ?action=upload  上传（FormData，path 决定 key）      │
│   ├─ POST ?action=delete  删除                                │
│   └─ POST ?action=rename  重命名（复制 + 删除）                │
└───────────────────────────┬──────────────────────────────────┘
                            │ R2_BUCKET binding
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   Cloudflare R2（对象存储）                    │
└──────────────────────────────────────────────────────────────┘
```

**职责划分**
- **前端**：所有工具逻辑、数据格式化、UI 交互完全在浏览器运行，无 SSR。
- **Worker**：仅做存储代理 + 可选的 Token 鉴权 + CORS，无业务逻辑。
- **本地持久化**：用户偏好、工具历史记录、R2 连接配置全部存于浏览器 `localStorage`。

---

## 4. 前端架构

### 4.1 应用入口与主框架（`App.tsx`）

`index.tsx` → `createRoot` 挂载 `<App/>`。`App.tsx` 是唯一的状态中枢，负责：

1. **工具注册表**：`app/tools.ts` 中的 `toolCategories` 数组定义 6 个分类下的全部工具（id / 名称 / 描述）。新增工具只需在此注册并补一个组件分支。
2. **客户端路由**：使用 React Router 的 BrowserRouter、useLocation 和 useNavigate；`app/tools.ts` 中的 `toolIdToPath` / `pathToToolId` 维护双向映射。
3. **布局模式**：`top`（顶部导航栏）↔ `left`（侧边栏），状态存于 `localStorage.layoutMode`，下拉菜单的展开/折叠行为随布局不同。
4. **主题**：深色模式（`data-theme` 属性）+ 主题色（`--cf-orange` CSS 变量），均持久化到 `localStorage`。
5. **条件渲染**：通过一连串 `activeTool === 'xxx' && <Component/>` 渲染当前工具（非路由库的懒加载）。

### 4.2 工具组件（`src/components/`）

组件按导航分类放置，测试及专用样式与组件相邻。按数据来源可分为两类：

#### 纯前端工具（无后端依赖）
| 组件 | 功能 |
|------|------|
| `JsonFormatter` | JSON 格式化/压缩/校验、搜索替换与结构面包屑；JsonWorkspace 管理本地文件 |
| `JsonlViewer` | JSONL 逐行结构化查看 |
| `ImplViewer` | IMPL_JSON 代码实现方案解析 |
| `SseViewer` | SSE 流式响应拼接查看 |
| `DiffViewer` | 文本差异对比 |
| `ByteConverter` | 字节单位转换 |
| `Base64Encoder` | Gzip/Snappy 压缩 + Base64 |
| `QrCodeGenerator` | URL 转二维码 |
| `UrlEncoder` | URL 编解码 |
| `CurlBuilder` | 根据 URL/Params/Headers 生成 cURL |
| `PerformanceProfiler` | 上传性能数据 → 甘特图分析（`PerformanceGanttChart`） |

#### 云端存储工具（依赖 Worker + R2）
| 组件 | localStorage 配置 key | 说明 |
|------|----------------------|------|
| `R2FileManager` | `r2_config` | R2 文件管理（目录/上传/下载/重命名/预览） |
| `MarkdownViewer` | `r2_config` | Markdown 在线预览与管理 |
| `NotesManager` | `r2_config` | 云端 Markdown 备忘录 |
| `R2ImageManager` | `r2_image_config` | R2 图片存储管理（独立配置） |

#### 辅助组件
| 组件 | 说明 |
|------|------|
| `Icon` | 内置 SVG 图标库（按 `name` 取图） |
| `SettingsDialog` | 设置弹窗：主题色 / R2 配置 / Worker 代码示例 |
| `MessageToast` | 轻量提示组件 |

### 4.3 状态管理与数据流

- **无全局状态库**（无 Redux/Zustand/Context）。每个工具组件自管理状态，App 仅持有当前激活的工具与 UI 偏好。
- **跨组件共享**仅靠 `localStorage`：例如 R2 配置由 `SettingsDialog` 写入，各存储组件运行时读取，实现"设置一次，多处生效"。

涉及的 `localStorage` 键（集中声明在 `src/lib/storage.ts` 的 `STORAGE_KEYS` 常量）：

| 键 | 用途 |
|----|------|
| `r2_config` | Worker URL + API Token（文件/Markdown/笔记共用） |
| `r2_image_config` | 图片管理专用 R2 配置 |
| `darkMode` / `themeColor` / `layoutMode` | UI 偏好 |
| `notes_selected_id` / `notes_sidebar_collapsed` | 备忘录状态 |
| `monaco_theme` / `monaco_language` | 编辑器偏好 |
| `performanceData` / `performanceHistory` | 性能分析数据 |
| `qr_history` / `url_history` / `base64_history` | 各工具历史记录 |

> 所有 `localStorage` 读取统一走 `safeGetConfig` / `safeGetJSON`（带 try/catch + 字段校验，损坏值不再抛 SyntaxError），写入走 `safeSetItem`（捕获 QuotaExceededError）。

### 4.4 API 调用模式

存储类组件统一通过 `src/lib/r2Api.ts` 的共享封装访问 Worker：

- **`callWorkerApi(action, config, body)`** — JSON 接口（list/delete/rename）。token 通过 `Authorization: Bearer` header 传递。
- **`uploadWithProgress(config, formData, onProgress)`** — 带进度的 FormData 上传，token 同样走 header（不进 URL）。
- **文件直读**：`GET /file/{key}`，图片可免 token。

> 之前这套逻辑在 4 个 R2 组件里各重复一份、且参数顺序不一致；现已集中到 `src/lib/`，组件只负责调用与 UI。

### 4.5 主题系统（`App.css`）

基于 CSS 变量 + `data-theme` 属性：

```css
:root { --cf-orange: #F6821F; ... }
[data-theme="dark"] { --cf-orange-light: #3a2010; ... }
```

主题色通过 JS 动态注入 `document.documentElement.style.setProperty('--cf-orange', color)`。

---

## 5. 后端架构（Cloudflare Worker）

源码位于 `worker/services/storage.js`，是一个单文件 Service Worker（`export default { fetch }`），同源统一部署到 Cloudflare。它**不随前端构建产物一起部署**，需在 Cloudflare 控制台单独创建。

### 5.1 接口

| 路径 / 参数 | 方法 | 鉴权 | 功能 |
|-------------|------|------|------|
| `/file/{key}` | GET | 图片免 token；其他需 `Authorization: Bearer` | 读取文件（图片 inline，其他 attachment） |
| `?action=list` | POST | 需 token | 列文件，支持 `{ prefix }` 目录过滤，自动分页（不受 R2 1000 条上限截断） |
| `?action=upload` | POST (FormData) | 需 token | 上传，`path` 字段决定 R2 key；限 100MB、流式写入 |
| `?action=delete` | POST | 需 token | 删除文件 |
| `?action=rename` | POST | 需 token | 流式复制到新 key 后删除旧 key，删除失败会如实报错 |

### 5.2 绑定与环境变量

- `R2_BUCKET`：R2 存储桶绑定（wrangler.toml 中的 `[[r2_buckets]]`），缺失时返回 500。
- `API_TOKEN`：**必填**访问令牌（`wrangler secret` 设置）。**fail-closed**：未配置时所有写操作一律 401。
- `ALLOWED_ORIGINS`：允许的跨域来源（逗号分隔），生产环境必填，如 `https://your-app.pages.dev`。未配置时回退到 `*`（仅适合本地调试）。

### 5.3 安全设计要点

- **fail-closed 鉴权**：未配置 `API_TOKEN` 时拒绝所有写操作（不再"放行"）。
- **Token 仅认 Header**：只从 `Authorization: Bearer xxx` 读取，不再从 URL query 读取，避免泄露进访问日志/浏览器历史。
- **CORS 来源白名单**：根据 `ALLOWED_ORIGINS` 反射匹配的 Origin，并设 `Vary: Origin`（不再无条件 `*`）。
- **Key 安全校验**：`/file/`、upload、delete、rename 拒绝含 `..`、NUL、以 `/` 开头的 key（防路径穿越）；R2FileManager 作为通用文件管理器，允许任意目录前缀。
- **分层鉴权**：`/file/` 路径中，图片扩展名（jpg/png/gif/webp/svg/bmp/ico）免鉴权以便直接 `<img>` 引用，其余需 token。
- **缓存策略**：可变内容（`notes/`、`markdown_file/`）输出 `Cache-Control: no-cache`，其余静态资源才缓存 1 年。
- 错误响应不回传内部 `error.message`。

---

## 6. 部署与命令

以 [统一部署指南](docs/CLOUDFLARE_R2_SETUP.md) 为准。使用 Cloudflare Vite Plugin 构建，执行 `npm run deploy` 一次发布静态资源与 Worker。

---

## 8. 关键约定与注意点

- **新增工具的步骤**：① 在 `components/` 对应分类新建组件；② 更新 `app/tools.ts` 的类型、分类和路由映射；③ 在 `App.tsx` 添加导入与渲染分支。
- **纯前端优先**：除非需要持久化到云端，否则工具应完全在浏览器内运算，不引入后端依赖。
- **存储配置隔离**：`R2ImageManager` 使用独立的 `r2_image_config`，其余三个存储工具共用 `r2_config`。
- **鉴权**：图片类资源为方便外链展示免 token，其他 R2 操作均需 token。
- **代码风格**：组件使用函数组件 + Hooks，无 class 组件；中文注释与中文 UI 文案。

---

*目录按功能分类；后续组件、接口与部署变更请同步更新本文。*

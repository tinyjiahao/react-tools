# 设计：4 个通用编码效率开发工具

- **日期**：2026-07-03
- **范围**：在「开发工具」分类下新增 4 个纯前端工具
- **依赖**：新增 `uuid@^11` + `ulid@^3`（仅 UUID 工具的 v7/ULID 用到），其余 3 个工具零新依赖
- **遵循规范**：`AGENTS.md`、`frame.md`、`src/lib/storage.ts`

---

## 1. 背景与目标

项目现有 16 个工具分 6 大类，但「开发工具」分类下仅有「性能分析器」一个。本设计在「开发工具」分类下补充 4 个高频、轻量的纯前端开发辅助工具：

1. 正则表达式测试器（RegexTester）
2. 时间戳转换器（TimestampConverter）
3. UUID/ULID 生成器（UuidGenerator）
4. JWT 解码器（JwtDecoder）

**目标用户**：日常开发调试场景。

**设计原则**：
- **精简版**：每个工具只做核心功能，走「输入区 → 输出区」单一布局，与现有「字节转换」「Base64 压缩编码」风格一致。
- **最小依赖**：正则/JWT/时间戳零新依赖；UUID 仅在 v7/ULID 时引 `uuid`+`ulid`（共约 5KB gzip）。
- **统一归类**：4 个工具全部加到现有「开发工具」分类。

---

## 2. 工具详细设计

### 2.1 正则表达式测试器（RegexTester）

**文件**：`src/components/RegexTester.tsx`

**功能**：
- 顶部配置区：正则 pattern 输入框 + flags 复选框（g / i / m / s / u / y）
- 中部测试文本区：textarea 输入待匹配文本
- 底部结果区：
  - **匹配高亮**：用 `<mark>` 包裹所有匹配项，渲染原文。无 `g` flag 时只高亮首个
  - **捕获组列表**：表格展示每个匹配的各捕获组（索引、名称（若有）、匹配文本）
  - **错误提示**：正则语法错误时，结果区显示原生 `SyntaxError` 信息（实时）

**实现要点**：
- 纯原生 `RegExp`，无新依赖
- `new RegExp(pattern, flags)` 包 `try/catch`，捕获构造异常
- 高亮渲染：用 `regex.exec()` / `String.matchAll()` 取得匹配区间，按区间切分原文生成 React 节点（注意转义 HTML 特殊字符）
- 无 `g` flag 时只取首个匹配；有 `g` flag 时遍历所有

**状态**：`pattern`、`flags`（字符串集合）、`testText`

**持久化**：pattern + flags + testText 通过 `STORAGE_KEYS.regexTester` 落 localStorage（记住上次输入）

---

### 2.2 时间戳转换器（TimestampConverter）

**文件**：`src/components/TimestampConverter.tsx`

**功能**：左右两列双向布局
- **左列：时间戳 → 日期**
  - 输入 Unix 时间戳（数字）
  - 自动识别秒/毫秒（10 位按秒、13 位按毫秒）
  - 输出本地时间 + UTC 时间（ISO 8601 可读格式）
- **右列：日期 → 时间戳**
  - 输入日期（`<input type="datetime-local">`）
  - 输出秒级 + 毫秒级时间戳
- **顶部**：当前时间戳实时显示（`useEffect` + `setInterval(1000)`），带「复制」按钮

**实现要点**：
- 纯原生 `Date`，无新依赖
- 秒/毫秒识别：按字符串长度判断（10 位 = 秒，13 位 = 毫秒，其它给提示）
- 非法输入时结果区显示「无效时间戳」/「无效日期」，不抛错

**状态**：`timestampInput`、`dateInput`、`nowTimestamp`

**持久化**：`timestampInput` 通过 `STORAGE_KEYS.timestampConverter` 落 localStorage（`dateInput` 不持久化，因其默认值依赖当前时间）

---

### 2.3 UUID/ULID 生成器（UuidGenerator）

**文件**：`src/components/UuidGenerator.tsx`

**功能**：
- **顶部配置区**：
  - 版本选择（单选）：UUID v4 / UUID v7 / ULID
  - 数量（1-100，默认 1）
  - 连字符开关（默认开）—— 仅对 UUID 生效（ULID 固定无连字符）
- **底部结果区**：
  - 每行一个 ID，带行内「复制」按钮
  - 顶部「重新生成」+「复制全部」按钮
- 一键复制走现有 `Icon` 的 `copy` 图标 + MessageToast 提示

**实现要点**：
- v4：原生 `crypto.randomUUID()`（浏览器原生，零依赖）
- v7：`import { v4 as uuidv4, v7 as uuidv7 } from 'uuid'`
- ULID：`import { ulid } from 'ulid'`
- 连字符关闭时：UUID 结果 `.replace(/-/g, '')`
- 批量生成：`Array.from({ length: n }, () => generate())`

**依赖**：新增 `uuid@^11`、`ulid@^3`（共约 5KB gzip）

**状态**：`version`、`count`、`hyphenated`、`results: string[]`

**持久化**：`version` / `count` / `hyphenated` 通过 `STORAGE_KEYS.uuidGenerator` 落 localStorage；`results` 不持久化（每次进入页面重新生成）

---

### 2.4 JWT 解码器（JwtDecoder）

**文件**：`src/components/JwtDecoder.tsx`

**功能**：
- **顶部**：JWT 粘贴框（textarea）
- **底部**：按 `.` 分三段展示
  - **Header**（红框）：base64url 解码后高亮 JSON
  - **Payload**（紫框）：base64url 解码后高亮 JSON
  - **Signature**（蓝框）：原样展示（无需解码，本工具不验签）
- **校验提示**：
  - 若 payload 含 `exp` 字段，对比当前时间，过期标红「Token 已过期」，未过期显示剩余时间
  - 顶部展示 `alg`（来自 header.alg）
- **错误处理**：格式不合法（不是 3 段 / base64url 解码失败 / 非 JSON）时结果区显示具体错误

**实现要点**：
- 纯原生 `atob` + base64url → base64 转换（`-`→`+`、`_`→`/`、补 `=` 填充）
- JSON 高亮：**简单着色方案**——递归遍历对象，对 key / string / number / boolean / null 分别用不同 `<span className>` 着色，渲染为格式化的 `<pre>`。不引 highlight.js（Base64 工具的 markdown 高亮场景已引，但此处是结构化 JSON，简单着色更轻量且效果好）
- base64url 解码参考现有 `Base64Encoder.tsx` 的解码思路

**状态**：`token`

**持久化**：`token` 通过 `STORAGE_KEYS.jwtDecoder` 落 localStorage（JWT 通常较长，记住上次输入便于迭代调试）

---

## 3. 跨工具共通实现

### 3.1 组件规范（遵循 AGENTS.md §4.1）

- 每个组件文件 PascalCase `.tsx`：`RegexTester.tsx` / `TimestampConverter.tsx` / `UuidGenerator.tsx` / `JwtDecoder.tsx`
- 函数组件 + Hooks：`const X = () => { ... }` 形式
- default 导出一个组件
- UI 文案与注释使用中文

### 3.2 App.tsx 五处注册（遵循 AGENTS.md §4.7）

每个工具都需要在 `App.tsx` 改五处。本次新增 4 个工具：

1. **`ToolType` 联合类型**（约 `App.tsx:23`）：追加 `'regex' | 'timestamp' | 'uuid' | 'jwt'`
2. **`toolCategories`**（约 `App.tsx:83-87`「开发工具」数组）：追加 4 项
   ```ts
   { id: 'regex', name: '正则测试', description: '正则表达式实时匹配与捕获组' },
   { id: 'timestamp', name: '时间戳转换', description: 'Unix时间戳与日期互转' },
   { id: 'uuid', name: 'UUID生成器', description: '批量生成UUID/ULID' },
   { id: 'jwt', name: 'JWT解码', description: '解码JWT的Header与Payload' },
   ```
3. **`toolIdToPath`**（约 `App.tsx:92`）：追加 4 条映射（`/regex`、`/timestamp`、`/uuid`、`/jwt`）
4. **`pathToToolId`**（约 `App.tsx:112`）：追加 4 条反向映射
5. **条件渲染块**（`App.tsx` 中 `activeTool === 'json' && ...` 那一带）：追加 4 个 `<X />`

### 3.3 图标（遵循 AGENTS.md §5.4）

`src/components/Icon.tsx` 新增 4 个内联 SVG，按 `name` 字符串选取：
- `regex`：斜杠包夹的星号（如 `/.*/` 风格）
- `timestamp`：时钟 + 数字
- `uuid`：大括号 + 连字符标识（`{abc-123}`）
- `jwt`：锁形（象征令牌）

### 3.4 持久化（遵循 AGENTS.md §4.6）

`src/lib/storage.ts` 的 `STORAGE_KEYS` 追加 4 个 key：
```ts
regexTester: 'regex_tester',
timestampConverter: 'timestamp_converter',
uuidGenerator: 'uuid_generator',
jwtDecoder: 'jwt_decoder',
```
读取用 `safeGetJSON<T>`，写入用 `safeSetItem`。

### 3.5 样式（遵循 AGENTS.md §4.5）

新增样式加到 `src/App.css`，复用现有工具卡片样式（`.tool-container`、`.btn`、`.btn-primary` 等）。
每个工具用语义化 class 前缀避免冲突：`.regex-tester-*`、`.timestamp-*`、`.uuid-*`、`.jwt-*`。
主题通过现有 CSS 变量（`--bg-color`、`--text-color`、`--border-color`、`--cf-orange` 等）自动适配明暗主题。

---

## 4. 依赖清单

| 包 | 版本 | 用途 | 体积（gzip） |
|---|---|---|---|
| `uuid` | `^11` | UUID v7 生成 | ~2KB |
| `ulid` | `^3` | ULID 生成 | ~3KB |

需要新增 ambient 类型声明：`uuid` 自带类型；`ulid` 也自带类型。两者均无需额外 `src/types/*.d.ts`。

---

## 5. 验收标准

- [ ] `npm run build` 通过（`tsc -b` 类型检查 + `vite build`）
- [ ] 4 个工具在侧边栏「开发工具」分类下可见、可点击、可路由（含刷新深链）
- [ ] **正则测试器**：输入 `(\w+)@(\w+)` + 测试文本，正确高亮匹配、展示 2 个捕获组；输入非法正则时显示错误
- [ ] **时间戳转换器**：输入 `1690000000` 显示本地+UTC 时间；输入日期输出秒/毫秒时间戳；当前时间戳每秒刷新
- [ ] **UUID 生成器**：v4/v7/ULID 三种版本均可生成；数量=5 生成 5 个；关闭连字符后 UUID 无连字符
- [ ] **JWT 解码器**：粘贴标准 JWT，正确解码 header/payload 为格式化 JSON；含 `exp` 过期时标红
- [ ] 4 个工具的输入在刷新页面后恢复（localStorage 持久化生效）
- [ ] 明暗主题切换下，4 个工具样式正常
- [ ] 提交信息符合 Conventional Commits

---

## 6. 工作量预估

| 文件 | 类型 | 行数预估 |
|---|---|---|
| `RegexTester.tsx` | 新增 | ~220 |
| `TimestampConverter.tsx` | 新增 | ~180 |
| `UuidGenerator.tsx` | 新增 | ~150 |
| `JwtDecoder.tsx` | 新增 | ~200 |
| `App.tsx` | 修改 | ~+25 |
| `Icon.tsx` | 修改 | ~+60 |
| `storage.ts` | 修改 | ~+4 |
| `App.css` | 修改 | ~+250 |
| `package.json` | 修改 | ~+2 |
| **合计** | | **~1100 行** |

---

## 7. 不在本期范围（YAGNI）

以下功能刻意排除，保持「精简版」：
- 正则的常用正则速查表 / 历史
- 时间戳的 Cron 输助 / 多时区列表
- UUID 的历史记录 / 自定义格式
- JWT 的签名验证（需密钥，且偏离「解码」核心） / 颜色主题切换
- 任何工具的后端联动（4 个工具都是纯前端）

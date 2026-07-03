# 4 个开发工具批量实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「开发工具」分类下新增 4 个纯前端工具：正则测试器、时间戳转换器、UUID/ULID 生成器、JWT 解码器。

**Architecture:** 每个工具是一个 default 导出的函数组件，自管 state，通过 `App.tsx` 五处注册接入；持久化统一走 `STORAGE_KEYS` + `safeSetItem`/`safeGetJSON`；样式加到全局 `App.css`；图标走单 `Icon` 组件。

**Tech Stack:** React 19（新 JSX，无需 `import React`）+ TypeScript 5.9 strict；新增 `uuid@^11` + `ulid@^3`（仅 UUID 工具用到）；其余工具零新依赖。

## Global Constraints

- 组件用 `const X = () => { ... }` 形式，default 导出，文案与注释用中文（AGENTS.md §4.1、§4.4）
- 新增 localStorage key **必须**加入 `src/lib/storage.ts` 的 `STORAGE_KEYS`，禁止散落硬编码（AGENTS.md §4.6）
- 每个工具在 `App.tsx` 改五处：`ToolType` 联合、`toolCategories`、`toolIdToPath`、`pathToToolId`、条件渲染块（AGENTS.md §4.7）
- token/密钥只放请求头——本批工具均为纯前端，无网络请求，无 token 处理
- 主题用现有 CSS 变量（`--bg-color`/`--text-color`/`--border-color`/`--cf-orange`），不硬编码颜色
- 类型导入用 `import type`；对象用 `interface`，联合用 `type`
- 构建验证命令：`npm run build`（含 `tsc -b` 类型检查）
- 提交信息遵循 Conventional Commits：`feat(<scope>): <desc>`，scope 用组件名

## File Structure

| 文件 | 责任 | 新增/修改 |
|---|---|---|
| `src/lib/storage.ts` | 追加 4 个 STORAGE_KEYS | 修改 |
| `src/components/Icon.tsx` | 追加 4 个图标 | 修改 |
| `src/App.tsx` | 五处注册 4 个工具 | 修改 |
| `src/components/RegexTester.tsx` | 正则测试器组件 | 新增 |
| `src/components/TimestampConverter.tsx` | 时间戳转换器组件 | 新增 |
| `src/components/UuidGenerator.tsx` | UUID/ULID 生成器组件 | 新增 |
| `src/components/JwtDecoder.tsx` | JWT 解码器组件 | 新增 |
| `src/App.css` | 4 个工具的样式 | 修改 |
| `package.json` | 追加 `uuid`、`ulid` 依赖 | 修改 |

**执行顺序**：基础设施先行（storage/Icon/依赖）→ 逐个工具组件（每个独立可测）→ App.tsx 注册 → 样式收尾 → 全量验证。每个工具组件完成后立即注册到 App.tsx 并可独立验收，避免最后一次性集成风险。

---

## Task 1: 基础设施 — storage keys + 图标 + 依赖

**Files:**
- Modify: `src/lib/storage.ts:12-27`（`STORAGE_KEYS` 常量）
- Modify: `src/components/Icon.tsx`（新增 4 个图标分支）
- Modify: `package.json`（追加依赖）

**Interfaces:**
- Produces: `STORAGE_KEYS.regexTester` / `.timestampConverter` / `.uuidGenerator` / `.jwtDecoder`（后续任务按名引用）；Icon 支持 `name="regex"` / `"timestamp"` / `"uuid"` / `"jwt"`；`uuid`/`ulid` 可被 import。

- [ ] **Step 1: 追加 STORAGE_KEYS**

在 `src/lib/storage.ts` 的 `STORAGE_KEYS` 对象末尾（`performanceHistory: 'performanceHistory',` 之后、`} as const;` 之前）追加：

```ts
  regexTester: 'regex_tester',
  timestampConverter: 'timestamp_converter',
  uuidGenerator: 'uuid_generator',
  jwtDecoder: 'jwt_decoder',
```

- [ ] **Step 2: 追加 4 个图标到 Icon.tsx**

在 `src/components/Icon.tsx` 中找到最后一个 `{name === '...' && (...)}` 分支（`sun`）的同级位置，在闭合 `</svg>` 链之前追加 4 个分支。每个图标用 24×24 viewBox、`stroke="currentColor"`、`fill="none"` 风格，与现有图标一致：

```tsx
      {name === 'regex' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M4 4v16" /><path d="M20 4v16" />
          <circle cx="12" cy="9" r="2" /><circle cx="12" cy="15" r="2" />
          <path d="M9 9h0M15 9h0M9 15h0M15 15h0" />
        </svg>
      )}
      {name === 'timestamp' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
      )}
      {name === 'uuid' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M8 3H6a2 2 0 0 0-2 2v2M16 3h2a2 2 0 0 1 2 2v2M8 21H6a2 2 0 0 1-2-2v-2M16 21h2a2 2 0 0 0 2-2v-2" />
          <path d="M9 12h6" />
        </svg>
      )}
      {name === 'jwt' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          <circle cx="12" cy="16" r="1.5" />
        </svg>
      )}
```

- [ ] **Step 3: 追加依赖到 package.json**

在 `dependencies` 中按字母序插入（`jsonpath` 之前、`highlight.js` 之后）：

```json
    "html2canvas": "^1.4.1",
    "jszip": "^3.10.1",
    "jsonpath": "^1.3.0",
```

`jszip` 已存在（R2 下载功能引入），确认其存在即可。在 `qrcode.react` 之后、`react` 之前插入：

```json
    "ulid": "^3.0.0",
```

在 `typescript` 之前插入：

```json
    "uuid": "^11.0.0",
```

- [ ] **Step 4: 安装新依赖**

Run: `npm install uuid@^11 ulid@^3 --no-audit --no-fund`
Expected: 安装成功，无 `ETARGET`/`peer` 报错。

- [ ] **Step 5: 验证类型声明可用**

Run: `node -e "console.log('uuid', require('./node_modules/uuid/package.json').version); console.log('ulid', require('./node_modules/ulid/package.json').version)"`
Expected: 打印 `uuid 11.x.x` 和 `ulid 3.x.x`（精确版本号）。

- [ ] **Step 6: 类型检查（应通过，因尚未引用新符号）**

Run: `npm run build`
Expected: 构建成功（新图标未被使用不影响；新 STORAGE_KEYS 字段未被使用也不报错，因为它们是对象属性）。

- [ ] **Step 7: 提交**

```bash
git add src/lib/storage.ts src/components/Icon.tsx package.json
git commit -m "chore(frontend): add storage keys, icons, deps for dev tools"
```

---

## Task 2: 正则测试器（RegexTester）

**Files:**
- Create: `src/components/RegexTester.tsx`

**Interfaces:**
- Produces: `RegexTester` 组件（default 导出），无对外 API，由 `App.tsx` 通过 `<RegexTester />` 渲染。
- Consumes: `STORAGE_KEYS.regexTester`、`safeGetJSON`、`safeSetItem`、`Icon`、`MessageToast`。

- [ ] **Step 1: 创建组件文件**

创建 `src/components/RegexTester.tsx`，完整内容：

```tsx
import { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface RegexState {
  pattern: string;
  flags: string;
  testText: string;
}

const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u', 'y'] as const;

const DEFAULT_STATE: RegexState = { pattern: '', flags: 'g', testText: '' };

const RegexTester = () => {
  const [state, setState] = useState<RegexState>(() =>
    safeGetJSON<RegexState>(STORAGE_KEYS.regexTester, DEFAULT_STATE)
  );
  const [showCopyToast, setShowCopyToast] = useState(false);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.regexTester, JSON.stringify(state));
  }, [state]);

  // 解析正则 + 匹配结果，统一在 useMemo 中计算，错误也作为结果返回
  const result = useMemo(() => {
    const { pattern, flags, testText } = state;
    if (!pattern) return { kind: 'empty' as const };
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return { kind: 'error' as const, message: (e as Error).message };
    }
    if (!testText) return { kind: 'noinput' as const };

    // 收集所有匹配 + 各匹配的捕获组
    const matches: Array<{ index: number; text: string; groups: string[] }> = [];
    if (flags.includes('g')) {
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = regex.exec(testText)) !== null && guard++ < 10000) {
        matches.push({ index: m.index, text: m[0], groups: Array.from(m).slice(1) });
        if (m.index === regex.lastIndex) regex.lastIndex++; // 防止零宽匹配死循环
      }
    } else {
      const m = regex.exec(testText);
      if (m) matches.push({ index: m.index, text: m[0], groups: Array.from(m).slice(1) });
    }
    return { kind: 'ok' as const, matches };
  }, [state]);

  // 渲染带高亮的原文：把匹配区间用 <mark> 包裹
  const highlighted = useMemo(() => {
    if (result.kind !== 'ok') return null;
    const { matches } = result;
    const text = state.testText;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.index > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, m.index)}</span>);
      nodes.push(<mark key={`m${i}`} className="regex-match">{m.text}</mark>);
      cursor = m.index + m.text.length;
    });
    if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
    return nodes;
  }, [result, state.testText]);

  const toggleFlag = (flag: string) => {
    setState((s) => ({
      ...s,
      flags: s.flags.includes(flag) ? s.flags.replace(flag, '') : s.flags + flag,
    }));
  };

  const copyResult = () => {
    if (result.kind !== 'ok') return;
    const text = result.matches.map((m) => m.text).join('\n');
    navigator.clipboard.writeText(text);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  return (
    <div className="tool-container">
      <h2>正则表达式测试器</h2>
      <div className="tool-content regex-tester">
        <div className="regex-config">
          <div className="regex-pattern-row">
            <span className="regex-slash">/</span>
            <input
              type="text"
              className="regex-pattern-input"
              value={state.pattern}
              onChange={(e) => setState((s) => ({ ...s, pattern: e.target.value }))}
              placeholder="输入正则表达式"
              spellCheck={false}
            />
            <span className="regex-slash">/{state.flags}</span>
          </div>
          <div className="regex-flags">
            {FLAG_OPTIONS.map((f) => (
              <label key={f} className={`flag-chip ${state.flags.includes(f) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={state.flags.includes(f)}
                  onChange={() => toggleFlag(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <textarea
          className="regex-text-input"
          value={state.testText}
          onChange={(e) => setState((s) => ({ ...s, testText: e.target.value }))}
          placeholder="输入待匹配文本"
          spellCheck={false}
        />

        <div className="regex-result">
          {result.kind === 'empty' && <p className="regex-hint">输入正则开始匹配</p>}
          {result.kind === 'noinput' && <p className="regex-hint">输入待匹配文本</p>}
          {result.kind === 'error' && (
            <div className="regex-error"><Icon name="warning" size={16} /> {result.message}</div>
          )}
          {result.kind === 'ok' && (
            <>
              <div className="regex-highlighted">
                {highlighted}
              </div>
              <div className="regex-stats">
                共 {result.matches.length} 个匹配
                <button className="btn btn-secondary btn-small" onClick={copyResult}>
                  <Icon name="copy" size={14} /> 复制匹配
                </button>
              </div>
              {result.matches.length > 0 && (
                <table className="regex-groups-table">
                  <thead><tr><th>#</th><th>匹配</th>{result.matches[0].groups.length > 0 && <th>捕获组</th>}</tr></thead>
                  <tbody>
                    {result.matches.slice(0, 500).map((m, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="mono">{m.text || '(空匹配)'}</td>
                        {m.groups.length > 0 && (
                          <td className="mono">{m.groups.map((g) => g || '(空)').join(' | ')}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegexTester;
```

- [ ] **Step 2: 类型检查（暂未注册到 App，应能编译）**

Run: `npx tsc -b`
Expected: 无错误（组件已 import React 的类型 `React.ReactNode`——注意新 JSX 转换下无需 `import React`，但 `React.ReactNode` 类型引用需要确保环境有 React 类型，`@types/react` 已安装）。

> 若报 `Cannot find namespace 'React'`：把 `React.ReactNode` 改为 `import type { ReactNode } from 'react'` 并用 `ReactNode[]`。

- [ ] **Step 3: 提交**

```bash
git add src/components/RegexTester.tsx
git commit -m "feat(RegexTester): add regex tester with live match and groups"
```

---

## Task 3: 时间戳转换器（TimestampConverter）

**Files:**
- Create: `src/components/TimestampConverter.tsx`

**Interfaces:**
- Produces: `TimestampConverter` 组件（default 导出）。
- Consumes: `STORAGE_KEYS.timestampConverter`、`safeGetJSON`、`safeSetItem`、`Icon`、`MessageToast`。

- [ ] **Step 1: 创建组件文件**

创建 `src/components/TimestampConverter.tsx`：

```tsx
import { useState, useEffect } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface TsState {
  timestampInput: string;
}

const DEFAULT_STATE: TsState = { timestampInput: '' };

// 把时间戳规范化为毫秒数：10 位按秒、13 位按毫秒
const toMillis = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!isFinite(num)) return null;
  return trimmed.length <= 10 ? num * 1000 : num;
};

const formatDate = (date: Date): string => {
  return date.toLocaleString('zh-CN', { hour12: false });
};

const TimestampConverter = () => {
  const [timestampInput, setTimestampInput] = useState<string>(() =>
    safeGetJSON<TsState>(STORAGE_KEYS.timestampConverter, DEFAULT_STATE).timestampInput
  );
  const [dateInput, setDateInput] = useState<string>('');
  const [now, setNow] = useState<number>(Date.now());
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.timestampConverter, JSON.stringify({ timestampInput }));
  }, [timestampInput]);

  // 当前时间戳每秒刷新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 时间戳 → 日期结果
  const tsResult = (() => {
    if (!timestampInput.trim()) return null;
    const millis = toMillis(timestampInput);
    if (millis === null) return { error: '请输入纯数字时间戳' };
    const date = new Date(millis);
    if (isNaN(date.getTime())) return { error: '时间戳超出有效范围' };
    return {
      local: formatDate(date),
      utc: date.toISOString(),
      seconds: Math.floor(millis / 1000),
      millis,
    };
  })();

  // 日期 → 时间戳结果
  const dateResult = (() => {
    if (!dateInput) return null;
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return { error: '无效日期' };
    return {
      seconds: Math.floor(date.getTime() / 1000),
      millis: date.getTime(),
      local: formatDate(date),
    };
  })();

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制: ${text}`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  const useNow = () => {
    const ms = Date.now();
    setTimestampInput(String(ms));
  };

  return (
    <div className="tool-container">
      <h2>时间戳转换器</h2>
      <div className="tool-content timestamp-converter">
        <div className="ts-now-bar">
          <span className="ts-now-label">当前时间戳</span>
          <span className="ts-now-value mono">{now}</span>
          <button className="btn btn-secondary btn-small" onClick={useNow}>填入</button>
          <button className="btn btn-secondary btn-small" onClick={() => copyText(String(now))}>
            <Icon name="copy" size={14} /> 复制
          </button>
        </div>

        <div className="ts-columns">
          <div className="ts-col">
            <h3>时间戳 → 日期</h3>
            <input
              type="text"
              className="ts-input mono"
              value={timestampInput}
              onChange={(e) => setTimestampInput(e.target.value)}
              placeholder="输入 Unix 时间戳（秒或毫秒）"
            />
            <p className="ts-hint">10 位按秒、13 位按毫秒，自动识别</p>
            {tsResult && 'error' in tsResult && <div className="ts-error">{tsResult.error}</div>}
            {tsResult && !('error' in tsResult) && (
              <div className="ts-result-card">
                <div className="ts-row"><label>本地时间</label><span>{tsResult.local}</span></div>
                <div className="ts-row"><label>UTC (ISO)</label><span className="mono">{tsResult.utc}</span></div>
                <div className="ts-row">
                  <label>秒级</label>
                  <span className="mono">{tsResult.seconds}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(tsResult.seconds))}><Icon name="copy" size={12} /></button>
                </div>
                <div className="ts-row">
                  <label>毫秒级</label>
                  <span className="mono">{tsResult.millis}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(tsResult.millis))}><Icon name="copy" size={12} /></button>
                </div>
              </div>
            )}
          </div>

          <div className="ts-col">
            <h3>日期 → 时间戳</h3>
            <input
              type="datetime-local"
              className="ts-input"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
            />
            <p className="ts-hint">选择本地日期时间</p>
            {dateResult && 'error' in dateResult && <div className="ts-error">{dateResult.error}</div>}
            {dateResult && !('error' in dateResult) && (
              <div className="ts-result-card">
                <div className="ts-row"><label>本地时间</label><span>{dateResult.local}</span></div>
                <div className="ts-row">
                  <label>秒级</label>
                  <span className="mono">{dateResult.seconds}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(dateResult.seconds))}><Icon name="copy" size={12} /></button>
                </div>
                <div className="ts-row">
                  <label>毫秒级</label>
                  <span className="mono">{dateResult.millis}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(dateResult.millis))}><Icon name="copy" size={12} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <MessageToast show={showCopyToast} message={copiedText} />
    </div>
  );
};

export default TimestampConverter;
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/TimestampConverter.tsx
git commit -m "feat(TimestampConverter): add unix timestamp <-> date converter"
```

---

## Task 4: UUID/ULID 生成器（UuidGenerator）

**Files:**
- Create: `src/components/UuidGenerator.tsx`

**Interfaces:**
- Produces: `UuidGenerator` 组件（default 导出）。
- Consumes: `STORAGE_KEYS.uuidGenerator`、`safeGetJSON`、`safeSetItem`、`Icon`、`MessageToast`、`uuid`（`v7`）、`ulid`。

- [ ] **Step 1: 创建组件文件**

创建 `src/components/UuidGenerator.tsx`：

```tsx
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { ulid } from 'ulid';
import Icon from './Icon';
import MessageToast from './MessageToast';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

type IdVersion = 'uuid-v4' | 'uuid-v7' | 'ulid';

interface UuidState {
  version: IdVersion;
  count: number;
  hyphenated: boolean;
}

const DEFAULT_STATE: UuidState = { version: 'uuid-v4', count: 1, hyphenated: true };

const generateOne = (version: IdVersion, hyphenated: boolean): string => {
  let id: string;
  switch (version) {
    case 'uuid-v4': id = uuidv4(); break;
    case 'uuid-v7': id = uuidv7(); break;
    case 'ulid': id = ulid(); break;
  }
  // ULID 本身无连字符；UUID 在 hyphenated=false 时去掉
  if (!hyphenated && version !== 'ulid') {
    id = id.replace(/-/g, '');
  }
  return id;
};

const UuidGenerator = () => {
  const [state, setState] = useState<UuidState>(() =>
    safeGetJSON<UuidState>(STORAGE_KEYS.uuidGenerator, DEFAULT_STATE)
  );
  const [results, setResults] = useState<string[]>([]);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.uuidGenerator, JSON.stringify(state));
  }, [state]);

  const generate = useCallback(() => {
    const { version, count, hyphenated } = state;
    const n = Math.max(1, Math.min(100, count));
    setResults(Array.from({ length: n }, () => generateOne(version, hyphenated)));
  }, [state]);

  // 首次挂载生成一次，让用户立刻看到结果
  useEffect(() => {
    generate();
    // 故意只跑一次：依赖 generate 会在每次 state 变化时重新生成，
    // 但那是期望行为（用户改了版本/数量/连字符后想看新结果）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate]);

  const copyOne = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制: ${text}`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  const copyAll = () => {
    const text = results.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制 ${results.length} 个`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  return (
    <div className="tool-container">
      <h2>UUID / ULID 生成器</h2>
      <div className="tool-content uuid-generator">
        <div className="uuid-config">
          <div className="uuid-field">
            <label>版本</label>
            <div className="uuid-version-options">
              {(['uuid-v4', 'uuid-v7', 'ulid'] as IdVersion[]).map((v) => (
                <label key={v} className={`uuid-version-chip ${state.version === v ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="id-version"
                    checked={state.version === v}
                    onChange={() => setState((s) => ({ ...s, version: v }))}
                  />
                  {v === 'uuid-v4' ? 'UUID v4' : v === 'uuid-v7' ? 'UUID v7' : 'ULID'}
                </label>
              ))}
            </div>
          </div>

          <div className="uuid-field">
            <label>数量 (1-100)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={state.count}
              onChange={(e) => setState((s) => ({ ...s, count: Number(e.target.value) || 1 }))}
              className="uuid-count-input"
            />
          </div>

          <div className="uuid-field">
            <label>连字符</label>
            <label className={`uuid-version-chip ${state.hyphenated ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={state.hyphenated}
                onChange={(e) => setState((s) => ({ ...s, hyphenated: e.target.checked }))}
                disabled={state.version === 'ulid'}
              />
              {state.hyphenated ? '保留 (-)' : '去除'}
            </label>
            {state.version === 'ulid' && <span className="uuid-hint">ULID 无连字符</span>}
          </div>

          <button className="btn btn-primary" onClick={generate}>
            <Icon name="refresh" size={14} /> 重新生成
          </button>
        </div>

        {results.length > 0 && (
          <div className="uuid-results">
            <div className="uuid-results-header">
              <span>共 {results.length} 个</span>
              <button className="btn btn-secondary btn-small" onClick={copyAll}>
                <Icon name="copy" size={14} /> 复制全部
              </button>
            </div>
            <div className="uuid-list">
              {results.map((id, i) => (
                <div key={i} className="uuid-item">
                  <span className="mono">{id}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyOne(id)}>
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <MessageToast show={showCopyToast} message={copiedText} />
    </div>
  );
};

export default UuidGenerator;
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。`uuid` 和 `ulid` 都自带类型声明。

- [ ] **Step 3: 提交**

```bash
git add src/components/UuidGenerator.tsx
git commit -m "feat(UuidGenerator): add batch UUID v4/v7 and ULID generator"
```

---

## Task 5: JWT 解码器（JwtDecoder）

**Files:**
- Create: `src/components/JwtDecoder.tsx`

**Interfaces:**
- Produces: `JwtDecoder` 组件（default 导出）。
- Consumes: `STORAGE_KEYS.jwtDecoder`、`safeGetJSON`、`safeSetItem`、`Icon`、`MessageToast`。

- [ ] **Step 1: 创建组件文件**

创建 `src/components/JwtDecoder.tsx`：

```tsx
import { useState, useEffect } from 'react';
import Icon from './Icon';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface JwtState {
  token: string;
}

const DEFAULT_STATE: JwtState = { token: '' };

// base64url → 普通字符串（UTF-8 安全）
const decodeBase64Url = (input: string): string => {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  // 补齐到 4 的倍数
  while (s.length % 4) s += '=';
  const binary = atob(s);
  // 处理 UTF-8（atob 返回的是 binary string）
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

interface DecodedJwt {
  header: unknown;
  payload: unknown;
  signature: string;
}

interface ExpInfo {
  expired: boolean;
  expDate: string | null;
  remaining: string | null;
}

// 把任意值渲染为带简单着色的格式化 JSON
const renderJson = (value: unknown, indent = 0): React.ReactNode => {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string') return <span className="json-string">"{value}"</span>;
  if (typeof value === 'number') return <span className="json-number">{value}</span>;
  if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <span>
        {'[\n'}
        {value.map((v, i) => (
          <span key={i}>
            {padInner}{renderJson(v, indent + 1)}{i < value.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {pad}{']'}
      </span>
    );
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <span>
        {'{\n'}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {padInner}<span className="json-key">"{k}"</span>{': '}{renderJson(v, indent + 1)}{i < entries.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {pad}{'}'}
      </span>
    );
  }
  return <span>{String(value)}</span>;
};

const JwtDecoder = () => {
  const [token, setToken] = useState<string>(() =>
    safeGetJSON<JwtState>(STORAGE_KEYS.jwtDecoder, DEFAULT_STATE).token
  );

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.jwtDecoder, JSON.stringify({ token }));
  }, [token]);

  // 解析结果
  const result = (() => {
    const trimmed = token.trim();
    if (!trimmed) return { kind: 'empty' as const };
    const parts = trimmed.split('.');
    if (parts.length !== 3) return { kind: 'error' as const, message: 'JWT 应为 3 段（header.payload.signature），用 . 分隔' };
    try {
      const header = JSON.parse(decodeBase64Url(parts[0]));
      const payload = JSON.parse(decodeBase64Url(parts[1]));
      const decoded: DecodedJwt = { header, payload, signature: parts[2] };
      return { kind: 'ok' as const, decoded };
    } catch (e) {
      return { kind: 'error' as const, message: `解码失败: ${(e as Error).message}` };
    }
  })();

  // exp 校验
  const expInfo = (() => {
    if (result.kind !== 'ok') return null;
    const payload = result.decoded.payload as Record<string, unknown> | null;
    if (!payload || typeof payload.exp !== 'number') {
      return { expired: false, expDate: null, remaining: null } as ExpInfo;
    }
    const expMillis = payload.exp * 1000;
    const now = Date.now();
    const expired = now >= expMillis;
    const diff = Math.abs(expMillis - now);
    const remaining = diff > 86400000
      ? `${Math.floor(diff / 86400000)} 天`
      : `${Math.floor(diff / 3600000)} 小时 ${Math.floor((diff % 3600000) / 60000)} 分`;
    return { expired, expDate: new Date(expMillis).toLocaleString('zh-CN', { hour12: false }), remaining };
  })();

  const alg = result.kind === 'ok'
    ? ((result.decoded.header as Record<string, unknown>)?.alg as string ?? '未知')
    : '';

  return (
    <div className="tool-container">
      <h2>JWT 解码器</h2>
      <div className="tool-content jwt-decoder">
        <textarea
          className="jwt-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 JWT (eyJ...)"
          spellCheck={false}
        />

        <div className="jwt-output">
          {result.kind === 'empty' && <p className="jwt-hint">粘贴 JWT 开始解码</p>}
          {result.kind === 'error' && (
            <div className="jwt-error"><Icon name="warning" size={16} /> {result.message}</div>
          )}
          {result.kind === 'ok' && (
            <>
              <div className="jwt-meta">
                <span className="jwt-meta-item">算法: <strong>{alg}</strong></span>
                {expInfo && expInfo.expDate && (
                  <span className={`jwt-exp ${expInfo.expired ? 'expired' : 'valid'}`}>
                    {expInfo.expired
                      ? `已过期（${expInfo.expDate}）`
                      : `有效，剩余 ${expInfo.remaining}（${expInfo.expDate}）`}
                  </span>
                )}
              </div>
              <div className="jwt-segment jwt-header">
                <h4>Header</h4>
                <pre className="json-view">{renderJson(result.decoded.header)}</pre>
              </div>
              <div className="jwt-segment jwt-payload">
                <h4>Payload</h4>
                <pre className="json-view">{renderJson(result.decoded.payload)}</pre>
              </div>
              <div className="jwt-segment jwt-signature">
                <h4>Signature</h4>
                <code className="mono">{result.decoded.signature || '(空)'}</code>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JwtDecoder;
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。`React.ReactNode` 引用同 Task 2 Step 2 注释处理。

- [ ] **Step 3: 提交**

```bash
git add src/components/JwtDecoder.tsx
git commit -m "feat(JwtDecoder): add JWT header/payload decoder with exp check"
```

---

## Task 6: App.tsx 注册 4 个工具

**Files:**
- Modify: `src/App.tsx:23`（ToolType）、`:82-89`（toolCategories）、`:92-109`（toolIdToPath）、`:112-129`（pathToToolId）、`:326-341`（条件渲染）、import 区

**Interfaces:**
- Consumes: `RegexTester`、`TimestampConverter`、`UuidGenerator`、`JwtDecoder`（来自 Task 2-5）。

- [ ] **Step 1: 追加 import**

在 `src/App.tsx` 顶部 import 区，找到其它组件 import（如 `import CurlBuilder from './components/CurlBuilder';`）后追加：

```tsx
import RegexTester from './components/RegexTester';
import TimestampConverter from './components/TimestampConverter';
import UuidGenerator from './components/UuidGenerator';
import JwtDecoder from './components/JwtDecoder';
```

- [ ] **Step 2: 扩展 ToolType 联合类型**

`src/App.tsx:23`，把联合类型末尾 `| 'curl-builder';` 改为：

```ts
type ToolType = 'json' | 'diff' | 'qr' | 'url-encoder' | 'byte-converter' | 'base64' | 'r2-manager' | 'markdown-viewer' | 'r2-image-manager' | 'notes' | 'knowledge' | 'performance' | 'jsonl-viewer' | 'impl-viewer' | 'sse-viewer' | 'curl-builder' | 'regex' | 'timestamp' | 'uuid' | 'jwt';
```

- [ ] **Step 3: toolCategories 的「开发工具」追加 4 项**

`src/App.tsx:85-87`，把：

```tsx
    tools: [
      { id: 'performance', name: '性能分析器', description: '上传数据生成甘特图进行性能分析' }
    ]
```

改为：

```tsx
    tools: [
      { id: 'performance', name: '性能分析器', description: '上传数据生成甘特图进行性能分析' },
      { id: 'regex', name: '正则测试', description: '正则表达式实时匹配与捕获组' },
      { id: 'timestamp', name: '时间戳转换', description: 'Unix时间戳与日期互转' },
      { id: 'uuid', name: 'UUID生成器', description: '批量生成UUID/ULID' },
      { id: 'jwt', name: 'JWT解码', description: '解码JWT的Header与Payload' }
    ]
```

- [ ] **Step 4: toolIdToPath 追加 4 条**

`src/App.tsx:108`，在 `'curl-builder': 'curl-builder'` 行后、闭合 `};` 前追加：

```tsx
  ,
  'regex': 'regex',
  'timestamp': 'timestamp',
  'uuid': 'uuid',
  'jwt': 'jwt'
```

- [ ] **Step 5: pathToToolId 追加 4 条**

`src/App.tsx:128`，在 `'curl-builder': 'curl-builder'` 行后、闭合 `};` 前追加：

```tsx
  ,
  'regex': 'regex',
  'timestamp': 'timestamp',
  'uuid': 'uuid',
  'jwt': 'jwt'
```

- [ ] **Step 6: 条件渲染块追加 4 行**

`src/App.tsx:341`，在 `{activeTool === 'curl-builder' && <CurlBuilder />}` 后追加：

```tsx
          {activeTool === 'regex' && <RegexTester />}
          {activeTool === 'timestamp' && <TimestampConverter />}
          {activeTool === 'uuid' && <UuidGenerator />}
          {activeTool === 'jwt' && <JwtDecoder />}
```

- [ ] **Step 7: 类型检查 + 构建验证**

Run: `npm run build`
Expected: 构建成功。`ToolType` 现在有 20 个成员，四个 `Record<ToolType, string>` 都必须覆盖全（已在 Step 4/5 加齐），否则 `tsc` 会报缺少属性。

> 若 `tsc` 报 `Property 'regex' is missing in type`：检查 toolIdToPath/pathToToolId 是否都加齐 4 条。

- [ ] **Step 8: 浏览器手动验收**

Run: `npm run dev`，打开 http://localhost:3000/ ，逐项确认：
- 侧边栏「开发工具」分类下出现 4 个新工具
- 点「正则测试」→ 输入 `\w+` + 文本 → 看到高亮
- 点「时间戳转换」→ 输入 `1690000000` → 看到日期
- 点「UUID生成器」→ 默认生成 1 个 v4
- 点「JWT解码」→ 粘贴测试 JWT（见下方）→ 看到 header/payload
- 刷新页面 → URL 仍是 `/regex` 等（深链生效）；输入恢复（持久化生效）

测试 JWT（header `{"alg":"HS256","typ":"JWT"}` + payload `{"sub":"123","exp":9999999999}`）：

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjk5OTk5OTk5OTl9.abc123
```

- [ ] **Step 9: 提交**

```bash
git add src/App.tsx
git commit -m "feat(frontend): register regex/timestamp/uuid/jwt tools"
```

---

## Task 7: 样式收尾（App.css）

**Files:**
- Modify: `src/App.css`（文件末尾追加）

**Interfaces:** 无（纯样式）。

- [ ] **Step 1: 在 App.css 末尾追加样式**

在 `src/App.css` 末尾追加（所有变量引用现有 CSS 变量，主题自适应）：

```css
/* ===== 正则测试器 ===== */
.regex-tester { display: flex; flex-direction: column; gap: 16px; }
.regex-config { display: flex; flex-direction: column; gap: 10px; }
.regex-pattern-row { display: flex; align-items: center; gap: 6px; font-family: var(--mono-font, monospace); font-size: 16px; }
.regex-pattern-input { flex: 1; font-family: var(--mono-font, monospace); font-size: 16px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); }
.regex-slash { color: var(--cf-orange); font-weight: 600; }
.regex-flags { display: flex; gap: 8px; flex-wrap: wrap; }
.flag-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 14px; cursor: pointer; font-family: var(--mono-font, monospace); font-size: 13px; user-select: none; }
.flag-chip.active { border-color: var(--cf-orange); color: var(--cf-orange); background: color-mix(in srgb, var(--cf-orange) 10%, transparent); }
.flag-chip input { display: none; }
.regex-text-input { width: 100%; min-height: 120px; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); font-family: var(--mono-font, monospace); font-size: 14px; resize: vertical; }
.regex-result { padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--card-bg, var(--bg-color)); }
.regex-highlighted { white-space: pre-wrap; word-break: break-all; font-family: var(--mono-font, monospace); line-height: 1.6; }
.regex-match { background: color-mix(in srgb, var(--cf-orange) 35%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.regex-error { color: #e53935; display: flex; align-items: center; gap: 6px; }
.regex-hint { color: var(--text-secondary, #888); }
.regex-stats { display: flex; align-items: center; gap: 12px; margin: 10px 0; color: var(--text-secondary, #888); font-size: 13px; }
.regex-groups-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
.regex-groups-table th, .regex-groups-table td { border: 1px solid var(--border-color); padding: 6px 8px; text-align: left; }
.regex-groups-table th { background: color-mix(in srgb, var(--text-color) 8%, transparent); }
.mono { font-family: var(--mono-font, monospace); }

/* ===== 时间戳转换器 ===== */
.timestamp-converter { display: flex; flex-direction: column; gap: 16px; }
.ts-now-bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--card-bg, var(--bg-color)); }
.ts-now-label { font-size: 13px; color: var(--text-secondary, #888); }
.ts-now-value { font-size: 16px; font-weight: 600; }
.ts-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.ts-col { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; }
.ts-col h3 { margin: 0 0 4px 0; font-size: 15px; }
.ts-input { padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); }
.ts-hint { font-size: 12px; color: var(--text-secondary, #888); margin: 0; }
.ts-error { color: #e53935; font-size: 13px; }
.ts-result-card { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.ts-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.ts-row label { min-width: 72px; color: var(--text-secondary, #888); }
.ts-row span { flex: 1; word-break: break-all; }
@media (max-width: 768px) { .ts-columns { grid-template-columns: 1fr; } }

/* ===== UUID 生成器 ===== */
.uuid-generator { display: flex; flex-direction: column; gap: 16px; }
.uuid-config { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; }
.uuid-field { display: flex; flex-direction: column; gap: 4px; }
.uuid-field > label:first-child { font-size: 12px; color: var(--text-secondary, #888); }
.uuid-version-options { display: flex; gap: 6px; }
.uuid-version-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 14px; cursor: pointer; font-size: 13px; user-select: none; }
.uuid-version-chip input { display: none; }
.uuid-version-chip.active { border-color: var(--cf-orange); color: var(--cf-orange); background: color-mix(in srgb, var(--cf-orange) 10%, transparent); }
.uuid-count-input { width: 80px; padding: 6px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); }
.uuid-hint { font-size: 11px; color: var(--text-secondary, #888); }
.uuid-results { display: flex; flex-direction: column; gap: 8px; }
.uuid-results-header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--text-secondary, #888); }
.uuid-list { display: flex; flex-direction: column; gap: 4px; }
.uuid-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 6px; }
.uuid-item .mono { flex: 1; word-break: break-all; font-size: 13px; }

/* ===== JWT 解码器 ===== */
.jwt-decoder { display: flex; flex-direction: column; gap: 16px; }
.jwt-input { width: 100%; min-height: 100px; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); font-family: var(--mono-font, monospace); font-size: 13px; resize: vertical; word-break: break-all; }
.jwt-output { display: flex; flex-direction: column; gap: 12px; }
.jwt-hint { color: var(--text-secondary, #888); }
.jwt-error { color: #e53935; display: flex; align-items: center; gap: 6px; }
.jwt-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; }
.jwt-exp.valid { color: #43a047; }
.jwt-exp.expired { color: #e53935; font-weight: 600; }
.jwt-segment { padding: 10px; border-radius: 6px; border-left: 4px solid; }
.jwt-segment h4 { margin: 0 0 6px 0; font-size: 13px; }
.jwt-header { border-left-color: #e53935; background: color-mix(in srgb, #e53935 8%, transparent); }
.jwt-payload { border-left-color: #8e24aa; background: color-mix(in srgb, #8e24aa 8%, transparent); }
.jwt-signature { border-left-color: #1e88e5; background: color-mix(in srgb, #1e88e5 8%, transparent); }
.json-view { margin: 0; font-family: var(--mono-font, monospace); font-size: 13px; white-space: pre-wrap; word-break: break-all; }
.json-key { color: var(--cf-orange); }
.json-string { color: #43a047; }
.json-number { color: #1e88e5; }
.json-boolean { color: #8e24aa; }
.json-null { color: var(--text-secondary, #888); }
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，CSS 无报错。

- [ ] **Step 3: 浏览器主题验证**

Run: `npm run dev`，确认：
- 明暗主题切换下，4 个工具样式正常（重点看 `color-mix` 兼容性——现代浏览器均支持）
- 移动端宽度下时间戳双列变单列

- [ ] **Step 4: 提交**

```bash
git add src/App.css
git commit -m "feat(frontend): add styles for regex/timestamp/uuid/jwt tools"
```

---

## Task 8: 全量验收与最终验证

**Files:** 无改动，纯验证。

- [ ] **Step 1: 全量类型检查 + 构建**

Run: `npm run build`
Expected: `tsc -b` + `vite build` 全部成功。

- [ ] **Step 2: 对照 spec 验收清单逐项确认**

参照 `docs/superpowers/specs/2026-07-03-dev-tools-batch-design.md` §5，在浏览器中逐项验收：
- [ ] 4 工具在侧边栏可见、可路由（含刷新深链）
- [ ] 正则：`(\w+)@(\w+)` + `a@b c@d` → 2 匹配、各 2 捕获组；非法正则显示错误
- [ ] 时间戳：`1690000000` → 日期；日期选择 → 时间戳；当前时间戳每秒刷新
- [ ] UUID：v4/v7/ULID 均可生成；数量 5 → 5 个；去连字符后 UUID 无 `-`
- [ ] JWT：标准 JWT → header/payload 解码；含 exp 时显示有效/过期
- [ ] 刷新后输入恢复；明暗主题正常

- [ ] **Step 3: 检查 git 状态干净**

Run: `git status`
Expected: `nothing to commit, working tree clean`。

---

## 验收对照（spec §5 覆盖矩阵）

| spec 验收项 | 覆盖任务 |
|---|---|
| `npm run build` 通过 | Task 6 Step 7、Task 7 Step 2、Task 8 Step 1 |
| 4 工具可见/可路由 | Task 6（注册）+ Task 8 Step 2 |
| 正则匹配/捕获组/错误 | Task 2 + Task 8 Step 2 |
| 时间戳互转/当前刷新 | Task 3 + Task 8 Step 2 |
| UUID v4/v7/ULID/数量/连字符 | Task 4 + Task 8 Step 2 |
| JWT 解码/exp 校验 | Task 5 + Task 8 Step 2 |
| 持久化恢复 | Task 2-5（各 useEffect）+ Task 8 Step 2 |
| 明暗主题 | Task 7（CSS 变量）+ Task 8 Step 2 |
| 提交规范 | Task 1-7 各 commit step |

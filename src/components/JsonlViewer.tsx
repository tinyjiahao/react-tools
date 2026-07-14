import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from './Icon';
import MessageToast from './MessageToast';

interface ParsedLine {
  raw: string;
  parsed: Record<string, unknown> | null;
  error: string | null;
}

function highlightJson(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'json-key' : 'json-string';
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
}

interface ContentPart {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image' | 'json';
  // text
  text?: string;
  // tool_use
  toolId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  // tool_result
  toolUseId?: string;
  resultContent?: string;
  isError?: boolean;
  jsonValue?: unknown;
}

type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface ConversationMessage {
  ts: string;
  role: MessageRole;
  content: string; // 向后兼容纯文本
  parts?: ContentPart[]; // 结构化内容
  meta?: string;
}

// 判断是否是对话格式（每行都有 role + content）
function isConversationFormat(lines: ParsedLine[]): boolean {
  const valid = lines.filter(l => l.parsed !== null);
  if (valid.length === 0) return false;
  return valid.every(l => {
    const p = l.parsed!;
    return typeof p['role'] === 'string' && typeof p['content'] === 'string';
  });
}

// 将连续消息按"会话段"分组（遇到 system 消息视为新会话开始）
function groupIntoSessions(messages: ConversationMessage[]): ConversationMessage[][] {
  const sessions: ConversationMessage[][] = [];
  let current: ConversationMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system' && current.length > 0) {
      sessions.push(current);
      current = [];
    }
    current.push(msg);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return ts;
  }
}

const ROLE_LABEL: Record<string, string> = {
  system: '系统提示',
  user: '用户',
  assistant: 'AI 助手',
  tool: '工具结果',
};

const ROLE_COLOR: Record<string, string> = {
  system: 'role-system',
  user: 'role-user',
  assistant: 'role-assistant',
  tool: 'role-tool',
};

const COLLAPSE_TEXT_THRESHOLD = 900;
const COLLAPSE_PARTS_THRESHOLD = 2;
const COLLAPSED_PREVIEW_LENGTH = 280;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeRole(role: unknown): MessageRole {
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
    ? role
    : 'assistant';
}

// 代码块组件：带语言 badge 和复制按钮
const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{language || 'text'}</span>
        <button className="chat-code-copy" onClick={handleCopy}>
          <Icon name="copy" size={12} />
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="chat-code-pre">
        <code className={language ? `language-${language}` : ''}>{children}</code>
      </pre>
    </div>
  );
};

// 预处理内容：将 <IMPL_JSON>...</IMPL_JSON> 转为 ```json 代码块
function preprocessContent(content: string): string {
  return content.replace(/<IMPL_JSON>([\s\S]*?)<\/IMPL_JSON>/g, (_match, jsonStr: string) => {
    const trimmed = jsonStr.trim();
    return '```json\n' + trimmed + '\n```';
  });
}

// Markdown 渲染组件（统一用于 system / user / assistant）
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const processed = useMemo(() => preprocessContent(content), [content]);
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 拦截 pre > code 整体，作为代码块渲染
          pre({ children }) {
            // children 是 <code>，从中提取 className 和文本
            const codeEl = React.Children.toArray(children).find(
              (child): child is React.ReactElement =>
                React.isValidElement(child) && (child as React.ReactElement).type === 'code'
            ) as React.ReactElement | undefined;
            if (!codeEl) return <pre>{children}</pre>;
            const cls = (codeEl.props as { className?: string }).className || '';
            const match = /language-(\w+)/.exec(cls);
            const text = String((codeEl.props as { children?: unknown }).children ?? '').replace(/\n$/, '');
            return <CodeBlock language={match?.[1]}>{text}</CodeBlock>;
          },
          // 内联 code 保持原样
          code({ className, children, ...props }) {
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};

// 渲染单个 ContentPart
const ContentPartRender: React.FC<{
  part: ContentPart;
}> = ({ part }) => {
  if (part.type === 'text' && part.text) {
    return <MarkdownContent content={part.text} />;
  }

  if (part.type === 'tool_use') {
    return (
      <div className="chat-tool-use">
        <div className="chat-tool-use-header">
          <span className="chat-tool-use-badge">Tool</span>
          <span className="chat-tool-use-name">{part.toolName || part.toolId || 'unknown'}</span>
        </div>
        {part.toolInput && Object.keys(part.toolInput).length > 0 && (
          <pre className="chat-tool-use-input">
            <code>{JSON.stringify(part.toolInput, null, 2)}</code>
          </pre>
        )}
      </div>
    );
  }

  if (part.type === 'tool_result') {
    return (
      <div className={`chat-tool-result${part.isError ? ' chat-tool-result--error' : ''}`}>
        <div className="chat-tool-result-header">
          <span className="chat-tool-result-badge">{part.isError ? 'Error' : 'Result'}</span>
        </div>
        {part.resultContent && (
          <pre className="chat-tool-result-content">
            <code>{part.resultContent.length > 2000
              ? part.resultContent.slice(0, 2000) + '\n... (truncated)'
              : part.resultContent}</code>
          </pre>
        )}
      </div>
    );
  }

  if (part.type === 'thinking' && part.text) {
    return (
      <details className="chat-thinking">
        <summary className="chat-thinking-summary">Thinking...</summary>
        <div className="chat-thinking-body">{part.text}</div>
      </details>
    );
  }

  if (part.type === 'image') {
    return <div className="chat-image-placeholder">[图片]</div>;
  }

  if (part.type === 'json') {
    return (
      <pre className="chat-json-part">
        <code>{stringifyUnknown(part.jsonValue)}</code>
      </pre>
    );
  }

  return null;
};

// 单条消息气泡
const MessageBubble: React.FC<{
  msg: ConversationMessage;
  index: number;
  onCopy: (text: string) => void;
}> = ({ msg, onCopy }) => {
  const isSystem = msg.role === 'system';
  const hasParts = msg.parts && msg.parts.length > 0;
  const shouldCollapseByDefault = msg.content.length > COLLAPSE_TEXT_THRESHOLD ||
    (msg.parts?.length ?? 0) > COLLAPSE_PARTS_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(!shouldCollapseByDefault);
  const canToggle = shouldCollapseByDefault;
  const isCollapsed = canToggle && !isExpanded;
  const preview = msg.content.length > COLLAPSED_PREVIEW_LENGTH
    ? msg.content.slice(0, COLLAPSED_PREVIEW_LENGTH).trimEnd() + '...'
    : msg.content;

  useEffect(() => {
    setIsExpanded(!shouldCollapseByDefault);
  }, [msg.content, shouldCollapseByDefault]);

  return (
    <div className={`chat-message chat-message--${msg.role}`}>
      <div className="chat-message-header">
        <span className={`chat-role-badge ${ROLE_COLOR[msg.role]}`}>
          {ROLE_LABEL[msg.role] ?? msg.role}
        </span>
        {msg.ts && (
          <span className="chat-timestamp">{formatTime(msg.ts)}</span>
        )}
        {msg.meta && <span className="chat-message-meta">{msg.meta}</span>}
        <div className="chat-message-actions">
          {canToggle && (
            <button
              className="chat-action-btn"
              onClick={() => setIsExpanded(current => !current)}
              title={isCollapsed ? '展开内容' : '折叠内容'}
            >
              {isCollapsed ? '展开' : '折叠'}
            </button>
          )}
          <button
            className="chat-action-btn"
            onClick={() => onCopy(msg.content)}
            title="复制内容"
          >
            <Icon name="copy" size={14} />
          </button>
        </div>
      </div>

      <div className={`chat-message-body${isSystem ? ' chat-message-body--system' : ''}${isCollapsed ? ' chat-message-body--collapsed' : ''}`}>
        {isCollapsed ? (
          <>
            <MarkdownContent content={preview} />
            <button
              className="chat-expand-inline"
              onClick={() => setIsExpanded(true)}
            >
              展开内容
            </button>
          </>
        ) : hasParts ? (
          msg.parts!.map((part, idx) => (
            <ContentPartRender key={idx} part={part} />
          ))
        ) : (
          <MarkdownContent content={msg.content} />
        )}
      </div>
    </div>
  );
};

// 对话视图
const ConversationView: React.FC<{
  lines: ParsedLine[];
  fileName: string;
  onReset: () => void;
}> = ({ lines, fileName, onReset }) => {
  const [showCopied, setShowCopied] = useState(false);
  const [activeSession, setActiveSession] = useState(0);

  const messages = useMemo(
    () => lines.filter(l => l.parsed).map(l => l.parsed as unknown as ConversationMessage),
    [lines]
  );

  const sessions = useMemo(() => groupIntoSessions(messages), [messages]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  }, []);

  const currentMessages = sessions[activeSession] ?? [];

  return (
    <div className="tool-container">
      <div className="tool-content chat-view">
        {/* 顶部工具栏 */}
        <div className="tool-header chat-header">
          <h2 className="tool-title" style={{ marginBottom: 0 }}>JSONL 查看器</h2>
          <span className="jsonl-file-info">
            <Icon name="file" size={14} />
            {fileName}
          </span>
          <span className="jsonl-stats">
            {sessions.length} 个会话 · {messages.length} 条消息
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onReset}>
            重新上传
          </button>
        </div>

        {/* 多 session 标签 */}
        {sessions.length > 1 && (
          <div className="chat-session-tabs">
            {sessions.map((s, i) => {
              const systemMsg = s.find(m => m.role === 'system');
              const label = systemMsg
                ? systemMsg.content.slice(0, 30) + (systemMsg.content.length > 30 ? '…' : '')
                : `会话 ${i + 1}`;
              return (
                <button
                  key={i}
                  className={`chat-session-tab${activeSession === i ? ' active' : ''}`}
                  onClick={() => setActiveSession(i)}
                >
                  <span className="chat-session-tab-index">会话 {i + 1}</span>
                  <span className="chat-session-tab-label">{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 消息列表 */}
        <div className="chat-messages">
          {currentMessages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              msg={msg}
              index={idx}
              onCopy={handleCopy}
            />
          ))}
        </div>
      </div>
      <MessageToast show={showCopied} message="已复制到剪贴板" />
    </div>
  );
};

// 将 content 字段统一为字符串（兼容多模态数组格式）
function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (p['type'] === 'text' && typeof p['text'] === 'string') return p['text'];
          if (p['type'] === 'tool_use' || p['type'] === 'toolCall') {
            const name = p['name'] || '';
            const input = p['input'] ?? p['arguments'];
            return `[Tool: ${name}] ${typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input || '')}`;
          }
          if (p['type'] === 'tool_result') {
            const rc = p['content'];
            if (typeof rc === 'string') return `[Result] ${rc}`;
            if (Array.isArray(rc)) {
              return rc.map((c: Record<string, unknown>) =>
                c['type'] === 'text' ? String(c['text'] || '') : ''
              ).join('\n');
            }
            return '[Result]';
          }
          if (p['type'] === 'thinking' && typeof p['thinking'] === 'string') {
            return `[Thinking] ${p['thinking']}`;
          }
          if (typeof p['content'] === 'string') return p['content'];
          if (p['type'] === 'image_url') return '[图片]';
          if (p['type'] === 'image') return '[图片]';
          return stringifyUnknown(p);
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  if (isRecord(content)) {
    if (typeof content['text'] === 'string') return content['text'];
    if (typeof content['content'] === 'string') return content['content'];
    return stringifyUnknown(content);
  }
  return '';
}

// 将 content 数组解析为结构化的 ContentPart 列表
function contentToParts(content: unknown): ContentPart[] | undefined {
  const parts: ContentPart[] = [];
  const items = Array.isArray(content) ? content : [content];

  for (const part of items) {
    if (typeof part === 'string') {
      if (part.trim()) parts.push({ type: 'text', text: part });
      continue;
    }
    if (!isRecord(part)) continue;
    const p = part;

    if (p['type'] === 'text' && typeof p['text'] === 'string') {
      if (p['text'].trim()) parts.push({ type: 'text', text: p['text'] });
    } else if (p['type'] === 'tool_use' || p['type'] === 'toolCall') {
      parts.push({
        type: 'tool_use',
        toolId: String(p['id'] || ''),
        toolName: String(p['name'] || ''),
        toolInput: isRecord(p['input'])
          ? p['input']
          : isRecord(p['arguments'])
            ? p['arguments']
            : {},
      });
    } else if (p['type'] === 'tool_result') {
      let resultContent = '';
      const rc = p['content'];
      if (typeof rc === 'string') {
        resultContent = rc;
      } else if (Array.isArray(rc)) {
        resultContent = rc.map((c: Record<string, unknown>) => {
          if (c['type'] === 'text') return String(c['text'] || '');
          return '';
        }).join('\n').trim();
      }
      parts.push({
        type: 'tool_result',
        toolUseId: String(p['tool_use_id'] || ''),
        resultContent,
        isError: p['is_error'] === true,
      });
    } else if (p['type'] === 'thinking') {
      parts.push({
        type: 'thinking',
        text: String(p['thinking'] || ''),
      });
    } else if (p['type'] === 'image_url' || p['type'] === 'image') {
      parts.push({ type: 'image' });
    } else if (typeof p['content'] === 'string') {
      parts.push({ type: 'text', text: p['content'] });
    } else {
      parts.push({ type: 'json', jsonValue: p });
    }
  }
  return parts.length > 0 ? parts : undefined;
}

function toolCallsToParts(toolCalls: unknown): ContentPart[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .filter(isRecord)
    .map(call => ({
      type: 'tool_use' as const,
      toolId: String(call['id'] || ''),
      toolName: isRecord(call['function'])
        ? String(call['function']['name'] || '')
        : String(call['name'] || ''),
      toolInput: parseToolInput(isRecord(call['function']) ? call['function']['arguments'] : call['arguments']),
    }));
}

function parseToolInput(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : { value: parsed };
    } catch {
      return { value };
    }
  }
  return {};
}

function messageFromRecord(msg: Record<string, unknown>, fallbackTs: string): ConversationMessage | null {
  const role = normalizeRole(msg['role']);
  const content = msg['content'];
  const parts = [
    ...(typeof msg['reasoning_content'] === 'string' && msg['reasoning_content'].trim()
      ? [{ type: 'thinking' as const, text: msg['reasoning_content'] }]
      : []),
    ...(contentToParts(content) ?? []),
    ...toolCallsToParts(msg['tool_calls']),
  ];
  const contentText = [
    typeof msg['reasoning_content'] === 'string' ? `[Thinking] ${msg['reasoning_content']}` : '',
    contentToString(content),
    ...toolCallsToParts(msg['tool_calls']).map(part => `[Tool: ${part.toolName}] ${stringifyUnknown(part.toolInput)}`),
  ].filter(Boolean).join('\n').trim();

  if (!contentText && parts.length === 0) return null;

  return {
    ts: typeof msg['ts'] === 'string' ? msg['ts'] : fallbackTs,
    role,
    content: contentText,
    parts: parts.length > 0 ? parts : undefined,
    meta: typeof msg['tool_call_id'] === 'string' ? msg['tool_call_id'] : undefined,
  };
}

function getPayload(obj: Record<string, unknown>): Record<string, unknown> {
  return isRecord(obj['payload']) ? obj['payload'] : obj;
}

function buildProviderMeta(payload: Record<string, unknown>): string | undefined {
  const items = [
    typeof payload['provider'] === 'string' ? payload['provider'] : '',
    typeof payload['model'] === 'string' ? payload['model'] : '',
    typeof payload['stopReason'] === 'string' ? `stop: ${payload['stopReason']}` : '',
  ].filter(Boolean);
  return items.length > 0 ? items.join(' · ') : undefined;
}

// 检测是否是 OpenAI messages 格式（单行含 messages 数组）
// 同时支持顶层 system 字段 + messages 的格式
function extractMessages(obj: Record<string, unknown>): ConversationMessage[] | null {
  const payload = getPayload(obj);
  const timestamp = typeof obj['timestamp'] === 'string'
    ? obj['timestamp']
    : typeof payload['timestamp'] === 'string'
      ? payload['timestamp']
      : '';
  const msgs = payload['messages'];

  if (!Array.isArray(msgs) || msgs.length === 0) {
    const single = extractSingleProviderMessage(obj, payload, timestamp);
    return single ? [single] : null;
  }

  // 每条消息必须有 role 字符串，content 可以是字符串或数组
  const valid = (msgs as unknown[]).every(
    m => isRecord(m) && typeof m['role'] === 'string'
  );
  if (!valid) return null;

  const result: ConversationMessage[] = [];

  // 如果有顶层 system 字段，插入到最前面
  const systemField = payload['system'];
  if (typeof systemField === 'string' && systemField.trim()) {
    result.push({ ts: timestamp, role: 'system', content: systemField });
  } else if (Array.isArray(systemField)) {
    const sysText = systemField
      .filter(isRecord)
      .filter(p => p['type'] === 'text' && typeof p['text'] === 'string')
      .map(p => p['text'])
      .join('\n')
      .trim();
    if (sysText) {
      result.push({ ts: timestamp, role: 'system', content: sysText, parts: contentToParts(systemField) });
    }
  }

  for (const m of msgs) {
    if (!isRecord(m)) continue;
    const message = messageFromRecord(m, timestamp);
    if (message) {
      result.push(message);
    }
  }

  return result.length > 0 ? result : null;
}

function extractSingleProviderMessage(
  obj: Record<string, unknown>,
  payload: Record<string, unknown>,
  timestamp: string
): ConversationMessage | null {
  if (typeof payload['role'] !== 'string' && payload['content'] === undefined) return null;
  const message = messageFromRecord(payload, timestamp);
  if (!message) return null;

  const type = typeof obj['type'] === 'string' ? obj['type'] : '';
  const meta = buildProviderMeta(payload);
  return {
    ...message,
    role: normalizeRole(payload['role'] ?? 'assistant'),
    meta: [type === 'assistant_message' ? '模型返回' : '', meta].filter(Boolean).join(' · ') || message.meta,
  };
}

interface ProviderEventSummary {
  type: string;
  timestamp: string;
  model?: string;
  provider?: string;
  api?: string;
  stopReason?: string;
  usageText?: string;
}

function getEventSummary(obj: Record<string, unknown>): ProviderEventSummary | null {
  const payload = getPayload(obj);
  if (!isRecord(obj['payload'])) return null;
  const usage = isRecord(payload['usage']) ? payload['usage'] : null;
  const cost = usage && isRecord(usage['cost']) ? usage['cost'] : null;
  const tokens = [
    typeof usage?.['input'] === 'number' ? `输入 ${usage['input']}` : '',
    typeof usage?.['output'] === 'number' ? `输出 ${usage['output']}` : '',
    typeof usage?.['reasoning'] === 'number' ? `推理 ${usage['reasoning']}` : '',
    usage?.['totalTokens'] !== undefined ? `合计 ${String(usage['totalTokens'])}` : '',
  ].filter(Boolean);
  const costText = typeof cost?.['total'] === 'number' ? `成本 $${cost['total'].toFixed(6)}` : '';

  return {
    type: typeof obj['type'] === 'string' ? obj['type'] : 'event',
    timestamp: typeof obj['timestamp'] === 'string' ? obj['timestamp'] : '',
    model: typeof payload['model'] === 'string' ? payload['model'] : undefined,
    provider: typeof payload['provider'] === 'string' ? payload['provider'] : undefined,
    api: typeof payload['api'] === 'string' ? payload['api'] : undefined,
    stopReason: typeof payload['stopReason'] === 'string' ? payload['stopReason'] : undefined,
    usageText: [...tokens, costText].filter(Boolean).join(' · ') || undefined,
  };
}

// 检测 JSON 对象是否有可渲染的内容
function hasRenderableContent(obj: Record<string, unknown>): boolean {
  if (extractMessages(obj)) return true;
  // 检查 content 或 system 字段是否含 Markdown
  const payload = getPayload(obj);
  for (const key of ['content', 'system', 'text']) {
    const val = payload[key];
    if (typeof val === 'string' && /[*#`[\]\n]/.test(val)) return true;
    if (Array.isArray(val) && val.length > 0) return true;
  }
  return false;
}

// 右侧详情渲染：tab 由外部控制
const DetailPanel: React.FC<{
  obj: Record<string, unknown>;
  tab: 'render' | 'json';
}> = ({ obj, tab }) => {
  const messages = useMemo(() => extractMessages(obj), [obj]);
  const eventSummary = useMemo(() => getEventSummary(obj), [obj]);

  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, []);

  // 找第一个有文本内容的字段作为 Markdown 渲染
  const contentStr = (() => {
    const payload = getPayload(obj);
    for (const key of ['content', 'system', 'text']) {
      const val = payload[key];
      if (typeof val === 'string' && val.trim()) return val;
    }
    return null;
  })();

  return (
    <div className="jsonl-detail-panel">
      {/* JSON 视图 */}
      {tab === 'json' && (
        <pre
          className="jsonl-pre jsonl-pre--highlighted"
          dangerouslySetInnerHTML={{
            __html: highlightJson(JSON.stringify(obj, null, 2))
          }}
        />
      )}

      {/* 渲染视图 */}
      {tab === 'render' && (
        <>
          {eventSummary && <EventSummaryCard summary={eventSummary} />}
          {messages ? (
            <div className="jsonl-detail-messages">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={idx}
                  msg={msg}
                  index={idx}
                  onCopy={handleCopy}
                />
              ))}
            </div>
          ) : contentStr ? (
            <div className="jsonl-detail-markdown-body">
              <MarkdownContent content={contentStr} />
            </div>
          ) : null}
          <MessageToast show={showCopied} message="已复制到剪贴板" />
        </>
      )}
    </div>
  );
};

const EventSummaryCard: React.FC<{ summary: ProviderEventSummary }> = ({ summary }) => {
  const items = [
    summary.provider ? `Provider: ${summary.provider}` : '',
    summary.model ? `Model: ${summary.model}` : '',
    summary.api ? `API: ${summary.api}` : '',
    summary.stopReason ? `Stop: ${summary.stopReason}` : '',
  ].filter(Boolean);

  return (
    <div className="jsonl-event-summary">
      <div className="jsonl-event-summary-main">
        <span className={`jsonl-event-type jsonl-event-type--${summary.type.replace(/_/g, '-')}`}>
          {summary.type}
        </span>
        {summary.timestamp && <span className="jsonl-event-time">{formatTime(summary.timestamp)}</span>}
      </div>
      {items.length > 0 && (
        <div className="jsonl-event-meta">
          {items.map(item => <span key={item}>{item}</span>)}
        </div>
      )}
      {summary.usageText && <div className="jsonl-event-usage">{summary.usageText}</div>}
    </div>
  );
};

function getLinePreview(line: ParsedLine): string {
  if (!line.parsed) {
    return line.raw.length > 80 ? line.raw.slice(0, 80) + '...' : line.raw;
  }
  const obj = line.parsed;
  const payload = getPayload(obj);
  const type = typeof obj['type'] === 'string' ? obj['type'] : 'json';
  if (Array.isArray(payload['messages'])) {
    const messageCount = payload['messages'].length;
    const lastMessage = [...payload['messages']].reverse().find(isRecord);
    const lastText = lastMessage ? contentToString(lastMessage['content']) : '';
    return `${type} · ${messageCount} 条消息${lastText ? ` · ${lastText}` : ''}`;
  }
  if (payload['content'] !== undefined) {
    const text = contentToString(payload['content']);
    return `${type}${text ? ` · ${text}` : ''}`;
  }
  return line.raw.length > 80 ? line.raw.slice(0, 80) + '...' : line.raw;
}

// 通用 JSONL 视图（原始左右布局）
const GenericView: React.FC<{
  lines: ParsedLine[];
  fileName: string;
  onReset: () => void;
}> = ({ lines, fileName, onReset }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [tab, setTab] = useState<'render' | 'json'>('json');

  // 当 lines 被替换或缩短时，selectedIndex 可能越界（lines[selectedIndex] 为 undefined），
  // 后续读取 selectedLine.error 会崩溃。这里同步校正。
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= lines.length) {
      setSelectedIndex(null);
    }
  }, [lines, selectedIndex]);

  const selectedLine = (selectedIndex !== null && lines[selectedIndex] !== undefined)
    ? lines[selectedIndex]
    : null;
  const selectedObj = selectedLine?.parsed ?? null;

  // 选中行切换时，自动切换到合适的 tab
  const prevIndex = useRef<number | null>(null);
  if (prevIndex.current !== selectedIndex) {
    prevIndex.current = selectedIndex;
    if (selectedObj && hasRenderableContent(selectedObj)) {
      setTab('render');
    } else {
      setTab('json');
    }
  }

  const canRender = selectedObj !== null && hasRenderableContent(selectedObj);

  const handleCopy = () => {
    if (selectedIndex === null) return;
    const line = lines[selectedIndex];
    const text = line.parsed !== null ? JSON.stringify(line.parsed, null, 2) : line.raw;
    navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const validCount = lines.filter(l => l.error === null).length;

  return (
    <div className="tool-container">
      <div className="tool-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tool-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 className="tool-title" style={{ marginBottom: 0 }}>JSONL 查看器</h2>
          <span className="jsonl-file-info">
            <Icon name="file" size={14} />
            {fileName}
          </span>
          <span className="jsonl-stats">
            共 {lines.length} 行 · 有效 {validCount} 行
            {validCount < lines.length && ` · 无效 ${lines.length - validCount} 行`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onReset}>
            重新上传
          </button>
        </div>

        <div className="jsonl-layout">
          <div className="jsonl-list">
            {lines.map((line, idx) => (
              (() => {
                const preview = getLinePreview(line);
                return (
                  <div
                    key={idx}
                    className={`jsonl-list-item${selectedIndex === idx ? ' selected' : ''}${line.error ? ' error' : ''}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <span className="jsonl-line-number">{idx + 1}</span>
                    <span className="jsonl-line-preview">
                      {preview.length > 120 ? preview.slice(0, 120) + '...' : preview}
                    </span>
                  </div>
                );
              })()
            ))}
          </div>

          <div className="jsonl-detail">
            {selectedLine === null ? (
              <div className="jsonl-placeholder">
                <Icon name="chevron-left" size={24} />
                <span>点击左侧行查看详情</span>
              </div>
            ) : (
              <>
                <div className="jsonl-detail-toolbar">
                  <span className="jsonl-detail-label">
                    第 {selectedIndex! + 1} 行
                    {selectedLine.error ? (
                      <span className="jsonl-error-badge">解析失败</span>
                    ) : (
                      <span className="jsonl-valid-badge">有效 JSON</span>
                    )}
                    {!selectedLine.error && tab === 'render' && (() => {
                      const msgs = selectedObj ? extractMessages(selectedObj) : null;
                      return msgs ? <span className="jsonl-msg-count">共 {msgs.length} 条消息</span> : null;
                    })()}
                  </span>
                  {/* 切换按钮：与 toolbar 同行 */}
                  {canRender && !selectedLine.error && (
                    <div className="jsonl-detail-tab-group">
                      <button
                        className={`jsonl-detail-tab-btn${tab === 'render' ? ' active' : ''}`}
                        onClick={() => setTab('render')}
                      >
                        渲染视图
                      </button>
                      <button
                        className={`jsonl-detail-tab-btn${tab === 'json' ? ' active' : ''}`}
                        onClick={() => setTab('json')}
                      >
                        原始 JSON
                      </button>
                    </div>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                    <Icon name="copy" size={14} />
                    复制
                  </button>
                </div>
                {selectedLine.error ? (
                  <div className="jsonl-error-detail">
                    <p className="jsonl-error-message">
                      <Icon name="error" size={16} /> 解析错误：{selectedLine.error}
                    </p>
                    <pre className="jsonl-pre">{selectedLine.raw}</pre>
                  </div>
                ) : (
                  <DetailPanel obj={selectedLine.parsed!} tab={tab} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <MessageToast show={showCopied} message="已复制到剪贴板" />
    </div>
  );
};

// 主组件
const JsonlViewer = () => {
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawLines = text.split('\n').filter(l => l.trim() !== '');
      const parsed: ParsedLine[] = rawLines.map(raw => {
        try {
          return { raw, parsed: JSON.parse(raw) as Record<string, unknown>, error: null };
        } catch (err) {
          return { raw, parsed: null, error: (err as Error).message };
        }
      });
      setLines(parsed);
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleReset = () => {
    setLines([]);
    setFileName('');
  };

  if (lines.length === 0) {
    return (
      <div className="tool-container">
        <div className="tool-content">
          <div className="tool-header">
            <h2 className="tool-title">JSONL 查看器</h2>
          </div>
          <div
            className={`jsonl-upload-area${isDragging ? ' dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={40} className="upload-icon" />
            <p className="upload-title">拖放 JSONL 文件到这里</p>
            <p className="upload-subtitle">或点击选择文件（.jsonl, .txt）</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.txt"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    );
  }

  if (isConversationFormat(lines)) {
    return <ConversationView lines={lines} fileName={fileName} onReset={handleReset} />;
  }

  return <GenericView lines={lines} fileName={fileName} onReset={handleReset} />;
};

export default JsonlViewer;

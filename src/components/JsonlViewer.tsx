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
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image';
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
}

interface ConversationMessage {
  ts: string;
  role: 'system' | 'user' | 'assistant';
  content: string; // 向后兼容纯文本
  parts?: ContentPart[]; // 结构化内容
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
};

const ROLE_COLOR: Record<string, string> = {
  system: 'role-system',
  user: 'role-user',
  assistant: 'role-assistant',
};

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
          <span className="chat-tool-use-name">{part.toolName}</span>
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

  return (
    <div className={`chat-message chat-message--${msg.role}`}>
      <div className="chat-message-header">
        <span className={`chat-role-badge ${ROLE_COLOR[msg.role]}`}>
          {ROLE_LABEL[msg.role] ?? msg.role}
        </span>
        {msg.ts && (
          <span className="chat-timestamp">{formatTime(msg.ts)}</span>
        )}
        <div className="chat-message-actions">
          <button
            className="chat-action-btn"
            onClick={() => onCopy(msg.content)}
            title="复制内容"
          >
            <Icon name="copy" size={14} />
          </button>
        </div>
      </div>

      <div className={`chat-message-body${isSystem ? ' chat-message-body--system' : ''}`}>
        {hasParts ? (
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
          if (p['type'] === 'tool_use') {
            const name = p['name'] || '';
            const input = p['input'];
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
          if (p['type'] === 'image_url') return '[图片]';
          if (p['type'] === 'image') return '[图片]';
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

// 将 content 数组解析为结构化的 ContentPart 列表
function contentToParts(content: unknown): ContentPart[] | undefined {
  if (!Array.isArray(content)) return undefined;
  if (content.length === 0) return undefined;

  const parts: ContentPart[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      if (part.trim()) parts.push({ type: 'text', text: part });
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;

    if (p['type'] === 'text' && typeof p['text'] === 'string') {
      if (p['text'].trim()) parts.push({ type: 'text', text: p['text'] });
    } else if (p['type'] === 'tool_use') {
      parts.push({
        type: 'tool_use',
        toolId: String(p['id'] || ''),
        toolName: String(p['name'] || ''),
        toolInput: (p['input'] as Record<string, unknown>) || {},
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
    }
  }
  return parts.length > 0 ? parts : undefined;
}

// 检测是否是 OpenAI messages 格式（单行含 messages 数组）
// 同时支持顶层 system 字段 + messages 的格式
function extractMessages(obj: Record<string, unknown>): ConversationMessage[] | null {
  const msgs = obj['messages'];
  if (!Array.isArray(msgs) || msgs.length === 0) return null;

  // 每条消息必须有 role 字符串，content 可以是字符串或数组
  const valid = (msgs as unknown[]).every(
    m => m && typeof m === 'object' &&
      typeof (m as Record<string, unknown>)['role'] === 'string' &&
      (
        typeof (m as Record<string, unknown>)['content'] === 'string' ||
        Array.isArray((m as Record<string, unknown>)['content'])
      )
  );
  if (!valid) return null;

  const result: ConversationMessage[] = [];

  // 如果有顶层 system 字段，插入到最前面
  const systemField = obj['system'];
  if (typeof systemField === 'string' && systemField.trim()) {
    result.push({ ts: (obj['ts'] as string) || '', role: 'system', content: systemField });
  } else if (Array.isArray(systemField)) {
    const sysText = systemField
      .filter((p: Record<string, unknown>) => p['type'] === 'text' && typeof p['text'] === 'string')
      .map((p: Record<string, unknown>) => p['text'])
      .join('\n')
      .trim();
    if (sysText) {
      result.push({ ts: (obj['ts'] as string) || '', role: 'system', content: sysText, parts: contentToParts(systemField) });
    }
  }

  for (const m of msgs as Record<string, unknown>[]) {
    const content = m['content'];
    result.push({
      ts: (obj['ts'] as string) || '',
      role: (m['role'] as ConversationMessage['role']) || 'user',
      content: contentToString(content),
      parts: contentToParts(content),
    });
  }

  return result.length > 0 ? result : null;
}

// 检测 JSON 对象是否有可渲染的内容
function hasRenderableContent(obj: Record<string, unknown>): boolean {
  if (extractMessages(obj)) return true;
  // 检查 content 或 system 字段是否含 Markdown
  for (const key of ['content', 'system', 'text']) {
    const val = obj[key];
    if (typeof val === 'string' && /[*#`[\]\n]/.test(val)) return true;
  }
  return false;
}

// 右侧详情渲染：tab 由外部控制
const DetailPanel: React.FC<{
  obj: Record<string, unknown>;
  tab: 'render' | 'json';
}> = ({ obj, tab }) => {
  const messages = useMemo(() => extractMessages(obj), [obj]);

  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, []);

  // 找第一个有文本内容的字段作为 Markdown 渲染
  const contentStr = (() => {
    for (const key of ['content', 'system', 'text']) {
      const val = obj[key];
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
              <div
                key={idx}
                className={`jsonl-list-item${selectedIndex === idx ? ' selected' : ''}${line.error ? ' error' : ''}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <span className="jsonl-line-number">{idx + 1}</span>
                <span className="jsonl-line-preview">
                  {line.raw.length > 80 ? line.raw.slice(0, 80) + '...' : line.raw}
                </span>
              </div>
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

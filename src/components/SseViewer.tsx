import React, { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from './Icon';
import MessageToast from './MessageToast';

// ====== SSE 解析逻辑 ======

interface SseEvent {
  event: string;
  data: string;
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  index: number;
  // text 类型
  text?: string;
  // tool_use 类型
  toolId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  // thinking 类型
  thinking?: string;
}

interface ParsedSseResult {
  model: string;
  messageId: string;
  stopReason: string;
  contentBlocks: ContentBlock[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  eventCount: number;
}

function parseSseLines(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  let currentEvent = '';
  let currentData = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
      events.push({ event: currentEvent, data: currentData });
      currentEvent = '';
      currentData = '';
    } else if (line.trim() === '') {
      currentEvent = '';
      currentData = '';
    }
  }
  return events;
}

function parseSseToResult(raw: string): ParsedSseResult | null {
  const events = parseSseLines(raw);
  if (events.length === 0) return null;

  let model = '';
  let messageId = '';
  let stopReason = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;

  // tool_use 的 partial_json 拼接
  const toolPartialJsons: Map<number, string> = new Map();
  // tool_use 的起始信息
  const toolStarts: Map<number, { id: string; name: string }> = new Map();
  // text 的 delta 拼接
  const textDeltas: Map<number, string> = new Map();
  // thinking 的 delta 拼接
  const thinkingDeltas: Map<number, string> = new Map();

  for (const ev of events) {
    if (ev.data === '[DONE]') continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(ev.data);
    } catch {
      continue;
    }

    const type = obj['type'] as string;

    if (type === 'message_start') {
      const msg = obj['message'] as Record<string, unknown> | undefined;
      if (msg) {
        model = String(msg['model'] || '');
        messageId = String(msg['id'] || '');
        const usage = msg['usage'] as Record<string, unknown> | undefined;
        if (usage) {
          inputTokens = Number(usage['input_tokens'] || 0);
          cacheReadInputTokens = Number(usage['cache_read_input_tokens'] || 0);
          cacheCreationInputTokens = Number(usage['cache_creation_input_tokens'] || 0);
        }
      }
    }

    if (type === 'content_block_start') {
      const idx = Number(obj['index']);
      const block = obj['content_block'] as Record<string, unknown> | undefined;
      if (block) {
        const blockType = block['type'] as string;
        if (blockType === 'tool_use') {
          toolStarts.set(idx, {
            id: String(block['id'] || ''),
            name: String(block['name'] || ''),
          });
          toolPartialJsons.set(idx, '');
        } else if (blockType === 'text') {
          textDeltas.set(idx, '');
        } else if (blockType === 'thinking') {
          thinkingDeltas.set(idx, '');
        }
      }
    }

    if (type === 'content_block_delta') {
      const idx = Number(obj['index']);
      const delta = obj['delta'] as Record<string, unknown> | undefined;
      if (delta) {
        const deltaType = delta['type'] as string;
        if (deltaType === 'input_json_delta') {
          const partial = String(delta['partial_json'] || '');
          const prev = toolPartialJsons.get(idx) || '';
          toolPartialJsons.set(idx, prev + partial);
        } else if (deltaType === 'text_delta') {
          const text = String(delta['text'] || '');
          const prev = textDeltas.get(idx) || '';
          textDeltas.set(idx, prev + text);
        } else if (deltaType === 'thinking_delta') {
          const text = String(delta['thinking'] || '');
          const prev = thinkingDeltas.get(idx) || '';
          thinkingDeltas.set(idx, prev + text);
        }
      }
    }

    if (type === 'message_delta') {
      const delta = obj['delta'] as Record<string, unknown> | undefined;
      if (delta) {
        stopReason = String(delta['stop_reason'] || '');
      }
      const usage = obj['usage'] as Record<string, unknown> | undefined;
      if (usage) {
        outputTokens = Number(usage['output_tokens'] || 0);
      }
    }
  }

  // 组装 content blocks
  const contentBlocks: ContentBlock[] = [];
  const allIndices = new Set<number>();
  toolStarts.forEach((_, k) => allIndices.add(k));
  toolPartialJsons.forEach((_, k) => allIndices.add(k));
  textDeltas.forEach((_, k) => allIndices.add(k));
  thinkingDeltas.forEach((_, k) => allIndices.add(k));

  for (const idx of Array.from(allIndices).sort((a, b) => a - b)) {
    if (toolStarts.has(idx)) {
      const start = toolStarts.get(idx)!;
      const rawJson = toolPartialJsons.get(idx) || '';
      let toolInput: Record<string, unknown> = {};
      try {
        if (rawJson.trim()) {
          toolInput = JSON.parse(rawJson) as Record<string, unknown>;
        }
      } catch {
        // partial_json 可能不完整，尝试修复
        try {
          toolInput = JSON.parse(rawJson + '"}') as Record<string, unknown>;
        } catch {
          toolInput = { _raw: rawJson };
        }
      }
      contentBlocks.push({
        type: 'tool_use',
        index: idx,
        toolId: start.id,
        toolName: start.name,
        toolInput,
      });
    } else if (thinkingDeltas.has(idx)) {
      contentBlocks.push({
        type: 'thinking',
        index: idx,
        thinking: thinkingDeltas.get(idx) || '',
      });
    } else if (textDeltas.has(idx)) {
      contentBlocks.push({
        type: 'text',
        index: idx,
        text: textDeltas.get(idx) || '',
      });
    }
  }

  if (contentBlocks.length === 0 && !model) return null;

  return {
    model,
    messageId,
    stopReason,
    contentBlocks,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
    },
    eventCount: events.length,
  };
}

// ====== 渲染组件 ======

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

const ToolUseCard: React.FC<{
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
  onCopy: (text: string) => void;
}> = ({ toolName, toolId, input }) => {
  const [expanded, setExpanded] = useState(true);

  // 特殊处理文件读取类的 tool
  const isFileReadTool = ['Read', 'Write', 'Edit', 'MultiEdit'].includes(toolName);

  return (
    <div className="sse-tool-card">
      <div className="sse-tool-header" onClick={() => setExpanded(e => !e)}>
        <>
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
          <span className="sse-tool-badge">Tool</span>
          <span className="sse-tool-name">{toolName}</span>
          {isFileReadTool && input['file_path'] && (
            <span className="sse-tool-path">{String(input['file_path'])}</span>
          )}
        </>
      </div>
      {expanded && (
        <div className="sse-tool-body">
          <pre className="sse-code-pre">
            <code>{JSON.stringify(input, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

const ThinkingCard: React.FC<{ thinking: string }> = ({ thinking }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="sse-thinking-card">
      <div className="sse-thinking-header" onClick={() => setExpanded(e => !e)}>
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className="sse-thinking-badge">Thinking</span>
        <span className="sse-thinking-preview">
          {thinking.slice(0, 60)}{thinking.length > 60 ? '...' : ''}
        </span>
      </div>
      {expanded && (
        <div className="sse-thinking-body">
          {thinking}
        </div>
      )}
    </div>
  );
};

const SseViewer = () => {
  const [rawText, setRawText] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  const result = useMemo(() => parseSseToResult(rawText), [rawText]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, []);

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawText(ev.target?.result as string || '');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const fullText = result
    ? result.contentBlocks
        .filter(b => b.type === 'text' && b.text)
        .map(b => b.text)
        .join('\n')
    : '';

  return (
    <div className="tool-container">
      <div className="tool-content impl-layout">
        {/* 左侧：原始 SSE 数据 */}
        <div className="impl-left">
          <div className="impl-panel-header">
            <span className="impl-panel-title">SSE 原始数据</span>
            <div className="impl-panel-actions">
              <label className="btn btn-secondary btn-sm">
                <Icon name="upload" size={14} />
                导入文件
                <input
                  type="file"
                  accept=".log,.txt,.json"
                  style={{ display: 'none' }}
                  onChange={handleFileLoad}
                />
              </label>
              {rawText && (
                <button className="btn btn-secondary btn-sm" onClick={() => setRawText('')}>
                  清空
                </button>
              )}
            </div>
          </div>
          <textarea
            className="impl-raw-input"
            placeholder="粘贴 SSE 流式响应数据（含 event: / data: 行）..."
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* 右侧：解析结果 */}
        <div className="impl-right">
          <div className="impl-panel-header">
            <span className="impl-panel-title">解析结果</span>
            {result && (
              <div className="impl-panel-actions">
                <span className="impl-stats">
                  {result.contentBlocks.length} 个内容块 · {result.eventCount} 个事件
                </span>
                {fullText && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(fullText)}
                  >
                    <Icon name="copy" size={14} />
                    复制全文
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="impl-render-area">
            {!rawText ? (
              <div className="impl-placeholder">
                <Icon name="chevron-left" size={24} />
                <span>在左侧粘贴 SSE 数据后查看解析结果</span>
              </div>
            ) : !result ? (
              <div className="impl-placeholder impl-placeholder--error">
                <Icon name="error" size={20} />
                <span>未能解析出有效的 SSE 数据</span>
              </div>
            ) : (
              <div className="impl-render-content">
                {/* 元信息 */}
                <div className="impl-meta">
                  {result.model && (
                    <div className="impl-meta-row">
                      <span className="impl-meta-label">模型</span>
                      <code className="impl-meta-value">{result.model}</code>
                    </div>
                  )}
                  {result.stopReason && (
                    <div className="impl-meta-row">
                      <span className="impl-meta-label">停止</span>
                      <code className="impl-meta-value">{result.stopReason}</code>
                    </div>
                  )}
                  <div className="impl-meta-row">
                    <span className="impl-meta-label">Token</span>
                    <code className="impl-meta-value">
                      输入 {result.usage.inputTokens} · 输出 {result.usage.outputTokens}
                      {result.usage.cacheReadInputTokens > 0 && ` · 缓存读 ${result.usage.cacheReadInputTokens}`}
                      {result.usage.cacheCreationInputTokens > 0 && ` · 缓存写 ${result.usage.cacheCreationInputTokens}`}
                    </code>
                  </div>
                </div>

                {/* 内容块 */}
                <div className="sse-block-list">
                  {result.contentBlocks.map((block, idx) => {
                    if (block.type === 'text' && block.text) {
                      return (
                        <div key={idx} className="sse-text-block">
                          <div className="chat-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                pre({ children }) {
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
                              }}
                            >
                              {block.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                      );
                    }

                    if (block.type === 'tool_use') {
                      return (
                        <ToolUseCard
                          key={idx}
                          toolName={block.toolName || ''}
                          toolId={block.toolId || ''}
                          input={block.toolInput || {}}
                          onCopy={handleCopy}
                        />
                      );
                    }

                    if (block.type === 'thinking') {
                      return (
                        <ThinkingCard
                          key={idx}
                          thinking={block.thinking || ''}
                        />
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <MessageToast show={showCopied} message="已复制到剪贴板" />
    </div>
  );
};

export default SseViewer;

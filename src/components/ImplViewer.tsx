import React, { useState, useCallback, useMemo } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';

interface ImplFile {
  path: string;
  action: string;
  description: string;
  content: string;
}

interface ImplData {
  branchName: string;
  commitMessage: string;
  files: ImplFile[];
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    java: 'java',
    py: 'python',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    vue: 'vue',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
  };
  return map[ext] || ext || 'text';
}

const ACTION_LABEL: Record<string, string> = {
  create: '新建',
  modify: '修改',
  delete: '删除',
};

const ACTION_COLOR: Record<string, string> = {
  create: 'action-create',
  modify: 'action-modify',
  delete: 'action-delete',
};

// 从 ImplData 对象构造结果
function toImplData(obj: Record<string, unknown>): ImplData | null {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj['files'])) return null;
  return {
    branchName: String(obj['branchName'] || ''),
    commitMessage: String(obj['commitMessage'] || ''),
    files: (obj['files'] as Record<string, unknown>[]).map(f => ({
      path: String(f['path'] || ''),
      action: String(f['action'] || 'modify'),
      description: String(f['description'] || ''),
      content: String(f['content'] || ''),
    })),
  };
}

// 尝试从字符串中解析出 ImplData，支持多种输入格式
function extractImplJson(text: string): ImplData | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. 尝试将整个文本作为 JSON 解析（直接粘贴 {"branchName":...,"files":[...]}）
  try {
    const obj = JSON.parse(trimmed);
    // 如果是外层 JSONL 格式（有 content 字段含 <IMPL_JSON>）
    if (obj && typeof obj === 'object' && typeof obj['content'] === 'string') {
      const implData = extractFromContent(obj['content']);
      if (implData) return implData;
    }
    // 直接就是 ImplData 格式
    const result = toImplData(obj as Record<string, unknown>);
    if (result) return result;
  } catch {
    // 不是有效 JSON，继续尝试其他方式
  }

  // 2. 文本中直接包含 <IMPL_JSON> 标签
  const implData = extractFromContent(trimmed);
  if (implData) return implData;

  return null;
}

// 从 content 字符串中提取 <IMPL_JSON> 内容
function extractFromContent(content: string): ImplData | null {
  const match = content.match(/<IMPL_JSON>([\s\S]*?)<\/IMPL_JSON>/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim());
    return toImplData(obj as Record<string, unknown>);
  } catch {
    return null;
  }
}

const FileCard: React.FC<{
  file: ImplFile;
  defaultExpanded: boolean;
  onCopy: (text: string) => void;
}> = ({ file, defaultExpanded, onCopy }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const lang = detectLanguage(file.path);

  return (
    <div className="impl-file-card">
      <div
        className="impl-file-header"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className={`impl-action-badge ${ACTION_COLOR[file.action] || 'action-modify'}`}>
          {ACTION_LABEL[file.action] || file.action}
        </span>
        <span className="impl-file-path">{file.path}</span>
        {file.description && (
          <span className="impl-file-desc">— {file.description}</span>
        )}
      </div>
      {expanded && (
        <div className="impl-file-body">
          <div className="impl-code-toolbar">
            <span className="impl-code-lang">{lang}</span>
            <button className="chat-code-copy" onClick={() => onCopy(file.content)}>
              <Icon name="copy" size={12} />
              复制
            </button>
          </div>
          <pre className="impl-code-pre">
            <code>{file.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

const ImplViewer = () => {
  const [rawText, setRawText] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  const implData = useMemo(() => extractImplJson(rawText), [rawText]);

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

  return (
    <div className="tool-container">
      <div className="tool-content impl-layout">
        {/* 左侧：原始字符串 */}
        <div className="impl-left">
          <div className="impl-panel-header">
            <span className="impl-panel-title">原始内容</span>
            <div className="impl-panel-actions">
              <label className="btn btn-secondary btn-sm">
                <Icon name="upload" size={14} />
                导入文件
                <input
                  type="file"
                  accept=".json,.txt,.log,.md"
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
            placeholder="粘贴包含 <IMPL_JSON> 标签的文本，或直接粘贴 JSON..."
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* 右侧：解析渲染 */}
        <div className="impl-right">
          <div className="impl-panel-header">
            <span className="impl-panel-title">解析结果</span>
            {implData && (
              <span className="impl-stats">
                {implData.files.length} 个文件
              </span>
            )}
          </div>
          <div className="impl-render-area">
            {!rawText ? (
              <div className="impl-placeholder">
                <Icon name="chevron-left" size={24} />
                <span>在左侧输入内容后查看解析结果</span>
              </div>
            ) : !implData ? (
              <div className="impl-placeholder impl-placeholder--error">
                <Icon name="error" size={20} />
                <span>未能解析出有效的 IMPL_JSON 数据</span>
              </div>
            ) : (
              <div className="impl-render-content">
                {/* 元信息 */}
                <div className="impl-meta">
                  <div className="impl-meta-row">
                    <span className="impl-meta-label">分支</span>
                    <code className="impl-meta-value">{implData.branchName}</code>
                  </div>
                  <div className="impl-meta-row">
                    <span className="impl-meta-label">提交</span>
                    <code className="impl-meta-value">{implData.commitMessage}</code>
                  </div>
                </div>

                {/* 文件列表 */}
                <div className="impl-file-list">
                  {implData.files.map((file, idx) => (
                    <FileCard
                      key={idx}
                      file={file}
                      defaultExpanded={implData.files.length <= 3}
                      onCopy={handleCopy}
                    />
                  ))}
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

export default ImplViewer;

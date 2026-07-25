import { useCallback, useMemo, useState } from 'react';
import { Diff, Hunk, parseDiff } from 'react-diff-view';
import * as DiffLib from 'diff';
import 'react-diff-view/style/index.css';
import Icon from './Icon';
import MessageToast from './MessageToast';

type DiffMethod = 'lines' | 'words' | 'chars' | 'sentences' | 'json';

interface DiffMethodOption {
  value: DiffMethod;
  label: string;
  unitLabel: string;
}

interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

const DIFF_METHODS: DiffMethodOption[] = [
  { value: 'lines', label: '按行', unitLabel: '行' },
  { value: 'words', label: '按单词', unitLabel: '词' },
  { value: 'chars', label: '按字符', unitLabel: '字符' },
  { value: 'sentences', label: '按句子', unitLabel: '句' },
  { value: 'json', label: 'JSON 结构', unitLabel: '段' },
];

function buildUnifiedDiff(oldValue: string, newValue: string, onlyChanges: boolean): string {
  if (!oldValue && !newValue) return '';

  if (onlyChanges) {
    const patch = DiffLib.structuredPatch(
      'a/file',
      'b/file',
      oldValue,
      newValue,
      '',
      '',
      { context: 0 },
    );
    if (patch.hunks.length === 0) return '';

    return [
      '--- a/file',
      '+++ b/file',
      ...patch.hunks.flatMap(hunk => [
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
        ...hunk.lines,
      ]),
      '',
    ].join('\n');
  }

  const changes = DiffLib.diffLines(oldValue, newValue);
  let hunkContent = '';
  let oldLineCount = 0;
  let newLineCount = 0;

  changes.forEach((part) => {
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();

    lines.forEach((line) => {
      if (part.added) {
        hunkContent += `+${line}\n`;
        newLineCount++;
      } else if (part.removed) {
        hunkContent += `-${line}\n`;
        oldLineCount++;
      } else {
        hunkContent += ` ${line}\n`;
        oldLineCount++;
        newLineCount++;
      }
    });
  });

  if (!hunkContent) return '';
  return [
    '--- a/file',
    '+++ b/file',
    `@@ -1,${oldLineCount} +1,${newLineCount} @@`,
    hunkContent,
  ].join('\n');
}

function extractChangedTexts(oldValue: string, newValue: string) {
  return DiffLib.diffLines(oldValue, newValue).reduce((result, part) => {
    if (part.removed) result.oldValue += part.value;
    if (part.added) result.newValue += part.value;
    return result;
  }, { oldValue: '', newValue: '' });
}

function serializeInlineDiff(parts: DiffPart[]): string {
  return parts.map((part) => {
    if (part.added) return `{+${part.value}+}`;
    if (part.removed) return `[-${part.value}-]`;
    return part.value;
  }).join('');
}

const DiffViewer = () => {
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [method, setMethod] = useState<DiffMethod>('lines');
  const [formatJson, setFormatJson] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);

  const defaultOldText = `{
  "name": "react-tools",
  "version": "0.1.0",
  "private": true
}`;

  const defaultNewText = `{
  "name": "react-tools",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0"
  }
}`;

  const formatJsonText = useCallback((text: string): string => {
    if (!text.trim()) return text;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, []);

  const preparedTexts = useMemo(() => {
    if (method === 'json') {
      try {
        return {
          oldValue: JSON.stringify(JSON.parse(oldText), null, 2),
          newValue: JSON.stringify(JSON.parse(newText), null, 2),
          jsonError: '',
        };
      } catch {
        return {
          oldValue: oldText,
          newValue: newText,
          jsonError: oldText || newText ? 'JSON 解析失败，已回退为按行比较。' : '',
        };
      }
    }

    return {
      oldValue: formatJson ? formatJsonText(oldText) : oldText,
      newValue: formatJson ? formatJsonText(newText) : newText,
      jsonError: '',
    };
  }, [formatJson, formatJsonText, method, newText, oldText]);

  const unifiedDiff = useMemo(() => (
    buildUnifiedDiff(preparedTexts.oldValue, preparedTexts.newValue, onlyChanges)
  ), [onlyChanges, preparedTexts]);

  const files = useMemo(() => {
    if (method !== 'lines' || !unifiedDiff) return [];
    try {
      return parseDiff(unifiedDiff);
    } catch (error) {
      console.error('解析差异失败:', error);
      return [];
    }
  }, [method, unifiedDiff]);

  const inlineParts = useMemo<DiffPart[]>(() => {
    if (method === 'lines') return [];

    const { oldValue, newValue, jsonError } = preparedTexts;
    const comparedTexts = onlyChanges
      ? extractChangedTexts(oldValue, newValue)
      : { oldValue, newValue };

    if (method === 'json' && !jsonError && !onlyChanges) {
      return DiffLib.diffJson(JSON.parse(oldValue || 'null'), JSON.parse(newValue || 'null'));
    }
    if (method === 'words' || method === 'json') {
      return DiffLib.diffWordsWithSpace(comparedTexts.oldValue, comparedTexts.newValue);
    }
    if (method === 'chars') {
      return DiffLib.diffChars(comparedTexts.oldValue, comparedTexts.newValue);
    }
    if (method === 'sentences') {
      return DiffLib.diffSentences(comparedTexts.oldValue, comparedTexts.newValue);
    }
    return DiffLib.diffLines(comparedTexts.oldValue, comparedTexts.newValue);
  }, [method, onlyChanges, preparedTexts]);

  const currentMethod = DIFF_METHODS.find(option => option.value === method) ?? DIFF_METHODS[0];
  const summary = useMemo(() => inlineParts.reduce((result, part) => {
    if (part.added) result.added += part.count ?? 1;
    if (part.removed) result.removed += part.count ?? 1;
    return result;
  }, { added: 0, removed: 0 }), [inlineParts]);

  const handleClear = () => {
    setOldText('');
    setNewText('');
  };

  const copyToClipboard = async () => {
    const text = method === 'lines' ? unifiedDiff : serializeInlineDiff(inlineParts);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setShowCopyToast(false);
    window.setTimeout(() => setShowCopyToast(true), 0);
  };

  const hasInput = Boolean(oldText || newText);

  return (
    <div className="tool-container diff-viewer">
      <div className="tool-content">
        <div className="diff-method-toolbar">
          <h2>文本差异对比</h2>
          <div className="diff-method-selector" role="group" aria-label="Diff 方法">
            {DIFF_METHODS.map(option => (
              <button
                key={option.value}
                type="button"
                className={method === option.value ? 'active' : ''}
                aria-pressed={method === option.value}
                onClick={() => setMethod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="diff-toolbar-controls">
            {method === 'json' ? (
              <span className="diff-json-status">自动规范化 JSON</span>
            ) : (
              <label className="format-toggle">
                <input
                  type="checkbox"
                  checked={formatJson}
                  onChange={(event) => setFormatJson(event.target.checked)}
                />
                格式化 JSON
              </label>
            )}
            <div className="diff-actions" role="group" aria-label="Diff 操作">
              <button
                type="button"
                onClick={() => {
                  setOldText(defaultOldText);
                  setNewText(defaultNewText);
                }}
                title="加载示例"
                aria-label="加载示例"
              >
                <Icon name="file" size={15} />
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={!hasInput}
                title="清空"
                aria-label="清空"
              >
                <Icon name="trash" size={15} />
              </button>
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                disabled={!hasInput}
                title="复制差异"
                aria-label="复制差异"
              >
                <Icon name="copy" size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="diff-inputs">
          <div className="text-section">
            <h3>原始文本</h3>
            <textarea
              value={oldText}
              onChange={(event) => setOldText(event.target.value)}
              placeholder="请输入原始文本..."
              rows={10}
            />
          </div>
          <div className="text-section">
            <h3>新文本</h3>
            <textarea
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              placeholder="请输入新文本..."
              rows={10}
            />
          </div>
        </div>

        {hasInput && (
          <div className="diff-output">
            <div className="diff-result-header">
              <div className="diff-result-title">
                <h3>差异对比结果</h3>
                <button
                  type="button"
                  className={`diff-only-toggle ${onlyChanges ? 'active' : ''}`}
                  aria-pressed={onlyChanges}
                  onClick={() => setOnlyChanges(value => !value)}
                >
                  <Icon name="eye" size={14} />
                  仅看差异
                </button>
              </div>
              {method !== 'lines' && (
                <div className="diff-summary" aria-label="差异统计">
                  <span className="diff-summary-removed">-{summary.removed} {currentMethod.unitLabel}</span>
                  <span className="diff-summary-added">+{summary.added} {currentMethod.unitLabel}</span>
                </div>
              )}
            </div>

            {preparedTexts.jsonError && (
              <div className="diff-json-warning">
                <Icon name="warning" size={16} />
                {preparedTexts.jsonError}
              </div>
            )}

            {method === 'lines' ? (
              <>
                {files.map((file, fileIndex) => (
                  <Diff
                    key={`${file.oldPath}-${file.newPath}-${fileIndex}`}
                    viewType="split"
                    diffType={file.type}
                    hunks={file.hunks}
                  >
                    {(hunks) => hunks.map((hunk) => (
                      <Hunk key={hunk.content} hunk={hunk} />
                    ))}
                  </Diff>
                ))}
                {files.length === 0 && <p>两段文本没有可显示的差异。</p>}
              </>
            ) : (
              <div className="diff-inline-result">
                <div className="diff-inline-panes">
                  <section className="diff-inline-pane" aria-label="原始文本差异">
                    <div className="diff-inline-pane-header">
                      <strong>原始文本</strong>
                      <span className="diff-pane-removed">删除</span>
                    </div>
                    <pre className="diff-segment-view">
                      {inlineParts.map((part, index) => {
                        if (part.added) return null;
                        return (
                          <span
                            key={`${index}-${part.value.length}`}
                            className={part.removed
                              ? 'diff-segment-removed'
                              : 'diff-segment-unchanged'}
                          >
                            {part.value}
                          </span>
                        );
                      })}
                    </pre>
                  </section>
                  <section className="diff-inline-pane" aria-label="新文本差异">
                    <div className="diff-inline-pane-header">
                      <strong>新文本</strong>
                      <span className="diff-pane-added">新增</span>
                    </div>
                    <pre className="diff-segment-view">
                      {inlineParts.map((part, index) => {
                        if (part.removed) return null;
                        return (
                          <span
                            key={`${index}-${part.value.length}`}
                            className={part.added
                              ? 'diff-segment-added'
                              : 'diff-segment-unchanged'}
                          >
                            {part.value}
                          </span>
                        );
                      })}
                    </pre>
                  </section>
                </div>
              </div>
            )}
          </div>
        )}

        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default DiffViewer;

import React, { useState, useMemo, useCallback } from 'react';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import * as DiffLib from 'diff';
import 'react-diff-view/style/index.css';
import MessageToast from './MessageToast';

const DiffViewer = () => {
  const [oldText, setOldText] = useState<string>('');
  const [newText, setNewText] = useState<string>('');
  const [formatJson, setFormatJson] = useState<boolean>(true);
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);

  // 默认示例文本
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

  const handleClear = () => {
    setOldText('');
    setNewText('');
  };

  const copyToClipboard = () => {
    if (diffText) {
      navigator.clipboard.writeText(diffText);
      setShowCopyToast(true);
    }
  };

  // JSON 格式化函数
  const formatJsonText = useCallback((text: string): string => {
    if (!text.trim()) return text;

    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      // 如果不是有效的 JSON，返回原始文本
      return text;
    }
  }, []);

  // 生成统一差异格式（按行对比）
  const generateUnifiedDiff = useCallback((oldStr: string, newStr: string): string => {
    if (!oldStr && !newStr) return '';

    // 如果启用了 JSON 格式化，先格式化文本
    const formattedOldStr = formatJson ? formatJsonText(oldStr) : oldStr;
    const formattedNewStr = formatJson ? formatJsonText(newStr) : newStr;

    // 使用diff库计算行级差异
    const diff = DiffLib.diffLines(formattedOldStr, formattedNewStr);

    let unifiedDiff = `--- a/file\n+++ b/file\n`;
    let hunkContent = '';
    let hunkStartOld = 1;
    let hunkStartNew = 1;
    let hunkLinesOld = 0;
    let hunkLinesNew = 0;

    diff.forEach((part, index) => {
      const lines = part.value.split('\n');
      // 移除最后一个空行（如果有的话）
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      if (part.added) {
        // 新增的行
        lines.forEach(line => {
          hunkContent += `+${line}\n`;
          hunkLinesNew++;
        });
      } else if (part.removed) {
        // 删除的行
        lines.forEach(line => {
          hunkContent += `-${line}\n`;
          hunkLinesOld++;
        });
      } else {
        // 未改变的行 - 确保显示所有内容
        lines.forEach(line => {
          hunkContent += ` ${line}\n`;
          hunkLinesOld++;
          hunkLinesNew++;
        });
      }
    });

    // 输出hunk
    if (hunkContent) {
      unifiedDiff += `@@ -${hunkStartOld},${hunkLinesOld} +${hunkStartNew},${hunkLinesNew} @@\n`;
      unifiedDiff += hunkContent;
    }

    return unifiedDiff;
  }, [formatJson, formatJsonText]);

  // 解析差异
  const diffText = useMemo(() => {
    return generateUnifiedDiff(oldText, newText);
  }, [oldText, newText, generateUnifiedDiff]);

  // 解析差异数据
  const files = useMemo(() => {
    if (!oldText && !newText) return [];
    try {
      return parseDiff(diffText);
    } catch (error) {
      console.error('解析差异失败:', error);
      return [];
    }
  }, [diffText, oldText, newText]);

  return (
    <div className="tool-container">
      <h2>文本差异对比工具（按行对比）</h2>
      <div className="tool-content">
        <div className="diff-inputs">
          <div className="text-section">
            <h3>原始文本</h3>
            <textarea
              value={oldText}
              onChange={(e) => setOldText(e.target.value)}
              placeholder="请输入原始文本..."
              rows={10}
            />
          </div>
          <div className="text-section">
            <h3>新文本</h3>
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="请输入新文本..."
              rows={10}
            />
          </div>
        </div>
        <div className="button-section">
          <button onClick={() => {
            setOldText(defaultOldText);
            setNewText(defaultNewText);
          }}>
            加载示例
          </button>
          <button onClick={handleClear}>清空</button>
          <button onClick={copyToClipboard} disabled={!diffText} title="复制差异">
            📋
          </button>
          <label className="format-toggle">
            <input
              type="checkbox"
              checked={formatJson}
              onChange={(e) => setFormatJson(e.target.checked)}
            />
            自动格式化 JSON
          </label>
        </div>
        {(oldText || newText) && (
          <div className="diff-output">
            <h3>差异对比结果:</h3>
            {files.length > 0 && files.map((file, i) => (
              <Diff
                key={i}
                viewType="split"
                diffType={file.type}
                hunks={file.hunks}
              >
                {(hunks) => hunks.map((hunk) => (
                  <Hunk key={hunk.content} hunk={hunk} />
                ))}
              </Diff>
            ))}
            {files.length === 0 && <p>无法生成差异视图，请检查输入文本。</p>}
          </div>
        )}

        {/* 复制成功提示 */}
        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default DiffViewer;
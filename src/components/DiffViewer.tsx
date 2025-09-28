import React, { useState, useMemo } from 'react';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import 'react-diff-view/style/index.css';

const DiffViewer = () => {
  const [oldText, setOldText] = useState<string>('');
  const [newText, setNewText] = useState<string>('');

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

  // 生成统一差异格式
  const generateUnifiedDiff = (oldStr: string, newStr: string): string => {
    if (!oldStr && !newStr) return '';

    const oldLines = oldStr ? oldStr.split('\n') : [];
    const newLines = newStr ? newStr.split('\n') : [];

    let diff = `--- a/file\n+++ b/file\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;

    oldLines.forEach(line => {
      diff += `-${line}\n`;
    });

    newLines.forEach(line => {
      diff += `+${line}\n`;
    });

    return diff;
  };

  // 解析差异
  const diffText = useMemo(() => {
    return generateUnifiedDiff(oldText, newText);
  }, [oldText, newText]);

  // 解析差异数据
  const files = useMemo(() => {
    if (!oldText && !newText) return [];
    try {
      return parseDiff(diffText);
    } catch (error) {
      console.error('解析差异失败:', error);
      return [];
    }
  }, [diffText]);

  return (
    <div className="tool-container">
      <h2>文本差异对比工具</h2>
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
      </div>
    </div>
  );
};

export default DiffViewer;

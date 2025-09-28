import React, { useState } from 'react';
import DiffViewerComponent from 'react-diff-viewer';

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
            <DiffViewerComponent
              oldValue={oldText}
              newValue={newText}
              splitView={true}
              renderContent={(str) => <pre style={{ display: 'inline' }}>{str}</pre>}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffViewer;

import React, { useState } from 'react';
import './App.css';
import JsonFormatter from './components/JsonFormatter';
import DiffViewer from './components/DiffViewer';
import QrCodeGenerator from './components/QrCodeGenerator';

// 定义工具类型
type ToolType = 'json' | 'diff' | 'qr';

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('json');

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-container">
          <div className="header-left">
            <nav className="tool-navigation">
              <button
                className={activeTool === 'json' ? 'active' : ''}
                onClick={() => setActiveTool('json')}
              >
                <span className="button-icon">📝</span>
                JSON格式化
              </button>
              <button
                className={activeTool === 'diff' ? 'active' : ''}
                onClick={() => setActiveTool('diff')}
              >
                <span className="button-icon">🔍</span>
                文本差异对比
              </button>
              <button
                className={activeTool === 'qr' ? 'active' : ''}
                onClick={() => setActiveTool('qr')}
              >
                <span className="button-icon">📱</span>
                URL转二维码
              </button>
            </nav>
          </div>
          <div className="header-right">
            <div className="header-info">
              <span className="version">v1.0</span>
            </div>
          </div>
        </div>
      </header>
      <main className="App-main">
        {activeTool === 'json' && <JsonFormatter />}
        {activeTool === 'diff' && <DiffViewer />}
        {activeTool === 'qr' && <QrCodeGenerator />}
      </main>
    </div>
  );
}

export default App;

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
        <nav className="tool-navigation">
          <button
            className={activeTool === 'json' ? 'active' : ''}
            onClick={() => setActiveTool('json')}
          >
            JSON格式化
          </button>
          <button
            className={activeTool === 'diff' ? 'active' : ''}
            onClick={() => setActiveTool('diff')}
          >
            文本差异对比
          </button>
          <button
            className={activeTool === 'qr' ? 'active' : ''}
            onClick={() => setActiveTool('qr')}
          >
            URL转二维码
          </button>
        </nav>
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

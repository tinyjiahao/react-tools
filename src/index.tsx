import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// 初始化 Monaco 本地打包（必须在 @monaco-editor/react 组件挂载前执行）
import './lib/monaco';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

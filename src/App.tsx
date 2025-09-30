import React, { useState, useEffect } from 'react';
import './App.css';
import JsonFormatter from './components/JsonFormatter';
import DiffViewer from './components/DiffViewer';
import QrCodeGenerator from './components/QrCodeGenerator';
import UrlEncoder from './components/UrlEncoder';

// 定义工具类型
type ToolType = 'json' | 'diff' | 'qr' | 'url-encoder';

// 定义工具分类
interface ToolCategory {
  name: string;
  icon: string;
  tools: Array<{
    id: ToolType;
    name: string;
    description: string;
  }>;
}

const toolCategories: ToolCategory[] = [
  {
    name: 'JSON工具',
    icon: '🔧',
    tools: [
      { id: 'json', name: 'JSON格式化', description: 'JSON数据格式化和验证' }
    ]
  },
  {
    name: '文本工具',
    icon: '📝',
    tools: [
      { id: 'diff', name: '文本差异对比', description: '比较两个文本的差异' }
    ]
  },
  {
    name: 'URL工具',
    icon: '🔗',
    tools: [
      { id: 'qr', name: 'URL转二维码', description: '生成二维码' },
      { id: 'url-encoder', name: 'URL编解码', description: 'URL编码和解码' }
    ]
  }
];

// 工具ID到URL参数的映射
const toolIdToParam: Record<ToolType, string> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder'
};

// URL参数到工具ID的映射
const paramToToolId: Record<string, ToolType> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder'
};

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('json');
  const [activeCategory, setActiveCategory] = useState<string>('JSON工具');
  const [showDropdown, setShowDropdown] = useState<string | null>(null);

  // 页面加载时解析URL参数
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabId = urlParams.get('tabid');

    if (tabId && paramToToolId[tabId]) {
      const toolId = paramToToolId[tabId];
      setActiveTool(toolId);

      // 设置对应的分类
      for (const category of toolCategories) {
        const tool = category.tools.find(t => t.id === toolId);
        if (tool) {
          setActiveCategory(category.name);
          break;
        }
      }
    }
  }, []);

  // 更新URL参数
  const updateUrl = (toolId: ToolType) => {
    const param = toolIdToParam[toolId];
    const url = new URL(window.location.href);
    url.searchParams.set('tabid', param);
    window.history.replaceState({}, '', url.toString());
  };

  const handleCategoryClick = (categoryName: string) => {
    if (showDropdown === categoryName) {
      setShowDropdown(null);
    } else {
      setShowDropdown(categoryName);
      setActiveCategory(categoryName);
    }
  };

  const handleToolSelect = (toolId: ToolType) => {
    setActiveTool(toolId);
    setShowDropdown(null);
    updateUrl(toolId);
  };

  const getCurrentTool = () => {
    for (const category of toolCategories) {
      const tool = category.tools.find(t => t.id === activeTool);
      if (tool) return tool;
    }
    return { id: activeTool, name: 'JSON格式化', description: 'JSON数据格式化和验证' };
  };

  const currentTool = getCurrentTool();

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-container">
          <div className="header-left">
            <nav className="main-navigation">
              {toolCategories.map((category) => (
                <div key={category.name} className="nav-item">
                  <button
                    className={`nav-button ${activeCategory === category.name ? 'active' : ''}`}
                    onClick={() => handleCategoryClick(category.name)}
                  >
                    <span className="nav-icon">{category.icon}</span>
                    <span className="nav-text">{category.name}</span>
                    {category.tools.length > 0 && (
                      <span className="nav-arrow">▼</span>
                    )}
                  </button>
                  {showDropdown === category.name && category.tools.length > 0 && (
                    <div className="dropdown-menu">
                      {category.tools.map((tool) => (
                        <button
                          key={tool.id}
                          className={`dropdown-item ${activeTool === tool.id ? 'active' : ''}`}
                          onClick={() => handleToolSelect(tool.id)}
                        >
                          <div className="dropdown-item-content">
                            <span className="dropdown-item-name">{tool.name}</span>
                            <span className="dropdown-item-desc">{tool.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
          <div className="header-right">
            <div className="header-actions">
              <span className="current-tool-name">{currentTool.name}</span>
              <div className="header-info">
                <span className="version">v2.0</span>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="App-main">
        <div className="main-container">
          {activeTool === 'json' && <JsonFormatter />}
          {activeTool === 'diff' && <DiffViewer />}
          {activeTool === 'qr' && <QrCodeGenerator />}
          {activeTool === 'url-encoder' && <UrlEncoder />}
        </div>
      </main>
    </div>
  );
}

export default App;

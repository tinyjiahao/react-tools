import React, { useState, useEffect } from 'react';
import './App.css';
import JsonFormatter from './components/JsonFormatter';
import DiffViewer from './components/DiffViewer';
import QrCodeGenerator from './components/QrCodeGenerator';
import UrlEncoder from './components/UrlEncoder';
import ByteConverter from './components/ByteConverter';
import Base64Encoder from './components/Base64Encoder';

// 定义工具类型
type ToolType = 'json' | 'diff' | 'qr' | 'url-encoder' | 'byte-converter' | 'base64';

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
      { id: 'diff', name: '文本差异对比', description: '比较两个文本的差异' },
      { id: 'byte-converter', name: '字节转换', description: '不同字节单位之间的转换' },
      { id: 'base64', name: 'Base64压缩编码', description: '文本压缩并Base64编码' }
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
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64'
};

// URL参数到工具ID的映射
const paramToToolId: Record<string, ToolType> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64'
};

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('json');
  const [activeCategory, setActiveCategory] = useState<string>('JSON工具');
  const [showDropdown, setShowDropdown] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<'top' | 'left'>(() => {
    return (localStorage.getItem('layoutMode') as 'top' | 'left') || 'top';
  });

  // 保存布局设置到本地存储
  useEffect(() => {
    localStorage.setItem('layoutMode', layoutMode);
  }, [layoutMode]);

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

  // 监听布局变化，处理菜单展开状态
  useEffect(() => {
    if (layoutMode === 'top') {
      setShowDropdown([]); // 顶部模式下默认收起所有
    } else {
      // 左侧模式下，确保当前激活工具所在的分类是展开的
      const currentCategory = toolCategories.find(c => 
        c.tools.some(t => t.id === activeTool)
      );
      if (currentCategory) {
        setShowDropdown(prev => {
           if (!prev.includes(currentCategory.name)) {
             return [...prev, currentCategory.name];
           }
           return prev;
        });
      }
    }
  }, [layoutMode, activeTool]);

  // 更新URL参数
  const updateUrl = (toolId: ToolType) => {
    const param = toolIdToParam[toolId];
    const url = new URL(window.location.href);
    url.searchParams.set('tabid', param);
    window.history.replaceState({}, '', url.toString());
  };

  const handleCategoryClick = (categoryName: string) => {
    if (layoutMode === 'left') {
      // 左侧布局：多选展开/折叠
      setShowDropdown(prev => {
        if (prev.includes(categoryName)) {
          return prev.filter(name => name !== categoryName);
        } else {
          return [...prev, categoryName];
        }
      });
    } else {
      // 顶部布局：互斥展开
      setShowDropdown(prev => {
        if (prev.includes(categoryName)) {
          return [];
        } else {
          return [categoryName];
        }
      });
    }
    setActiveCategory(categoryName);
  };

  const handleToolSelect = (toolId: ToolType) => {
    setActiveTool(toolId);
    // 在顶部布局下，选择工具后关闭下拉菜单；左侧布局保持不变
    if (layoutMode === 'top') {
      setShowDropdown([]);
    }
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
    <div className={`App ${layoutMode === 'left' ? 'layout-left' : ''}`}>
      <header className="App-header">
        <div className="header-container">
          <div className="header-left">
            <div className="logo" style={{ marginRight: '20px' }}>
              <span className="logo-icon">🛠️</span>
              <span className="logo-text">Tools</span>
            </div>
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
                  {showDropdown.includes(category.name) && category.tools.length > 0 && (
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
              <button 
                className="btn-icon"
                onClick={() => setLayoutMode(layoutMode === 'top' ? 'left' : 'top')}
                title={layoutMode === 'top' ? "切换到侧边栏" : "切换到顶部栏"}
                style={{ fontSize: '18px' }}
              >
                {layoutMode === 'top' ? '⬅️' : '⬆️'}
              </button>
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
          {activeTool === 'byte-converter' && <ByteConverter />}
          {activeTool === 'base64' && <Base64Encoder />}
        </div>
      </main>
    </div>
  );
}

export default App;
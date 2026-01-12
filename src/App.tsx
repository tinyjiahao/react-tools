import React, { useState, useEffect } from 'react';
import './App.css';
import JsonFormatter from './components/JsonFormatter';
import DiffViewer from './components/DiffViewer';
import QrCodeGenerator from './components/QrCodeGenerator';
import UrlEncoder from './components/UrlEncoder';
import ByteConverter from './components/ByteConverter';
import Base64Encoder from './components/Base64Encoder';
import R2FileManager from './components/R2FileManager';
import MarkdownViewer from './components/MarkdownViewer';
import R2ImageManager from './components/R2ImageManager';
import Icon from './components/Icon';
import SettingsDialog from './components/SettingsDialog';

// 定义工具类型
type ToolType = 'json' | 'diff' | 'qr' | 'url-encoder' | 'byte-converter' | 'base64' | 'r2-manager' | 'markdown-viewer' | 'r2-image-manager';

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
    icon: 'json',
    tools: [
      { id: 'json', name: 'JSON格式化', description: 'JSON数据格式化和验证' }
    ]
  },
  {
    name: '文本工具',
    icon: 'diff',
    tools: [
      { id: 'diff', name: '文本差异对比', description: '比较两个文本的差异' },
      { id: 'byte-converter', name: '字节转换', description: '不同字节单位之间的转换' },
      { id: 'base64', name: 'Base64压缩编码', description: '文本压缩并Base64编码' }
    ]
  },
  {
    name: 'URL工具',
    icon: 'url',
    tools: [
      { id: 'qr', name: 'URL转二维码', description: '生成二维码' },
      { id: 'url-encoder', name: 'URL编解码', description: 'URL编码和解码' }
    ]
  },
  {
    name: '存储工具',
    icon: 'cloud',
    tools: [
      { id: 'r2-manager', name: 'R2文件管理', description: 'Cloudflare R2存储文件管理' },
      { id: 'markdown-viewer', name: 'Markdown预览', description: 'Markdown在线预览与管理' },
      { id: 'r2-image-manager', name: 'R2图片管理', description: 'Cloudflare R2图片存储管理' }
    ]
  }
];

// 工具ID到URL路径的映射
const toolIdToPath: Record<ToolType, string> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64',
  'r2-manager': 'r2-manager',
  'markdown-viewer': 'markdown-viewer',
  'r2-image-manager': 'r2-image-manager'
};

// URL路径到工具ID的映射
const pathToToolId: Record<string, ToolType> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64',
  'r2-manager': 'r2-manager',
  'markdown-viewer': 'markdown-viewer',
  'r2-image-manager': 'r2-image-manager'
};

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('json');
  const [activeCategory, setActiveCategory] = useState<string>('JSON工具');
  const [showDropdown, setShowDropdown] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<'top' | 'left'>(() => {
    return (localStorage.getItem('layoutMode') as 'top' | 'left') || 'top';
  });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // 应用主题颜色
  useEffect(() => {
    const themeColor = localStorage.getItem('themeColor') || '#F6821F';
    document.documentElement.style.setProperty('--cf-orange', themeColor);
  }, []);

  // 保存布局设置到本地存储
  useEffect(() => {
    localStorage.setItem('layoutMode', layoutMode);
  }, [layoutMode]);

  // 页面加载时解析URL路径
  useEffect(() => {
    const path = window.location.pathname.substring(1); // 去掉开头的 '/'

    if (path && pathToToolId[path]) {
      const toolId = pathToToolId[path];
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

  // 更新URL路径
  const updateUrl = (toolId: ToolType) => {
    const path = toolIdToPath[toolId];
    window.history.replaceState({}, '', `/${path}`);
  };

  const handleCategoryClick = (categoryName: string) => {
    if (layoutMode === 'left') {
      // 左侧布局：点击按钮主体只负责展开，不折叠
      setShowDropdown(prev => {
        if (!prev.includes(categoryName)) {
          return [...prev, categoryName];
        }
        return prev;
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

  // 专门处理箭头的点击，用于折叠/展开
  const handleArrowClick = (e: React.MouseEvent, categoryName: string) => {
    e.stopPropagation();
    if (layoutMode === 'left') {
      setShowDropdown(prev => {
        if (prev.includes(categoryName)) {
          return prev.filter(name => name !== categoryName);
        } else {
          return [...prev, categoryName];
        }
      });
    }
  };

  const handleToolSelect = (toolId: ToolType) => {
    setActiveTool(toolId);
    // 在顶部布局下，选择工具后关闭下拉菜单；左侧布局保持不变
    if (layoutMode === 'top') {
      setShowDropdown([]);
    }
    updateUrl(toolId);
  };

  return (
    <div className={`App ${layoutMode === 'left' ? 'layout-left' : ''}`}>
      <header className="App-header">
        <div className="header-container">
          <div className="header-left">
            <div className="logo" style={{ marginRight: '20px' }}>
              <Icon name="logo" size={32} className="logo-icon" />
              <span className="logo-text">Tools</span>
            </div>
            <nav className="main-navigation">
              {toolCategories.map((category) => (
                <div key={category.name} className="nav-item">
                  <button
                    className={`nav-button ${activeCategory === category.name ? 'active' : ''}`}
                    onClick={() => handleCategoryClick(category.name)}
                  >
                    <Icon name={category.icon} size={18} className="nav-icon" />
                    <span className="nav-text">{category.name}</span>
                    {category.tools.length > 0 && (
                      <span
                        className="nav-arrow"
                        onClick={(e) => handleArrowClick(e, category.name)}
                        style={{ padding: '4px', cursor: 'pointer' }}
                      >
                        ▼
                      </span>
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
              >
                <Icon name={layoutMode === 'top' ? 'sidebar-left' : 'header-top'} size={20} />
              </button>
              <button
                className="btn-icon"
                onClick={() => setShowSettingsDialog(true)}
                title="设置"
              >
                <Icon name="gear" size={20} />
              </button>
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
          {activeTool === 'r2-manager' && <R2FileManager />}
          {activeTool === 'markdown-viewer' && <MarkdownViewer />}
          {activeTool === 'r2-image-manager' && <R2ImageManager />}
        </div>
      </main>

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />
    </div>
  );
}

export default App;
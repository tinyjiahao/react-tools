import { useLocation, useNavigate } from 'react-router';
import { toolCategories, toolIdToPath, pathToToolId } from './app/tools';
import type { ToolType } from './app/tools';
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import JsonWorkspace from './components/json/JsonWorkspace';
import DiffViewer from './components/text/DiffViewer';
import QrCodeGenerator from './components/network/QrCodeGenerator';
import UrlEncoder from './components/text/UrlEncoder';
import ByteConverter from './components/text/ByteConverter';
import Base64Encoder from './components/text/Base64Encoder';
import R2FileManager from './components/storage/R2FileManager';
import MarkdownViewer from './components/storage/MarkdownViewer';
import R2ImageManager from './components/storage/R2ImageManager';
import NotesManager from './components/storage/NotesManager';
import DrawioManager from './components/storage/DrawioManager';
import PerformanceProfiler from './components/developer/PerformanceProfiler';
import JsonlViewer from './components/llm/JsonlViewer';
import ImplViewer from './components/llm/ImplViewer';
import SseViewer from './components/llm/SseViewer';
import CurlBuilder from './components/network/CurlBuilder';
import RegexTester from './components/text/RegexTester';
import TimestampConverter from './components/developer/TimestampConverter';
import UuidGenerator from './components/developer/UuidGenerator';
import JwtDecoder from './components/network/JwtDecoder';
import Icon from './components/common/Icon';
import SettingsDialog from './components/common/SettingsDialog';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTool = pathToToolId[location.pathname.slice(1)] || 'json';
  const [activeTool, setActiveTool] = useState<ToolType>(requestedTool);
  const jsonGuard = useRef<(() => Promise<boolean>) | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (requestedTool !== activeTool) void (async () => {
      const allowed = activeTool !== 'json' || !jsonGuard.current || await jsonGuard.current();
      if (cancelled) return;
      if (allowed) setActiveTool(requestedTool);
      else navigate('/' + toolIdToPath[activeTool], { replace: true });
    })();
    return () => { cancelled = true; };
  }, [requestedTool, activeTool, navigate]);
  const [activeCategory, setActiveCategory] = useState<string>('JSON工具');
  const [showDropdown, setShowDropdown] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<'top' | 'left'>(() => {
    return (localStorage.getItem('layoutMode') as 'top' | 'left') || 'top';
  });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  // 应用深色/浅色主题
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // 应用主题颜色
  useEffect(() => {
    const themeColor = localStorage.getItem('themeColor') || '#F6821F';
    document.documentElement.style.setProperty('--cf-orange', themeColor);
  }, []);

  // 保存布局设置到本地存储
  useEffect(() => {
    localStorage.setItem('layoutMode', layoutMode);
  }, [layoutMode]);

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
    navigate('/' + path);
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
              <span className="logo-text">Tool Suit</span>
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
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? "切换到浅色模式" : "切换到深色模式"}
              >
                <Icon name={darkMode ? 'sun' : 'moon'} size={20} />
              </button>
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
      <main className={`App-main${activeTool === 'json' ? ' App-main--json' : ''}`}>
        <div className="main-container">
          {activeTool === 'json' && <JsonWorkspace darkMode={darkMode} registerGuard={guard => { jsonGuard.current = guard; }} />}
          {activeTool === 'diff' && <DiffViewer />}
          {activeTool === 'qr' && <QrCodeGenerator />}
          {activeTool === 'url-encoder' && <UrlEncoder />}
          {activeTool === 'byte-converter' && <ByteConverter />}
          {activeTool === 'base64' && <Base64Encoder />}
          {activeTool === 'r2-manager' && <R2FileManager />}
          {activeTool === 'markdown-viewer' && <MarkdownViewer />}
          {activeTool === 'r2-image-manager' && <R2ImageManager />}
          {activeTool === 'notes' && <NotesManager />}
          {activeTool === 'drawio' && <DrawioManager />}
          {activeTool === 'performance' && <PerformanceProfiler />}
          {activeTool === 'jsonl-viewer' && <JsonlViewer />}
          {activeTool === 'impl-viewer' && <ImplViewer />}
          {activeTool === 'sse-viewer' && <SseViewer />}
          {activeTool === 'curl-builder' && <CurlBuilder />}
          {activeTool === 'regex' && <RegexTester />}
          {activeTool === 'timestamp' && <TimestampConverter />}
          {activeTool === 'uuid' && <UuidGenerator />}
          {activeTool === 'jwt' && <JwtDecoder />}
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

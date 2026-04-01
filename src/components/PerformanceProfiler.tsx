import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import PerformanceGanttChart from './PerformanceGanttChart';

// 性能数据类型定义
interface PerformanceEvent {
  name: string;
  start: number;
  duration: number;
  category?: string;
  details?: Record<string, any>;
}

interface PerformanceData {
  title?: string;
  events: PerformanceEvent[];
  startTime?: number;
}

// 历史记录类型
interface HistoryRecord {
  id: string;
  timestamp: number;
  data: PerformanceData;
}

const MAX_HISTORY_COUNT = 10;

const PerformanceProfiler = () => {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<PerformanceEvent | null>(null);
  const [viewMode, setViewMode] = useState<'gantt' | 'timeline' | 'table'>('gantt');
  const [showDataDialog, setShowDataDialog] = useState(false);
  const [inputData, setInputData] = useState('');
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  // 初始化时从 localStorage 加载数据和历史记录
  useEffect(() => {
    // 加载当前数据
    const savedData = localStorage.getItem('performanceData');
    if (savedData) {
      try {
        setData(JSON.parse(savedData));
      } catch (e) {
        console.error('Failed to load saved data:', e);
      }
    } else {
      // 没有保存的数据时加载示例数据
      setData(getSampleData());
    }

    // 加载历史记录
    const savedHistory = localStorage.getItem('performanceHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
        if (parsed.length > 0) {
          setSelectedHistoryId(parsed[0].id);
        }
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
  }, []);

  // 获取示例数据
  const getSampleData = (): PerformanceData => {
    return {
      title: 'Web应用完整加载流程性能分析',
      events: [
        // 网络请求阶段
        { name: 'DNS解析与TCP连接', start: 0, duration: 80, category: 'network' },
        { name: 'TLS握手建立安全连接', start: 80, duration: 60, category: 'network' },
        { name: 'HTTP请求发送头部信息', start: 140, duration: 40, category: 'network' },
        { name: '服务器响应等待时间TTFB', start: 180, duration: 200, category: 'network' },
        { name: 'HTML文档内容下载传输', start: 380, duration: 150, category: 'network' },
        { name: 'CSS样式表文件并行加载', start: 400, duration: 180, category: 'network' },
        { name: 'JavaScript脚本文件异步加载', start: 420, duration: 220, category: 'network' },

        // HTML解析阶段
        { name: 'HTML标记词法分析和语法解析', start: 530, duration: 120, category: 'parsing' },
        { name: 'DOM树构建和节点创建', start: 580, duration: 150, category: 'parsing' },
        { name: 'CSS样式表规则解析处理', start: 650, duration: 100, category: 'parsing' },

        // JavaScript执行阶段
        { name: '主线程JavaScript代码执行初始化', start: 750, duration: 200, category: 'scripting' },
        { name: 'React框架虚拟DOM对比计算', start: 900, duration: 180, category: 'scripting' },
        { name: '组件生命周期方法和钩子函数执行', start: 950, duration: 140, category: 'scripting' },
        { name: '事件监听器注册和绑定操作', start: 1050, duration: 90, category: 'scripting' },

        // 渲染和绘制阶段
        { name: '样式重新计算和层叠规则应用', start: 1400, duration: 130, category: 'rendering' },
        { name: '页面布局Layout重排和几何信息计算', start: 1500, duration: 160, category: 'rendering' },
        { name: '绘制Paint指令生成和像素填充', start: 1620, duration: 140, category: 'rendering' },
        { name: '合成Composite图层合并和纹理上传GPU', start: 1720, duration: 120, category: 'rendering' },
      ]
    };
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 保存到历史记录
  const saveToHistory = (newData: PerformanceData) => {
    const newRecord: HistoryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      data: newData
    };

    const updatedHistory = [newRecord, ...history].slice(0, MAX_HISTORY_COUNT);
    setHistory(updatedHistory);
    setSelectedHistoryId(newRecord.id);
    localStorage.setItem('performanceHistory', JSON.stringify(updatedHistory));
  };

  // 从历史记录加载数据
  const loadFromHistory = (recordId: string) => {
    const record = history.find(r => r.id === recordId);
    if (record) {
      setData(record.data);
      setSelectedHistoryId(recordId);
      localStorage.setItem('performanceData', JSON.stringify(record.data));
      setShowHistoryDropdown(false);
      setSelectedEvent(null);
    }
  };

  // 删除历史记录
  const deleteHistoryItem = (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    const updatedHistory = history.filter(r => r.id !== recordId);
    setHistory(updatedHistory);
    localStorage.setItem('performanceHistory', JSON.stringify(updatedHistory));

    if (selectedHistoryId === recordId) {
      if (updatedHistory.length > 0) {
        setSelectedHistoryId(updatedHistory[0].id);
        loadFromHistory(updatedHistory[0].id);
      } else {
        setSelectedHistoryId(null);
        setData(null);
      }
    }
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (isToday) {
      return `今天 ${time}`;
    }
    return `${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${time}`;
  };

  // 处理数据加载
  const handleLoadData = () => {
    try {
      const jsonData = JSON.parse(inputData);

      // 支持多种数据格式
      let processedData: PerformanceData;

      if (Array.isArray(jsonData)) {
        // 纯数组格式
        processedData = { events: jsonData };
      } else if (jsonData.events && Array.isArray(jsonData.events)) {
        // 标准格式
        processedData = jsonData;
      } else if (jsonData.traceEvents) {
        // Chrome DevTools 格式
        processedData = processChromeTraceFormat(jsonData);
      } else {
        throw new Error('不支持的数据格式');
      }

      setData(processedData);
      saveToHistory(processedData);
      localStorage.setItem('performanceData', JSON.stringify(processedData));
      setError('');
      setSelectedEvent(null);
      setShowDataDialog(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 处理Chrome DevTools trace格式
  const processChromeTraceFormat = (traceData: any): PerformanceData => {
    const events: PerformanceEvent[] = [];
    const startTime = traceData.traceEvents?.[0]?.ts || 0;

    traceData.traceEvents?.forEach((event: any) => {
      if (event.ph === 'X' || event.ph === 'B') {
        events.push({
          name: event.name,
          start: ((event.ts - startTime) / 1000), // 转换为微秒
          duration: event.dur ? event.dur / 1000 : 0,
          category: event.cat,
          details: { args: event.args }
        });
      }
    });

    return {
      title: 'Chrome DevTools Trace',
      events,
      startTime
    };
  };

  // 获取时间范围
  const getTimeRange = () => {
    if (!data || data.events.length === 0) return { min: 0, total: 100 };

    const times = data.events.map(e => e.start);
    const ends = data.events.map(e => e.start + e.duration);
    const min = Math.min(...times);
    const maxTime = Math.max(...ends);

    return { min, maxTime, total: maxTime - min };
  };

  // 获取分类颜色 - 统一的颜色配置
  const CATEGORY_COLORS: Record<string, string> = {
    network: '#3b82f6',
    parsing: '#10b981',
    scripting: '#f59e0b',
    rendering: '#8b5cf6',
    default: '#6b7280'
  };

  // 为分类生成一致的颜色
  const getCategoryColor = (category?: string) => {
    if (!category) return CATEGORY_COLORS.default;

    // 如果是预定义的分类，使用预定义颜色
    if (CATEGORY_COLORS[category]) {
      return CATEGORY_COLORS[category];
    }

    // 为未知分类生成一致的颜色（基于分类名称的hash）
    const hash = category.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    const saturation = 65 + (hash % 20); // 65-85%
    const lightness = 45 + (hash % 15);  // 45-60%

    // 缓存生成的颜色
    if (!CATEGORY_COLORS[category]) {
      CATEGORY_COLORS[category] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    return CATEGORY_COLORS[category];
  };

  // 渲染甘特图
  const renderGanttChart = () => {
    if (!data || data.events.length === 0) return null;

    const { total } = getTimeRange();

    return (
      <div className="gantt-chart-container">
        <div className="gantt-chart-header">
          <h3>甘特图视图</h3>
          <div className="time-info">
            <span className="time-label">总时长:</span>
            <span className="time-value">{total.toFixed(2)}ms</span>
            <span className="event-count">({data.events.length} 个事件)</span>
          </div>
        </div>

        <PerformanceGanttChart
          events={data.events}
          categoryColors={CATEGORY_COLORS}
          onEventClick={(event) => setSelectedEvent(selectedEvent === event ? null : event)}
          selectedEvent={selectedEvent}
        />
      </div>
    );
  };

  // 渲染时间线视图
  const renderTimelineView = () => {
    if (!data || data.events.length === 0) return null;

    const { min, total } = getTimeRange();

    return (
      <div className="timeline-container">
        <div className="timeline-header">
          <h3>时间线视图</h3>
        </div>

        <div className="timeline-view">
          {data.events.map((event, index) => {
            const left = ((event.start - min) / total) * 100;
            const width = Math.max((event.duration / total) * 100, 0.5);

            return (
              <div
                key={index}
                className="timeline-event"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: getCategoryColor(event.category)
                }}
                title={`${event.name}: ${event.duration.toFixed(2)}ms`}
                onClick={() => setSelectedEvent(event)}
              />
            );
          })}
        </div>

        <div className="timeline-axis">
          {Array.from({ length: 10 }, (_, i) => {
            const time = min + (total * i) / 9;
            return (
              <div
                key={i}
                className="axis-marker"
                style={{ left: `${(i / 9) * 100}%` }}
              >
                {time.toFixed(0)}ms
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 渲染表格视图
  const renderTableView = () => {
    if (!data || data.events.length === 0) return null;

    return (
      <div className="table-view-container">
        <div className="table-header">
          <h3>表格视图</h3>
        </div>

        <div className="table-scroll-wrapper">
          <table className="performance-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>事件名称</th>
                <th>分类</th>
                <th>开始时间(ms)</th>
                <th>持续时间(ms)</th>
                <th>结束时间(ms)</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event, index) => (
                <tr
                  key={index}
                  className={selectedEvent === event ? 'selected' : ''}
                  onClick={() => setSelectedEvent(selectedEvent === event ? null : event)}
                >
                  <td>{index + 1}</td>
                  <td>{event.name}</td>
                  <td>
                    <span
                      className="category-badge"
                      style={{ backgroundColor: getCategoryColor(event.category) }}
                    >
                      {event.category || '未分类'}
                    </span>
                  </td>
                  <td>{event.start.toFixed(2)}</td>
                  <td>{event.duration.toFixed(2)}</td>
                  <td>{(event.start + event.duration).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 渲染统计信息
  const renderStatistics = () => {
    if (!data || data.events.length === 0) return null;

    const totalDuration = data.events.reduce((sum, e) => sum + e.duration, 0);
    const avgDuration = totalDuration / data.events.length;
    const maxEvent = data.events.reduce((max, e) => e.duration > max.duration ? e : max, data.events[0]);
    const categorySet = new Set<string>();
    data.events.forEach(e => {
      if (e.category) categorySet.add(e.category);
    });
    const categories = Array.from(categorySet);

    return (
      <div className="statistics-container compact">
        <div className="stats-row">
          <div className="stat-item-inline">
            <span className="stat-icon">📊</span>
            <span className="stat-label-inline">事件</span>
            <span className="stat-value-inline">{data.events.length}</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item-inline">
            <span className="stat-icon">⏱️</span>
            <span className="stat-label-inline">总时长</span>
            <span className="stat-value-inline">{totalDuration.toFixed(1)}ms</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item-inline">
            <span className="stat-icon">📈</span>
            <span className="stat-label-inline">平均</span>
            <span className="stat-value-inline">{avgDuration.toFixed(1)}ms</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item-inline">
            <span className="stat-icon">🔥</span>
            <span className="stat-label-inline">最长</span>
            <span className="stat-value-inline">{maxEvent?.duration.toFixed(1)}ms</span>
          </div>
          {categories.length > 0 && (
            <>
              <div className="stat-divider" />
              <div className="stat-categories-inline">
                {categories.map(cat => (
                  <span
                    key={cat}
                    className="stat-category-tag"
                    style={{ backgroundColor: getCategoryColor(cat) }}
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // 打开数据对话框时清空输入
  const handleOpenDataDialog = () => {
    setInputData('');
    setError('');
    setShowDataDialog(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="tool-container">
      <div className="performance-header">
        <h2>性能分析器</h2>
        <div className="header-actions">
          {/* 历史记录选择器 */}
          {history.length > 0 && (
            <div className="history-selector" ref={historyDropdownRef}>
              <button
                className="btn-history"
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                title="历史记录"
              >
                <Icon name="history" size={18} />
                历史 ({history.length})
                <Icon name={showHistoryDropdown ? 'chevronUp' : 'chevronDown'} size={14} />
              </button>
              {showHistoryDropdown && (
                <div className="history-dropdown">
                  <div className="history-header">
                    <span>历史记录</span>
                    <span className="history-count">最多保留 {MAX_HISTORY_COUNT} 条</span>
                  </div>
                  <div className="history-list">
                    {history.map((record) => (
                      <div
                        key={record.id}
                        className={`history-item ${record.id === selectedHistoryId ? 'active' : ''}`}
                        onClick={() => loadFromHistory(record.id)}
                      >
                        <div className="history-item-main">
                          <Icon name="clock" size={14} />
                          <span className="history-time">{formatTimestamp(record.timestamp)}</span>
                          <span className="history-title">{record.data.title || '未命名'}</span>
                        </div>
                        <div className="history-item-info">
                          <span>{record.data.events.length} 个事件</span>
                        </div>
                        <button
                          className="btn-delete-history"
                          onClick={(e) => deleteHistoryItem(e, record.id)}
                          title="删除"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            className="btn-load-data"
            onClick={handleOpenDataDialog}
            title="加载数据"
          >
            <Icon name="upload" size={18} />
            加载数据
          </button>
        </div>
      </div>

      <div className="tool-content">
        {data && (
          <>
            <div className="analysis-header">
              <div className="header-left">
                <h3>{data.title || '性能分析结果'}</h3>
              </div>

              <div className="view-modes">
                <button
                  className={viewMode === 'gantt' ? 'active' : ''}
                  onClick={() => setViewMode('gantt')}
                >
                  甘特图
                </button>
                <button
                  className={viewMode === 'timeline' ? 'active' : ''}
                  onClick={() => setViewMode('timeline')}
                >
                  时间线
                </button>
                <button
                  className={viewMode === 'table' ? 'active' : ''}
                  onClick={() => setViewMode('table')}
                >
                  表格
                </button>
              </div>
            </div>

            {renderStatistics()}

            <div className="charts-container">
              {viewMode === 'gantt' && renderGanttChart()}
              {viewMode === 'timeline' && renderTimelineView()}
              {viewMode === 'table' && renderTableView()}
            </div>

            {selectedEvent && (
              <div className="event-details">
                <h4>事件详情</h4>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">名称:</span>
                    <span className="detail-value">{selectedEvent.name}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">分类:</span>
                    <span className="detail-value">{selectedEvent.category || '未分类'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">开始时间:</span>
                    <span className="detail-value">{selectedEvent.start.toFixed(2)}ms</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">持续时间:</span>
                    <span className="detail-value">{selectedEvent.duration.toFixed(2)}ms</span>
                  </div>
                  {selectedEvent.details && (
                    <div className="detail-item full-width">
                      <span className="detail-label">详细信息:</span>
                      <pre className="detail-json">{JSON.stringify(selectedEvent.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* 数据加载对话框 */}
        {showDataDialog && (
          <div className="data-dialog-overlay" onClick={() => setShowDataDialog(false)}>
            <div className="data-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="data-dialog-header">
                <h3>加载数据</h3>
                <button
                  className="btn-close"
                  onClick={() => setShowDataDialog(false)}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className="data-dialog-content">
                <div className="input-section">
                  <label>粘贴 JSON 数据:</label>
                  <textarea
                    ref={inputRef}
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                    placeholder='粘贴JSON数据，例如:&#10;{&#10;  "title": "性能分析",&#10;  "events": [&#10;    { "name": "事件1", "start": 0, "duration": 100, "category": "network" }&#10;  ]&#10;}'
                    className="data-textarea"
                    rows={15}
                  />
                </div>

                {error && (
                  <div className="error-message">
                    <Icon name="warning" size={18} className="error-icon" />
                    {error}
                  </div>
                )}

                <div className="format-info">
                  <h4>支持的数据格式</h4>
                  <div className="format-tabs">
                    <div className="format-tab">
                      <strong>标准格式:</strong>
                      <pre>{`{
  "title": "性能分析",
  "events": [
    { "name": "事件1", "start": 0, "duration": 100, "category": "network" },
    { "name": "事件2", "start": 100, "duration": 50, "category": "scripting" }
  ]
}`}</pre>
                    </div>
                    <div className="format-tab">
                      <strong>数组格式:</strong>
                      <pre>{`[
  { "name": "事件1", "start": 0, "duration": 100 },
  { "name": "事件2", "start": 100, "duration": 50 }
]`}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="data-dialog-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setShowDataDialog(false)}
                >
                  取消
                </button>
                <button
                  className="btn-primary"
                  onClick={handleLoadData}
                >
                  加载
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceProfiler;

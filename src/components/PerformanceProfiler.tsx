import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pako from 'pako';
import html2canvas from 'html2canvas';
import {
  getSearchBackendSampleData,
  type PerformanceData,
  type PerformanceEvent,
} from '../lib/performanceSampleData';
import Icon from './Icon';
import PerformanceGanttChart from './PerformanceGanttChart';

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
  const [viewMode, setViewMode] = useState<'gantt' | 'timeline' | 'table' | 'raw'>('gantt');
  const [showDataDialog, setShowDataDialog] = useState(false);
  const [inputData, setInputData] = useState('');
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [minDuration, setMinDuration] = useState<number>(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const ganttContainerRef = useRef<HTMLDivElement>(null);

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
      setData(getSearchBackendSampleData());
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
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
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

  // 解码 H4 压缩格式（base64 + gzip），复用 Base64Encoder 的解码逻辑
  const decodeH4Data = (input: string): string => {
    const binaryString = window.atob(input);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.ungzip(bytes);
    return new TextDecoder().decode(decompressed);
  };

  // 处理数据加载
  const handleLoadData = () => {
    try {
      let rawJson = inputData.trim();
      if (rawJson.startsWith('H4')) {
        rawJson = decodeH4Data(rawJson);
      }
      const jsonData = JSON.parse(rawJson);

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
    const maxTime = Math.max(...ends);

    return { min: Math.min(...times), maxTime, total: maxTime - Math.min(...times) };
  };

  // 获取分类颜色 - 统一的颜色配置
  const CATEGORY_COLORS: Record<string, string> = {
    request: '#475569',
    serial: '#2563eb',
    'query-parallel': '#0891b2',
    'recall-parallel': '#059669',
    'feature-parallel': '#7c3aed',
    ranking: '#d97706',
    'response-parallel': '#db2777',
    async: '#dc2626',
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

  // 保存甘特图为图片（展开全部内容后截图）
  const handleSaveGanttImage = useCallback(async () => {
    if (!ganttContainerRef.current) return;

    // 需要临时展开的选择器及对应属性
    const overrides: { el: HTMLElement; props: Record<string, string> }[] = [];
    const patch = (selector: string, props: Record<string, string>) => {
      ganttContainerRef.current!.querySelectorAll<HTMLElement>(selector).forEach(el => {
        overrides.push({ el, props: Object.fromEntries(Object.keys(props).map(k => [k, el.style.getPropertyValue(k)])) });
        Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v));
      });
    };

    patch('.performance-gantt-chart', { overflow: 'visible' });
    patch('.gantt-scroll-container', { overflow: 'visible', height: 'auto', 'max-height': 'none' });
    patch('.gantt-timeline-area', { overflow: 'visible' });

    try {
      const target = ganttContainerRef.current;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        width: target.scrollWidth,
        height: target.scrollHeight,
      });
      const link = document.createElement('a');
      link.download = `gantt-${data?.title || 'chart'}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      overrides.forEach(({ el, props }) =>
        Object.entries(props).forEach(([k, v]) => v ? el.style.setProperty(k, v) : el.style.removeProperty(k))
      );
    }
  }, [data]);

  // 渲染甘特图
  const renderGanttChart = () => {
    if (!data || data.events.length === 0) return null;

    const { total } = getTimeRange();
    const filteredEvents = data.events.filter(e => e.duration >= minDuration);
    const DURATION_PRESETS = [0, 1, 5, 10, 20, 50];

    return (
      <div className="gantt-chart-container" ref={ganttContainerRef}>
        <div className="gantt-chart-header">
          <h3>甘特图视图</h3>
          <div className="time-info">
            <span className="time-label">总时长:</span>
            <span className="time-value">{total.toFixed(2)}ms</span>
            <span className="event-count">({filteredEvents.length}/{data.events.length} 个事件)</span>
            <button className="btn-save-image" onClick={handleSaveGanttImage} title="保存为图片">
              <Icon name="download" size={16} />
              保存图片
            </button>
          </div>
        </div>

        <div className="gantt-filter-bar">
          <span className="gantt-filter-label">最小时长:</span>
          {DURATION_PRESETS.map(v => (
            <button
              key={v}
              className={`gantt-filter-btn${minDuration === v ? ' active' : ''}`}
              onClick={() => setMinDuration(v)}
            >
              {v === 0 ? '全部' : `≥${v}ms`}
            </button>
          ))}
          <input
            type="number"
            className="gantt-filter-input"
            value={minDuration}
            min={0}
            onChange={e => setMinDuration(Math.max(0, Number(e.target.value)))}
            title="自定义最小时长(ms)"
          />
          <span className="gantt-filter-unit">ms</span>
        </div>

        <PerformanceGanttChart
          events={filteredEvents}
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

    const times = data.events.map(e => e.start);
    const ends = data.events.map(e => e.start + e.duration);
    const min = Math.min(...times);
    const maxTime = Math.max(...ends);
    const total = maxTime - min;

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

  const handleLoadSampleData = () => {
    const sampleData = getSearchBackendSampleData();
    setData(sampleData);
    localStorage.setItem('performanceData', JSON.stringify(sampleData));
    setSelectedEvent(null);
    setShowDataDialog(false);
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
    <div className="tool-container performance-profiler">
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
                          className="btn-copy-history"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(JSON.stringify(record.data, null, 2));
                          }}
                          title="复制数据"
                        >
                          <Icon name="copy" size={14} />
                        </button>
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
          <button
            className="btn-sample-data"
            onClick={handleLoadSampleData}
            title="加载示例数据"
          >
            <Icon name="book" size={18} />
            示例数据
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
                <button
                  className={viewMode === 'raw' ? 'active' : ''}
                  onClick={() => setViewMode('raw')}
                >
                  原始数据
                </button>
              </div>
            </div>

            <div className="performance-workspace">
              <div className="charts-container">
                {viewMode === 'gantt' && renderGanttChart()}
                {viewMode === 'timeline' && renderTimelineView()}
                {viewMode === 'table' && renderTableView()}
                {viewMode === 'raw' && (
                  <div className="raw-data-container">
                    <div className="raw-data-header">
                      <span>原始 JSON 数据</span>
                      <button
                        className="btn-copy-raw"
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
                      >
                        <Icon name="copy" size={14} />
                        复制
                      </button>
                    </div>
                    <pre className="raw-data-content">{JSON.stringify(data, null, 2)}</pre>
                  </div>
                )}
              </div>

              {selectedEvent && (
                <aside className="event-details" aria-label="事件详情">
                  <div className="event-details-header">
                    <h4>事件详情</h4>
                    <button
                      className="event-details-close"
                      onClick={() => setSelectedEvent(null)}
                      title="折叠详情"
                      aria-label="折叠事件详情"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="details-grid">
                    <div className="detail-item full-width">
                      <span className="detail-label">名称</span>
                      <span className="detail-value">{selectedEvent.name}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">分类</span>
                      <span className="detail-value">{selectedEvent.category || '未分类'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">开始时间</span>
                      <span className="detail-value">{selectedEvent.start.toFixed(2)}ms</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">持续时间</span>
                      <span className="detail-value">{selectedEvent.duration.toFixed(2)}ms</span>
                    </div>
                    {selectedEvent.details && (
                      <div className="detail-item full-width">
                        <span className="detail-label">详细信息</span>
                        <pre className="detail-json">{JSON.stringify(selectedEvent.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
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

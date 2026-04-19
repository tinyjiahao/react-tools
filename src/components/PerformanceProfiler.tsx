import React, { useState, useRef, useEffect } from 'react';
import pako from 'pako';
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
  const [viewMode, setViewMode] = useState<'gantt' | 'timeline' | 'table' | 'raw'>('gantt');
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
    const base64 = input.slice(2); // 去掉 "H4" 前缀
    const binaryString = window.atob(base64);
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

  // 生成在线服务性能分析示例数据（含嵌套调用关系）
  const getOnlineServiceSampleData = (): PerformanceData => {
    return {
      title: '电商搜索服务请求链路性能分析',
      events: [
        // ===== A. 请求总入口 =====
        { name: 'A1-请求鉴权与Token校验', start: 0, duration: 5, category: 'A-请求入口' },
        { name: 'A2-请求参数解析与校验', start: 5, duration: 3, category: 'A-请求入口' },
        { name: 'A3-AB实验分桶命中', start: 8, duration: 8, category: 'A-请求入口' },

        // ===== B. 查询理解 (QU) 阶段 =====
        { name: 'B1-查询理解总流程', start: 16, duration: 94, category: 'A-请求入口' },
        { name: 'B1-C1-分词与词性标注', start: 16, duration: 12, category: 'B1-查询理解总流程' },
        { name: 'B1-C2-意图识别总流程', start: 28, duration: 50, category: 'B1-查询理解总流程' },
        { name: 'B1-C2-D1-意图分类模型推理', start: 28, duration: 35, category: 'B1-C2-意图识别总流程' },
        { name: 'B1-C2-D2-意图置信度评估', start: 63, duration: 10, category: 'B1-C2-意图识别总流程' },
        { name: 'B1-C2-D3-多意图合并与消歧', start: 73, duration: 5, category: 'B1-C2-意图识别总流程' },
        { name: 'B1-C3-实体识别与NER抽取', start: 28, duration: 28, category: 'B1-查询理解总流程' },
        { name: 'B1-C4-查询改写总流程', start: 78, duration: 26, category: 'B1-查询理解总流程' },
        { name: 'B1-C4-D1-拼写纠错', start: 78, duration: 8, category: 'B1-C4-查询改写总流程' },
        { name: 'B1-C4-D2-同义词扩展', start: 86, duration: 12, category: 'B1-C4-查询改写总流程' },
        { name: 'B1-C4-D3-查询扩展结果排序', start: 98, duration: 6, category: 'B1-C4-查询改写总流程' },
        { name: 'B1-C5-地域与商圈信息补全', start: 104, duration: 6, category: 'B1-查询理解总流程' },

        // ===== C. 多路召回阶段 (并行) =====
        { name: 'C1-多路召回总流程', start: 110, duration: 85, category: 'A-请求入口' },
        { name: 'C1-D1-倒排索引召回', start: 110, duration: 45, category: 'C1-多路召回总流程' },
        { name: 'C1-D2-向量语义召回', start: 110, duration: 68, category: 'C1-多路召回总流程' },
        { name: 'C1-D3-个性化协同过滤召回', start: 110, duration: 55, category: 'C1-多路召回总流程' },
        { name: 'C1-D4-店铺GraphWalk召回', start: 112, duration: 72, category: 'C1-多路召回总流程' },
        { name: 'C1-D5-广告商品召回', start: 112, duration: 30, category: 'C1-多路召回总流程' },
        { name: 'C1-D6-运营活动强插召回', start: 115, duration: 8, category: 'C1-多路召回总流程' },
        { name: 'C1-D7-多路结果合并与去重', start: 184, duration: 11, category: 'C1-多路召回总流程' },

        // ===== D. 排序阶段 =====
        { name: 'D1-排序总流程', start: 195, duration: 120, category: 'A-请求入口' },
        { name: 'D1-E1-粗排过滤', start: 195, duration: 22, category: 'D1-排序总流程' },
        { name: 'D1-E1-F1-销量过滤', start: 195, duration: 6, category: 'D1-E1-粗排过滤' },
        { name: 'D1-E1-F2-评分过滤', start: 201, duration: 8, category: 'D1-E1-粗排过滤' },
        { name: 'D1-E1-F3-距离过滤', start: 209, duration: 8, category: 'D1-E1-粗排过滤' },
        { name: 'D1-E2-特征提取总流程', start: 217, duration: 30, category: 'D1-排序总流程' },
        { name: 'D1-E2-F1-用户画像特征提取', start: 217, duration: 15, category: 'D1-E2-特征提取总流程' },
        { name: 'D1-E2-F2-商品基础特征提取', start: 217, duration: 12, category: 'D1-E2-特征提取总流程' },
        { name: 'D1-E2-F3-上下文场景特征', start: 220, duration: 18, category: 'D1-E2-特征提取总流程' },
        { name: 'D1-E2-F4-交叉特征计算', start: 232, duration: 15, category: 'D1-E2-特征提取总流程' },
        { name: 'D1-E3-精排模型推理', start: 247, duration: 55, category: 'D1-排序总流程' },
        { name: 'D1-E4-广告排序竞价', start: 247, duration: 40, category: 'D1-排序总流程' },
        { name: 'D1-E5-业务规则调权', start: 302, duration: 8, category: 'D1-排序总流程' },

        // ===== E. 重排策略阶段 =====
        { name: 'E1-重排策略总流程', start: 315, duration: 38, category: 'A-请求入口' },
        { name: 'E1-F1-多样性打散(MMR)', start: 315, duration: 12, category: 'E1-重排策略总流程' },
        { name: 'E1-F2-坑位分配与广告植入', start: 327, duration: 10, category: 'E1-重排策略总流程' },
        { name: 'E1-F3-运营活动坑位填充', start: 327, duration: 8, category: 'E1-重排策略总流程' },
        { name: 'E1-F4-地域化重排(同城优先)', start: 337, duration: 6, category: 'E1-重排策略总流程' },
        { name: 'E1-F5-最终列表截断与分页', start: 343, duration: 10, category: 'E1-重排策略总流程' },

        // ===== F. 详情补全阶段 (并行RPC) =====
        { name: 'F1-详情补全总流程', start: 353, duration: 50, category: 'A-请求入口' },
        { name: 'F1-G1-商品基本信息批量查询', start: 353, duration: 35, category: 'F1-详情补全总流程' },
        { name: 'F1-G2-实时库存与价格查询', start: 353, duration: 42, category: 'F1-详情补全总流程' },
        { name: 'F1-G3-营销优惠信息查询', start: 355, duration: 28, category: 'F1-详情补全总流程' },
        { name: 'F1-G4-评价摘要与评分查询', start: 355, duration: 22, category: 'F1-详情补全总流程' },
        { name: 'F1-G5-店铺信息批量查询', start: 357, duration: 30, category: 'F1-详情补全总流程' },
        { name: 'F1-G6-图片CDN地址签名生成', start: 387, duration: 8, category: 'F1-详情补全总流程' },

        // ===== G. 组装输出阶段 =====
        { name: 'G1-组装与输出总流程', start: 403, duration: 17, category: 'A-请求入口' },
        { name: 'G1-H1-结果DTO组装与序列化', start: 403, duration: 10, category: 'G1-组装与输出总流程' },
        { name: 'G1-H2-埋点日志异步写入', start: 403, duration: 5, category: 'G1-组装与输出总流程' },
        { name: 'G1-H3-AB实验指标上报', start: 408, duration: 3, category: 'G1-组装与输出总流程' },
        { name: 'G1-H4-监控指标采集', start: 408, duration: 2, category: 'G1-组装与输出总流程' },
        { name: 'G1-H5-响应压缩与返回', start: 413, duration: 7, category: 'G1-组装与输出总流程' },
      ]
    };
  };

  const handleLoadSampleData = () => {
    const sampleData = getOnlineServiceSampleData();
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

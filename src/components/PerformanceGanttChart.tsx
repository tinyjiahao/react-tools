import React, { useRef, useEffect, useState } from 'react';
import './PerformanceGanttChart.css';

interface PerformanceEvent {
  name: string;
  start: number;
  duration: number;
  category?: string;
  details?: Record<string, any>;
}

interface PerformanceGanttChartProps {
  events: PerformanceEvent[];
  categoryColors?: Record<string, string>;
  onEventClick?: (event: PerformanceEvent) => void;
  selectedEvent?: PerformanceEvent | null;
}

const PerformanceGanttChart: React.FC<PerformanceGanttChartProps> = ({
  events,
  categoryColors = {},
  onEventClick,
  selectedEvent
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollPosition({
        left: container.scrollLeft,
        top: container.scrollTop
      });
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && (scrollPosition.left !== 0 || scrollPosition.top !== 0)) {
      container.scrollLeft = scrollPosition.left;
      container.scrollTop = scrollPosition.top;
    }
  }, [events, scrollPosition]);

  if (events.length === 0) {
    return <div className="gantt-empty">暂无数据</div>;
  }

  const minStart = Math.min(...events.map(e => e.start));
  const maxEnd = Math.max(...events.map(e => e.start + e.duration));
  const totalDuration = maxEnd - minStart;

  const rowHeight = 52;
  const headerHeight = 56;
  const timeMarkerCount = 10;

  // 更丰富的分类颜色方案
  const colorPalette = [
    { bg: '#3b82f6', light: '#eff6ff' },   // 蓝色
    { bg: '#10b981', light: '#ecfdf5' },   // 绿色
    { bg: '#f59e0b', light: '#fffbeb' },   // 琥珀色
    { bg: '#8b5cf6', light: '#f5f3ff' },   // 紫色
    { bg: '#ef4444', light: '#fef2f2' },   // 红色
    { bg: '#ec4899', light: '#fdf2f8' },   // 粉色
    { bg: '#14b8a6', light: '#f0fdfa' },   // 青色
    { bg: '#f97316', light: '#fff7ed' },   // 橙色
    { bg: '#06b6d4', light: '#ecfeff' },   // 天蓝
    { bg: '#84cc16', light: '#f7fee7' },   // 黄绿
    { bg: '#a855f7', light: '#faf5ff' },   // 浅紫
    { bg: '#e11d48', light: '#fff1f2' },   // 玫红
  ];

  // 为每个事件生成颜色，同分类共享颜色
  const categoryColorMap = new Map<string, { bg: string; light: string }>();
  let colorIndex = 0;

  const getEventColor = (event: PerformanceEvent) => {
    const key = event.category || event.name;
    if (categoryColors[event.category || '']) {
      return { bg: categoryColors[event.category || ''], light: '#f9fafb' };
    }
    if (!categoryColorMap.has(key)) {
      categoryColorMap.set(key, colorPalette[colorIndex % colorPalette.length]);
      colorIndex++;
    }
    return categoryColorMap.get(key)!;
  };

  const eventsAreaHeight = events.length * rowHeight;

  return (
    <div className="performance-gantt-chart">
      <div className="gantt-scroll-container" ref={scrollContainerRef}>
        <div className="gantt-content">
          {/* 左侧标签区域 */}
          <div className="gantt-labels">
            <div className="gantt-label-header" style={{ height: `${headerHeight}px` }}>
              事件名称
            </div>
            {events.map((event, index) => (
              <div
                key={index}
                className="gantt-label-row"
                style={{
                  height: `${rowHeight}px`,
                  backgroundColor: selectedEvent === event ? '#e8f4fd' : getEventColor(event).light
                }}
                onClick={() => onEventClick?.(event)}
              >
                <div
                  className="event-label-color-bar"
                  style={{ backgroundColor: getEventColor(event).bg }}
                />
                <div className="event-label-content">
                  <div className="event-label-name" title={event.name}>
                    {event.name}
                  </div>
                  <div className="event-label-time">
                    {event.start.toFixed(1)}ms - {(event.start + event.duration).toFixed(1)}ms({event.duration.toFixed(1)}ms)
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 右侧时间轴区域 */}
          <div className="gantt-timeline-area">
            <div className="gantt-timeline-header" style={{ height: `${headerHeight}px` }}>
              {Array.from({ length: timeMarkerCount }, (_, i) => {
                const time = minStart + (totalDuration * i) / (timeMarkerCount - 1);
                return (
                  <div
                    key={i}
                    className="timeline-header-marker"
                    style={{ left: `${(i / (timeMarkerCount - 1)) * 100}%` }}
                  >
                    <div className="timeline-time">{time.toFixed(1)}ms</div>
                    <div className="timeline-line" />
                  </div>
                );
              })}
            </div>

            <div className="gantt-events-area" style={{ height: `${eventsAreaHeight}px` }}>
              {/* 背景网格 */}
              {Array.from({ length: timeMarkerCount }, (_, i) => (
                <div
                  key={`grid-${i}`}
                  className="gantt-grid-column"
                  style={{
                    left: `${(i / (timeMarkerCount - 1)) * 100}%`,
                    width: i === timeMarkerCount - 1 ? 0 : `${100 / (timeMarkerCount - 1)}%`
                  }}
                />
              ))}

              {/* 水平分隔线 */}
              {events.map((_, index) => (
                <div
                  key={`row-${index}`}
                  className="gantt-row-divider"
                  style={{
                    top: `${index * rowHeight}px`,
                    width: '100%'
                  }}
                />
              ))}

              {/* 事件条 */}
              {events.map((event, index) => {
                const left = ((event.start - minStart) / totalDuration) * 100;
                const width = Math.max((event.duration / totalDuration) * 100, 0.3);
                const isSelected = selectedEvent === event;

                const getDisplayContent = () => {
                  if (width > 5) {
                    return <span className="event-bar-duration">{event.duration.toFixed(1)}ms</span>;
                  } else if (width > 2) {
                    return <span className="event-bar-duration-short">{Math.round(event.duration)}ms</span>;
                  } else if (width > 1) {
                    return <span className="event-bar-duration-tiny">{Math.round(event.duration)}</span>;
                  }
                  return null;
                };

                return (
                  <div
                    key={index}
                    className="gantt-event-row"
                    style={{
                      top: `${index * rowHeight}px`,
                      height: `${rowHeight}px`,
                      backgroundColor: isSelected ? '#e8f4fd' : getEventColor(event).light
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div
                      className="event-bar"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: getEventColor(event).bg,
                        boxShadow: isSelected ? '0 0 0 2px var(--cf-orange)' : undefined,
                        opacity: width < 0.5 ? 0.7 : 1
                      }}
                      title={`${event.name}: ${event.duration.toFixed(1)}ms (${event.start.toFixed(1)}ms - ${(event.start + event.duration).toFixed(1)}ms)`}
                    >
                      {getDisplayContent() && (
                        <div className="event-bar-content">
                          {getDisplayContent()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceGanttChart;

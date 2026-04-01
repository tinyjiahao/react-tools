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

  // 保存滚动位置，避免重新渲染时重置
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

  // 恢复滚动位置
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

  // 计算时间范围
  const minStart = Math.min(...events.map(e => e.start));
  const maxEnd = Math.max(...events.map(e => e.start + e.duration));
  const totalDuration = maxEnd - minStart;

  // 配置
  const rowHeight = 48;
  const headerHeight = 60;
  const labelWidth = 300;
  const timeMarkerCount = 10;

  const getCategoryColor = (category?: string) => {
    // 定义默认颜色
    const defaultColors: Record<string, string> = {
      network: '#3b82f6',
      parsing: '#10b981',
      scripting: '#f59e0b',
      rendering: '#8b5cf6',
      default: '#6b7280'
    };

    // 合并传入的颜色和默认颜色
    const colors = { ...defaultColors, ...categoryColors };
    return colors[category || ''] || colors.default || '#6b7280';
  };

  return (
    <div className="performance-gantt-chart">
      <div className="gantt-scroll-container" ref={scrollContainerRef}>
        <div
          className="gantt-content"
          style={{
            height: `${headerHeight + events.length * rowHeight}px`,
            minWidth: `${labelWidth + 800}px`
          }}
        >
          {/* 左侧标签区域 */}
          <div className="gantt-labels" style={{ width: `${labelWidth}px` }}>
            <div className="gantt-label-header" style={{ height: `${headerHeight}px` }}>
              事件名称
            </div>
            {events.map((event, index) => (
              <div
                key={index}
                className="gantt-label-row"
                style={{
                  top: `${headerHeight + index * rowHeight}px`,
                  height: `${rowHeight}px`,
                  backgroundColor: selectedEvent === event ? '#e8f4fd' : 'transparent'
                }}
                onClick={() => onEventClick?.(event)}
              >
                <div className="event-label-content">
                  <div className="event-label-name" title={event.name}>
                    {event.name}
                  </div>
                  <div className="event-label-time">
                    {event.start.toFixed(1)}ms - {(event.start + event.duration).toFixed(1)}ms
                  </div>
                </div>
                {event.category && (
                  <span
                    className="event-category-badge"
                    style={{ backgroundColor: getCategoryColor(event.category) }}
                  >
                    {event.category}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 右侧时间轴区域 */}
          <div className="gantt-timeline-area" style={{ marginLeft: `${labelWidth}px` }}>
            {/* 时间轴头部 */}
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

            {/* 事件条区域 */}
            <div className="gantt-events-area">
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

                // 计算要显示的文本内容
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
                      backgroundColor: isSelected ? '#e8f4fd' : 'transparent'
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div
                      className="event-bar"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: getCategoryColor(event.category),
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

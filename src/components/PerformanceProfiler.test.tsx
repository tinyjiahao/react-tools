import { fireEvent, render, screen } from '@testing-library/react';
import { getSearchBackendSampleData } from '../lib/performanceSampleData';
import PerformanceProfiler from './PerformanceProfiler';

describe('PerformanceProfiler sample data', () => {
  it('覆盖搜索请求的串行、并行和异步处理阶段', () => {
    const data = getSearchBackendSampleData();
    const receiveRequest = data.events.find(event => event.name === 'Receive HTTP Request');
    const initTrace = data.events.find(event => event.name === 'Initialize Trace Context');
    const authenticate = data.events.find(event => event.name === 'Validate Access Token');
    const sendResponse = data.events.find(event => event.name === 'Send HTTP Response');
    const intentRecognition = data.events.find(event => event.name === 'Detect Search Intent');
    const entityRecognition = data.events.find(event => event.name === 'Extract Named Entities');
    const asyncEvents = data.events.filter(event => event.category === 'async');

    expect(data.title).toContain('Search Backend');
    expect(data.events).toHaveLength(48);
    expect(data.events.some(event => event.name.includes('[总览]'))).toBe(false);
    expect(data.events.some(event => /^\[(Serial|Parallel)]/.test(event.name))).toBe(false);
    expect(data.events.every(event => /^[\x00-\x7F]+$/.test(event.name))).toBe(true);
    expect(data.events.every(event => event.start >= 0 && event.duration > 0)).toBe(true);
    expect(data.events.every(event => typeof event.details?.threadName === 'string')).toBe(true);
    expect(data.events.every(event => typeof event.details?.traceId === 'string')).toBe(true);
    expect(data.events.every(event => typeof event.details?.spanId === 'string')).toBe(true);
    expect(data.events.every(event => Array.isArray(event.details?.callStack) && event.details.callStack.length === 4)).toBe(true);
    expect(data.events.every(event => event.details?.timing.endMs === event.start + event.duration)).toBe(true);

    expect(receiveRequest!.start + receiveRequest!.duration).toBe(initTrace!.start);
    expect(initTrace!.start + initTrace!.duration).toBe(authenticate!.start);
    expect(intentRecognition!.start).toBe(entityRecognition!.start);

    expect(sendResponse!.start + sendResponse!.duration).toBe(315);
    expect(asyncEvents.length).toBeGreaterThanOrEqual(8);
    expect(asyncEvents.some(event => event.start >= sendResponse!.start + sendResponse!.duration)).toBe(true);
    expect(asyncEvents.some(event => event.start + event.duration > sendResponse!.start + sendResponse!.duration)).toBe(true);
  });

  it('支持打开并折叠事件详情', () => {
    localStorage.clear();
    render(<PerformanceProfiler />);

    fireEvent.click(screen.getByRole('button', { name: '示例数据' }));
    fireEvent.click(screen.getByText('Receive HTTP Request'));

    expect(screen.getByRole('complementary', { name: '事件详情' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '折叠事件详情' }));

    expect(screen.queryByRole('complementary', { name: '事件详情' })).not.toBeInTheDocument();
  });
});

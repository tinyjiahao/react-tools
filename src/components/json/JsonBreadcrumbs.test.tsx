import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { editor } from 'monaco-editor';
import { parseJsonStructure } from '../../lib/json/jsonStructure';
const mock = vi.hoisted(() => ({ message: undefined as ((e: unknown) => void) | undefined, sent: [] as { version: number; text: string }[], terminate: vi.fn() }));
vi.mock('../../lib/json/jsonStructure.worker?worker', () => ({ default: class {
  set onmessage(callback: (e: unknown) => void) { mock.message = callback; }
  postMessage(message: { version: number; text: string }) { mock.sent.push(message); }
  terminate() { mock.terminate(); }
} }));
import JsonBreadcrumbs from './JsonBreadcrumbs';
afterEach(() => { vi.useRealTimers(); mock.sent = []; mock.terminate.mockClear(); });
function setup() {
  vi.useFakeTimers(); let text = '{"a":{"b":1}}'; let cursor = 0; let change = () => {}; let move = () => {};
  const dispose = vi.fn(); const run = vi.fn().mockResolvedValue(undefined); const selection = vi.fn();
  const model = { getValue: () => text, getOffsetAt: () => cursor, getVersionId: () => 1, getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }), isDisposed: () => false };
  const instance = { getModel: () => model, getPosition: () => ({}), onDidChangeModelContent: (fn: () => void) => { change = fn; return { dispose }; }, onDidChangeCursorPosition: (fn: () => void) => { move = fn; return { dispose }; }, onDidChangeModel: () => ({ dispose }), getAction: () => ({ run }), setPosition: vi.fn(), setSelection: selection, revealPositionInCenter: vi.fn(), focus: vi.fn() } as unknown as editor.IStandaloneCodeEditor;
  const view = render(<JsonBreadcrumbs instance={instance} name="demo.json" />);
  function emit(index: number) { const request = mock.sent[index]; act(() => mock.message?.({ data: { version: request.version, ...parseJsonStructure(request.text) } })); }
  act(() => vi.advanceTimersByTime(200));
  return { view, emit, dispose, selection, run, move: (offset: number) => act(() => { cursor = offset; move(); }), edit: (value: string) => act(() => { text = value; change(); }) };
}
it('拒绝过期解析响应，卸载释放 worker 和订阅', () => {
  const test = setup(); test.edit('{"new":2}'); test.emit(0);
  expect(screen.getByRole('button', { name: /demo.json/ })).toBeDisabled();
  act(() => vi.advanceTimersByTime(200)); test.emit(1);
  expect(screen.getByRole('button', { name: /demo.json/ })).toBeEnabled();
  test.view.unmount(); expect(mock.terminate).toHaveBeenCalledOnce(); expect(test.dispose).toHaveBeenCalledTimes(3);
});
it('光标生成层级，结构树跳转展开祖先并选中对应范围', async () => {
  const test = setup(); test.emit(0); test.move(10);
  expect(screen.getByRole('navigation')).toHaveTextContent('demo.json›{}a›#b');
  fireEvent.click(screen.getByRole('button', { name: /demo.json/ }));
  fireEvent.click(screen.getByRole('button', { name: '展开 a' }));
  await act(async () => { fireEvent.click(screen.getByTitle('跳转到 b')); });
  expect(test.run).toHaveBeenCalledWith(expect.objectContaining({ direction: 'up' }));
  expect(test.selection).toHaveBeenCalled(); expect(screen.queryByRole('tree')).not.toBeInTheDocument(); test.view.unmount();
});

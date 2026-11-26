import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/json/embeddedJson.worker?worker', () => ({ default: class { postMessage() {} terminate() {} } }));
vi.mock('./JsonBreadcrumbs', () => ({ default: () => null }));
const live = vi.hoisted(() => ({ trigger: vi.fn(), path: '', value: '', change: undefined as ((value: string) => void) | undefined }));
vi.mock('monaco-editor', () => ({ editor: { getModel: () => undefined }, Uri: { parse: (value: string) => ({ toString: () => value }) } }));
vi.mock('@monaco-editor/react', () => ({ default: (props: { path: string; value: string; onChange: (value: string) => void; onMount: (editor: unknown) => void }) => {
  live.path = props.path; live.value = props.value; live.change = props.onChange;
  useEffect(() => { props.onMount({ addAction: () => ({ dispose() {} }), trigger: live.trigger, getModel: () => ({ uri: { toString: () => live.path }, getValue: () => live.value, getFullModelRange: () => ({}) }), saveViewState: () => null, focus: () => {}, pushUndoStop: () => {}, executeEdits: (_source: string, edits: { text: string }[]) => { live.value = edits[0].text; live.change?.(live.value); } }); }, []);
  return <textarea aria-label="模拟编辑器" value={props.value} readOnly />;
} }));
import JsonFormatter from './JsonFormatter';
function mount(text = '{"a":1}') {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  const onEdit = vi.fn(); const onMinifiedChange = vi.fn();
  render(<JsonFormatter document={{ nodeId: 'test', text, jsonPath: '$.a', revision: 1, updatedAt: 1 }} disabled={false} minified={false} onEdit={onEdit} onMinifiedChange={onMinifiedChange} />);
  return { onEdit, onMinifiedChange };
}
describe('合并 JSON 编辑器', () => {
  it('工具栏打开 Monaco 原生查找替换面板', () => { mount(); fireEvent.click(screen.getByRole('button', { name: '搜索替换' })); expect(live.trigger).toHaveBeenCalledWith('toolbar', 'editor.action.startFindReplaceAction', null); });
  it('格式化直接更新原始文档', () => { const { onEdit } = mount(); fireEvent.click(screen.getByRole('button', { name: '格式化' })); expect(onEdit).toHaveBeenCalledWith('{\n  "a": 1\n}', '$.a'); });
  it('无效 JSON 格式化失败不覆盖草稿或切换压缩偏好', () => { const { onEdit, onMinifiedChange } = mount('{bad'); fireEvent.click(screen.getByRole('checkbox', { name: '压缩' })); expect(onEdit).not.toHaveBeenCalled(); expect(onMinifiedChange).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('内容未修改'); });
});

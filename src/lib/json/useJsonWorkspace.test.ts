import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createNode, deleteNode, listNodes, readDocument, saveDocument } from './jsonWorkspaceDb';
import { useJsonWorkspace } from './useJsonWorkspace';
beforeEach(async () => { localStorage.clear(); for (const n of await listNodes()) if (n.parentId === 'root') await deleteNode(n.id); });
it('自动保存未完成草稿并在切换文件前完成最后一次编辑', async () => {
  const a = await createNode('json', 'root', 'a'); const b = await createNode('json', 'root', 'b');
  const hook = renderHook(() => useJsonWorkspace()); await waitFor(() => expect(hook.result.current.doc).toBeDefined());
  await act(async () => { await hook.result.current.select(a); });
  act(() => hook.result.current.edit('{draft', '$.a'));
  await act(async () => { await hook.result.current.select(b); });
  expect((await readDocument(a))?.text).toBe('{draft'); expect(hook.result.current.doc?.nodeId).toBe(b); hook.unmount();
});
it('冲突时拒绝离开且保留本地草稿', async () => {
  const id = await createNode('json', 'root', 'a'); const hook = renderHook(() => useJsonWorkspace()); await waitFor(() => expect(hook.result.current.doc?.nodeId).toBe(id));
  const old = (await readDocument(id))!; await saveDocument({ ...old, text: '{"external":1}' });
  act(() => hook.result.current.edit('{local', ''));
  let allowed = true; await act(async () => { allowed = await hook.result.current.flush(); });
  expect(allowed).toBe(false); expect(hook.result.current.doc?.text).toBe('{local'); expect(hook.result.current.status).toBe('存在冲突'); hook.unmount();
});
it('正文和属性快速交替修改后切换文件，二者均保存且不串文件', async () => {
  const a = await createNode('json', 'root', 'a'); const b = await createNode('json', 'root', 'b');
  const hook = renderHook(() => useJsonWorkspace()); await waitFor(() => expect(hook.result.current.doc).toBeDefined());
  await act(async () => { await hook.result.current.select(a); });
  const properties = [{ id: 'p', key: '备注', value: '未完成草稿' }];
  act(() => { hook.result.current.edit('{draft', ''); hook.result.current.editProperties(properties); hook.result.current.edit('{latest', ''); });
  await act(async () => { await hook.result.current.select(b); });
  expect((await readDocument(a))?.properties).toEqual(properties); expect((await readDocument(a))?.text).toBe('{latest'); expect(hook.result.current.doc?.properties).toEqual([]); hook.unmount();
});

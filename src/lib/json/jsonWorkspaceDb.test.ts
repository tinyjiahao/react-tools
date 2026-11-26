import { embeddedCandidates } from './embeddedJson';
// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readEmbeddedDraft, writeEmbeddedDraft, createNode, changeNode, deleteNode, exportWorkspace, importWorkspace, listNodes, readDocument, saveDocument } from './jsonWorkspaceDb';
beforeEach(async () => { for (const n of await listNodes()) if (n.parentId === 'root') await deleteNode(n.id); });
describe('JSON 工作区事务', () => {
  it('保存非法 JSON 草稿且拒绝旧版本覆盖', async () => { const id = await createNode('json', 'root', '草稿'); const doc = (await readDocument(id))!; await saveDocument({ ...doc, text: '{invalid' }); await expect(saveDocument({ ...doc, text: 'null' })).rejects.toThrow('冲突'); expect((await readDocument(id))?.text).toBe('{invalid'); });
  it('禁止循环移动且失败不改变目录', async () => { const a = await createNode('folder', 'root', 'A'); const b = await createNode('folder', a, 'B'); await expect(changeNode(a, { parentId: b })).rejects.toThrow('循环'); expect((await listNodes()).find(n => n.id === a)?.parentId).toBe('root'); });
  it('原子递归删除，晚到的保存不能复活文件', async () => { const a = await createNode('folder', 'root', 'A'); const id = await createNode('json', a, '草稿'); const doc = (await readDocument(id))!; await deleteNode(a); await expect(saveDocument(doc)).rejects.toThrow('冲突'); expect(await listNodes()).toEqual([]); expect(await readDocument(id)).toBeUndefined(); });
  it('备份合并使用新 ID，缺失正文拒绝整个导入', async () => { await createNode('json', 'root', '草稿', '{"a":1}'); const backup = await exportWorkspace(); await importWorkspace(backup); const restored = await exportWorkspace(); expect(restored.documents).toHaveLength(2); expect(new Set(restored.documents.map(d => d.nodeId)).size).toBe(2); await expect(importWorkspace({ ...backup, documents: [] })).rejects.toThrow('缺失'); expect((await exportWorkspace()).nodes).toHaveLength(3); });
  it('同级重名自动递增，重命名冲突不覆盖', async () => { const a = await createNode('json', 'root', 'a'); const b = await createNode('json', 'root', 'a'); expect((await listNodes()).find(n => n.id === b)?.name).toBe('a (1).json'); await expect(changeNode(b, { name: 'a' })).rejects.toThrow('重复'); expect(await readDocument(a)).toBeDefined(); });
});
it('属性随文件移动并通过新版备份恢复，旧备份补空属性', async () => {
  const properties = [{ id: 'p1', key: '标签', value: '第一行\n第二行' }, { id: 'p2', key: '标签', value: '' }];
  const id = await createNode('json', 'root', 'a', '{}', properties);
  const folder = await createNode('folder', 'root', 'folder');
  await changeNode(id, { parentId: folder, name: 'b' });
  expect((await readDocument(id))?.properties).toEqual(properties);
  const backup = await exportWorkspace(); expect(backup.schemaVersion).toBe(2);
  await importWorkspace(backup);
  expect((await exportWorkspace()).documents.every(d => JSON.stringify(d.properties) === JSON.stringify(properties))).toBe(true);
  await importWorkspace({ ...backup, schemaVersion: 1, documents: backup.documents.map(({ properties: _properties, ...doc }) => doc) });
  const all = await exportWorkspace(); const legacy = all.documents.find(d => !d.properties)!;
  expect((await readDocument(legacy.nodeId))?.properties).toEqual([]);
});
it('拒绝重复属性 ID 和超限数据，不覆盖已保存正文', async () => {
  const id = await createNode('json', 'root', 'a'); const doc = (await readDocument(id))!;
  await expect(saveDocument({ ...doc, properties: [{ id: 'x', key: '', value: '' }, { id: 'x', key: '', value: '' }] })).rejects.toThrow('属性');
  await expect(saveDocument({ ...doc, properties: [{ id: 'x', key: '', value: 'a'.repeat(5 * 1024 * 1024) }] })).rejects.toThrow('5 MiB');
  expect((await readDocument(id))?.revision).toBe(doc.revision);
});

it('内层草稿独立保存，恢复非法编辑文本，不混入正文与备份', async () => {
  const baseline = '{"content":"{}"}'; const id = await createNode('json', 'root', '内层草稿', baseline);
  const target = embeddedCandidates(baseline)[0];
  const draft = { nodeId: id, baseline, updatedAt: Date.now(), layers: [{ id: 'layer', parent: baseline, target, text: '{bad', initial: '{}' }] };
  await writeEmbeddedDraft(id, draft); expect(await readEmbeddedDraft(id)).toEqual(draft);
  expect((await readDocument(id))?.text).toBe(baseline);
  expect(JSON.stringify(await exportWorkspace())).not.toContain('{bad');
  await writeEmbeddedDraft(id); expect(await readEmbeddedDraft(id)).toBeUndefined();
});

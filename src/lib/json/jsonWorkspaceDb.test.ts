// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, changeNode, deleteNode, exportWorkspace, importWorkspace, listNodes, readDocument, saveDocument } from './jsonWorkspaceDb';
beforeEach(async () => { for (const n of await listNodes()) if (n.parentId === 'root') await deleteNode(n.id); });
describe('JSON 工作区事务', () => {
  it('保存非法 JSON 草稿且拒绝旧版本覆盖', async () => { const id = await createNode('json', 'root', '草稿'); const doc = (await readDocument(id))!; await saveDocument({ ...doc, text: '{invalid' }); await expect(saveDocument({ ...doc, text: 'null' })).rejects.toThrow('冲突'); expect((await readDocument(id))?.text).toBe('{invalid'); });
  it('禁止循环移动且失败不改变目录', async () => { const a = await createNode('folder', 'root', 'A'); const b = await createNode('folder', a, 'B'); await expect(changeNode(a, { parentId: b })).rejects.toThrow('循环'); expect((await listNodes()).find(n => n.id === a)?.parentId).toBe('root'); });
  it('原子递归删除，晚到的保存不能复活文件', async () => { const a = await createNode('folder', 'root', 'A'); const id = await createNode('json', a, '草稿'); const doc = (await readDocument(id))!; await deleteNode(a); await expect(saveDocument(doc)).rejects.toThrow('冲突'); expect(await listNodes()).toEqual([]); expect(await readDocument(id)).toBeUndefined(); });
  it('备份合并使用新 ID，缺失正文拒绝整个导入', async () => { await createNode('json', 'root', '草稿', '{"a":1}'); const backup = await exportWorkspace(); await importWorkspace(backup); const restored = await exportWorkspace(); expect(restored.documents).toHaveLength(2); expect(new Set(restored.documents.map(d => d.nodeId)).size).toBe(2); await expect(importWorkspace({ ...backup, documents: [] })).rejects.toThrow('缺失'); expect((await exportWorkspace()).nodes).toHaveLength(3); });
  it('同级重名自动递增，重命名冲突不覆盖', async () => { const a = await createNode('json', 'root', 'a'); const b = await createNode('json', 'root', 'a'); expect((await listNodes()).find(n => n.id === b)?.name).toBe('a (1).json'); await expect(changeNode(b, { name: 'a' })).rejects.toThrow('重复'); expect(await readDocument(a)).toBeDefined(); });
});

import type { EmbeddedDraft } from './embeddedJson';
import { validateEmbeddedDraft } from './embeddedJson';
export interface JsonFileProperty { id: string; key: string; value: string }
export interface WorkspaceNode { id: string; parentId: string; kind: 'folder' | 'json'; name: string; createdAt: number; updatedAt: number }
export interface WorkspaceDocument { nodeId: string; properties?: JsonFileProperty[]; text: string; jsonPath: string; revision: number; updatedAt: number }
export interface WorkspaceBackup { format: 'react-tools-json'; schemaVersion: 1 | 2; exportedAt: number; nodes: WorkspaceNode[]; documents: WorkspaceDocument[] }
const MAX_BYTES = 5 * 1024 * 1024;
let connection: Promise<IDBDatabase> | undefined;
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function open(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('react-tools-json-workspace', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('nodes')) { const n = r.result.createObjectStore('nodes', { keyPath: 'id' }); n.createIndex('parentId', 'parentId'); n.createIndex('name', ['parentId', 'name'], { unique: true }); r.result.createObjectStore('documents', { keyPath: 'nodeId' }); }
      if (!r.result.objectStoreNames.contains('embeddedDrafts')) r.result.createObjectStore('embeddedDrafts', { keyPath: 'nodeId' });
    };
    r.onerror = () => { connection = undefined; reject(r.error); };
    r.onblocked = () => { connection = undefined; reject(new Error('数据库升级被阻塞，请关闭其他标签页后重试')); };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); connection = undefined; }; resolve(r.result); };
  });
  return connection;
}
async function transaction<T>(mode: IDBTransactionMode, run: (n: IDBObjectStore, d: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open(); const tx = db.transaction(['nodes', 'documents'], mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('保存失败')); tx.onerror = () => {}; });
  try { const value = await run(tx.objectStore('nodes'), tx.objectStore('documents')); await done; return value; }
  catch (e) { try { tx.abort(); } catch { /* 事务可能已结束 */ } await done.catch(() => {}); throw e; }
}
export function normalizeName(name: string, kind: WorkspaceNode['kind']): string {
  name = name.trim(); if (!name || /[/\\\x00-\x1f]/.test(name)) throw new Error('名称不能为空或包含斜杠、控制字符');
  if (kind === 'json' && !name.endsWith('.json')) name += '.json';
  if (name.length > 100) throw new Error('名称最多 100 个字符'); return name;
}
export function validateWorkspace(nodes: WorkspaceNode[], documents: WorkspaceDocument[]) {
  if (nodes.length > 2000) throw new Error('最多支持 2000 个节点');
  const map = new Map(nodes.map(n => [n.id, n])); const names = new Set<string>();
  if (map.size !== nodes.length) throw new Error('节点 ID 重复');
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || n.id === 'root' || !['json', 'folder'].includes(n.kind) || typeof n.name !== 'string' || normalizeName(n.name, n.kind) !== n.name || !Number.isFinite(n.createdAt) || !Number.isFinite(n.updatedAt)) throw new Error('节点格式错误');
    const key = JSON.stringify([n.parentId, n.name]); if (names.has(key)) throw new Error('同一文件夹内名称不能重复'); names.add(key);
    let parent = n.parentId; const seen = new Set([n.id]); let depth = 1;
    while (parent !== 'root') { const p = map.get(parent); if (!p || p.kind !== 'folder' || seen.has(parent)) throw new Error('目录不存在或存在循环'); seen.add(parent); parent = p.parentId; if (++depth > 20) throw new Error('目录最多 20 层'); }
  }
  const ids = new Set<string>();
  for (const d of documents) {
    if (!d || ids.has(d.nodeId) || map.get(d.nodeId)?.kind !== 'json' || typeof d.text !== 'string' || typeof d.jsonPath !== 'string' || !Number.isSafeInteger(d.revision) || d.revision < 1 || !Number.isFinite(d.updatedAt)) throw new Error('正文记录格式错误');
    validateDocumentContent(d); ids.add(d.nodeId);
  }
  if (nodes.filter(n => n.kind === 'json').length !== ids.size) throw new Error('正文记录缺失');
}
export function listNodes() { return transaction('readonly', n => request<WorkspaceNode[]>(n.getAll())); }
export function readDocument(id: string) { return transaction('readonly', async (_n, d) => { const value = await request<WorkspaceDocument | undefined>(d.get(id)); return value ? { ...value, properties: value.properties ?? [] } : undefined; }); }
export function exportWorkspace(): Promise<WorkspaceBackup> { return transaction('readonly', async (n, d) => ({ format: 'react-tools-json', schemaVersion: 2, exportedAt: Date.now(), nodes: await request(n.getAll()), documents: await request(d.getAll()) })); }
async function mutate(run: (nodes: WorkspaceNode[], docs: WorkspaceDocument[]) => void) {
  await transaction('readwrite', async (n, d) => { const nodes = await request<WorkspaceNode[]>(n.getAll()); const docs = await request<WorkspaceDocument[]>(d.getAll()); run(nodes, docs); validateWorkspace(nodes, docs); await request(n.clear()); await request(d.clear()); for (const node of nodes) n.put(node); for (const doc of docs) d.put(doc); });
}
export async function createNode(kind: WorkspaceNode['kind'], parentId: string, name: string, text = '{}', properties: JsonFileProperty[] = []) {
  const id = crypto.randomUUID(); await mutate((nodes, docs) => { name = normalizeName(name, kind); const base = name; let i = 1; while (nodes.some(n => n.parentId === parentId && n.name === name)) name = kind === 'json' ? `${base.slice(0, -5)} (${i++}).json` : `${base} (${i++})`; nodes.push({ id, kind, parentId, name, createdAt: Date.now(), updatedAt: Date.now() }); if (kind === 'json') docs.push({ nodeId: id, properties, text, jsonPath: '', revision: 1, updatedAt: Date.now() }); }); return id;
}
export async function changeNode(id: string, changes: { name?: string; parentId?: string }) { await mutate(nodes => { const n = nodes.find(n => n.id === id); if (!n) throw new Error('节点已删除'); if (changes.name !== undefined) n.name = normalizeName(changes.name, n.kind); if (changes.parentId !== undefined) n.parentId = changes.parentId; n.updatedAt = Date.now(); }); }
export function descendants(nodes: WorkspaceNode[], id: string) { const ids = new Set([id]); let size; do { size = ids.size; for (const n of nodes) if (ids.has(n.parentId)) ids.add(n.id); } while (size !== ids.size); return ids; }
export async function deleteNode(id: string) { await mutate((nodes, docs) => { const ids = descendants(nodes, id); for (let i = nodes.length - 1; i >= 0; i--) if (ids.has(nodes[i].id)) nodes.splice(i, 1); for (let i = docs.length - 1; i >= 0; i--) if (ids.has(docs[i].nodeId)) docs.splice(i, 1); }); }
export function saveDocument(doc: WorkspaceDocument) { return transaction('readwrite', async (n, d) => { const node = await request(n.get(doc.nodeId)); const previous = await request<WorkspaceDocument | undefined>(d.get(doc.nodeId)); if (!node || !previous || previous.revision !== doc.revision) throw new Error('存在冲突：文件已被其他标签页修改或删除，请加载本地库版本或另存副本'); validateDocumentContent(doc); const saved = { ...doc, revision: doc.revision + 1, updatedAt: Date.now() }; d.put(saved); n.put({ ...node, updatedAt: saved.updatedAt }); return saved; }); }
export async function importWorkspace(value: unknown) {
  const b = value as WorkspaceBackup; if (!b || b.format !== 'react-tools-json' || ![1, 2].includes(b.schemaVersion) || !Array.isArray(b.nodes) || !Array.isArray(b.documents)) throw new Error('不支持的备份格式'); validateWorkspace(b.nodes, b.documents);
  await mutate((nodes, docs) => { const folderId = crypto.randomUUID(); let name = '导入备份'; let i = 1; while (nodes.some(n => n.parentId === 'root' && n.name === name)) name = `导入备份 (${i++})`; nodes.push({ id: folderId, parentId: 'root', kind: 'folder', name, createdAt: Date.now(), updatedAt: Date.now() }); const ids = new Map(b.nodes.map(n => [n.id, crypto.randomUUID()])); for (const n of b.nodes) nodes.push({ ...n, id: ids.get(n.id)!, parentId: n.parentId === 'root' ? folderId : ids.get(n.parentId)! }); for (const d of b.documents) docs.push({ ...d, nodeId: ids.get(d.nodeId)!, revision: 1 }); });
}
export function downloadJson(name: string, text: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function validateDocumentContent(doc: WorkspaceDocument) {
  const properties = doc.properties === undefined ? [] : doc.properties;
  if (!Array.isArray(properties) || properties.some(p => !p || typeof p.id !== 'string' || !p.id || typeof p.key !== 'string' || typeof p.value !== 'string') || new Set(properties.map(p => p.id)).size !== properties.length) throw new Error('文件属性格式错误');
  if (new TextEncoder().encode(doc.text + JSON.stringify(properties)).length > MAX_BYTES || doc.jsonPath.length > 10000) throw new Error('正文与属性合计最多 5 MiB，查询表达式最多 10000 字符');
}
export function downloadRecovery(doc: WorkspaceDocument, name: string) {
  const now = Date.now();
  const backup: WorkspaceBackup = { format: 'react-tools-json', schemaVersion: 2, exportedAt: now, nodes: [{ id: doc.nodeId, name: normalizeName(name, 'json'), kind: 'json', parentId: 'root', createdAt: now, updatedAt: now }], documents: [doc] };
  downloadJson(name + '.backup.json', JSON.stringify(backup, null, 2));
}

export async function readEmbeddedDraft(nodeId: string): Promise<EmbeddedDraft | undefined> {
  const db = await open(); const value = await request<EmbeddedDraft | undefined>(db.transaction('embeddedDrafts').objectStore('embeddedDrafts').get(nodeId));
  if (value) validateEmbeddedDraft(value); return value;
}
export async function writeEmbeddedDraft(nodeId: string, draft?: EmbeddedDraft): Promise<void> {
  if (draft) validateEmbeddedDraft(draft);
  const db = await open(); const tx = db.transaction('embeddedDrafts', 'readwrite');
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('内层草稿保存失败')); tx.onerror = () => {}; });
  const store = tx.objectStore('embeddedDrafts'); if (draft) store.put(draft); else store.delete(nodeId); await done;
}

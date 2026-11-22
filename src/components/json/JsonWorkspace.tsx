import { useEffect, useRef, useState } from 'react';
import JsonFormatter from './JsonFormatter';
import JsonFileTree from './JsonFileTree';
import JsonWorkspaceDialog from './JsonWorkspaceDialog';
import { useJsonWorkspace } from '../../lib/json/useJsonWorkspace';
import { createNode, changeNode, deleteNode, descendants, downloadJson } from '../../lib/json/jsonWorkspaceDb';
import type { WorkspaceNode } from '../../lib/json/jsonWorkspaceDb';
interface Props { darkMode: boolean; registerGuard: (guard: (() => Promise<boolean>) | null) => void }
interface DialogState { title: string; initial: string; folders?: { id: string; name: string }[]; message?: string; submit: (value: string) => Promise<void> }
const JsonWorkspace = ({ darkMode, registerGuard }: Props) => {
  const w = useJsonWorkspace(); const [selected, setSelected] = useState(''); const [dialog, setDialog] = useState<DialogState>(); const files = useRef<HTMLInputElement>(null); const toggle = useRef<HTMLButtonElement>(null); const sidebar = useRef<HTMLElement>(null);
  useEffect(() => { if (!w.preferences.sidebarCollapsed && window.matchMedia('(max-width: 700px)').matches) sidebar.current?.querySelector<HTMLElement>('button')?.focus(); }, [w.preferences.sidebarCollapsed]);
  useEffect(() => { registerGuard(w.flush); return () => registerGuard(null); });
  const active = w.nodes.find(n => n.id === (selected || w.doc?.nodeId)); const parentId = active?.kind === 'folder' ? active.id : active?.parentId || 'root';
  function path(id: string): string { const n = w.nodes.find(n => n.id === id); return n ? `${n.parentId === 'root' ? '' : path(n.parentId) + '/'}${n.name}` : ''; }
  async function changed() { await w.refresh(); w.publish(); }
  async function run(action: () => Promise<void>) { try { await action(); } catch (e) { w.setProblem((e as Error).message); } }
  async function requireSave() { if (!await w.flush()) throw new Error('请先处理未保存的草稿'); }
  function create(kind: WorkspaceNode['kind']) { setDialog({ title: kind === 'folder' ? '新建文件夹' : '新建 JSON', initial: kind === 'folder' ? '新建文件夹' : '未命名.json', submit: async name => { await requireSave(); const id = await createNode(kind, parentId, name); await changed(); setSelected(id); w.setPreferences(p => ({ ...p, expandedIds: [...new Set([...p.expandedIds, parentId])] })); if (kind === 'json') await w.select(id); } }); }
  function action(node: WorkspaceNode, type: 'rename' | 'move' | 'delete') {
    const ids = descendants(w.nodes, node.id);
    if (type === 'rename') setDialog({ title: '重命名', initial: node.name, submit: async name => { await changeNode(node.id, { name }); await changed(); } });
    if (type === 'move') setDialog({ title: '移动到文件夹', initial: node.parentId, folders: [{ id: 'root', name: '根目录' }, ...w.nodes.filter(n => n.kind === 'folder' && !ids.has(n.id)).map(n => ({ id: n.id, name: path(n.id) }))], submit: async parentId => { await requireSave(); await changeNode(node.id, { parentId }); await changed(); } });
    if (type === 'delete') setDialog({ title: '删除确认', initial: '', message: `删除“${node.name}”及其中 ${w.nodes.filter(n => ids.has(n.id) && n.kind === 'json').length} 个 JSON 文件？此操作不可撤销，请先备份。`, submit: async () => { await requireSave(); await deleteNode(node.id); const wasActive = w.doc && ids.has(w.doc.nodeId); const next = w.nodes.find(n => n.kind === 'json' && n.parentId === node.parentId && !ids.has(n.id)); if (wasActive) w.install(undefined); setSelected(''); await changed(); if (wasActive && next) await w.select(next.id); } });
  }
  function closeTree() { w.setPreferences(p => ({ ...p, sidebarCollapsed: true })); toggle.current?.focus(); }
  return <div className={`jw-workspace ${w.preferences.sidebarCollapsed ? 'jw-collapsed' : ''}`}>
    {!w.preferences.sidebarCollapsed && <button className="jw-backdrop" aria-label="关闭文件树" onClick={closeTree} />}
    <aside ref={sidebar} className="jw-sidebar" aria-label="JSON 文件管理" onKeyDown={e => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      if (e.key === 'Escape') closeTree();
      if (e.key === 'Tab') {
        const controls = [...(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary, [tabindex="0"]') || [])].filter(el => el.getClientRects().length);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}><div className="jw-sidebar-title"><strong>本地 JSON</strong></div><div className="jw-actions"><button disabled={w.temporary || w.busy} onClick={() => create('json')}>＋文件</button><button disabled={w.temporary || w.busy} onClick={() => create('folder')}>＋文件夹</button><button onClick={() => { setSelected('root'); }}>根目录</button></div>
      <JsonFileTree nodes={w.nodes} selected={selected || w.doc?.nodeId || ''} expanded={w.preferences.expandedIds} onExpand={expandedIds => w.setPreferences(p => ({ ...p, expandedIds }))} onSelect={node => { setSelected(node.id); if (node.kind === 'json') { void w.select(node.id); if (window.matchMedia('(max-width: 700px)').matches) closeTree(); } }} onAction={action} />
    </aside>
    <section className="jw-main"><button ref={toggle} className="btn-icon jw-tree-toggle" onClick={() => w.setPreferences(p => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed }))} aria-label="切换文件树" aria-expanded={!w.preferences.sidebarCollapsed}>☰</button>
      {w.problem && <div className="jw-problem" role="alert"><span>{w.problem}</span>{w.doc && <button onClick={() => downloadJson(w.nodes.find(n => n.id === w.doc!.nodeId)?.name || '草稿.json', w.doc!.text)}>下载草稿</button>}<button onClick={() => void w.flush()}>重试保存</button><button onClick={() => void run(w.reload)}>加载本地库版本</button>{w.doc && !w.temporary && <button onClick={() => void run(async () => { const id = await createNode('json', 'root', '冲突副本.json', w.doc!.text); w.install(undefined); await changed(); await w.select(id); })}>另存副本</button>}</div>}
      {w.doc ? <JsonFormatter key={`${w.doc.nodeId}:${w.loadVersion}`} darkMode={darkMode} name={w.nodes.find(n => n.id === w.doc!.nodeId)?.name || '临时草稿'} document={w.doc} disabled={w.busy} onEdit={w.edit} minified={w.preferences.isMinified} onMinifiedChange={isMinified => w.setPreferences(p => ({ ...p, isMinified }))} /> : <div className="jw-empty"><h3>创建你的 JSON 工作区</h3><p>用文件夹整理 JSON，编辑内容自动保存在本机。</p><div className="jw-actions"><button className="btn btn-primary" onClick={() => create('json')}>新建 JSON</button><button className="btn btn-secondary" onClick={() => files.current?.click()}>导入 JSON</button></div></div>}
    </section>
    <input hidden ref={files} type="file" accept=".json,application/json" multiple onChange={e => { const values = [...(e.target.files || [])]; e.target.value = ''; void run(async () => { await requireSave(); for (const file of values) { if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过 5 MiB`); await createNode('json', parentId, file.name, await file.text()); await changed(); } }); }} />
    {dialog && <JsonWorkspaceDialog {...dialog} onSubmit={dialog.submit} onClose={() => setDialog(undefined)} />}
  </div>;
};
export default JsonWorkspace;

import { useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';
import StructureWorker from '../../lib/json/jsonStructure.worker?worker';
import { structurePath } from '../../lib/json/jsonStructure';
import type { JsonStructure, JsonStructureNode } from '../../lib/json/jsonStructure';
interface Props { instance: editor.IStandaloneCodeEditor | null; name: string }
function symbol(kind: string) { return ({ object: '{}', array: '[]', string: 'abc', number: '#', boolean: '◐', null: '∅' } as Record<string, string>)[kind] || '·'; }
const JsonBreadcrumbs = ({ instance, name }: Props) => {
  const [structure, setStructure] = useState<JsonStructure>({ nodes: [], incomplete: false });
  const [path, setPath] = useState<number[]>([]); const [pending, setPending] = useState(true);
  const [opened, setOpened] = useState<number | null>(null); const [expanded, setExpanded] = useState<Set<number>>(new Set()); const [limit, setLimit] = useState(200);
  const [focused, setFocused] = useState(0);
  const structureRef = useRef<JsonStructureNode[]>([]); const root = useRef<HTMLDivElement>(null); const popup = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement | null>(null);
  const generation = useRef(0); const jumpSequence = useRef(0);
  useEffect(() => {
    if (!instance) return;
    const worker = new StructureWorker(); let timer: ReturnType<typeof setTimeout>; let disposed = false;
    function cursor() { const model = instance!.getModel(); const pos = instance!.getPosition(); if (model && pos) setPath(structurePath(structureRef.current, model.getOffsetAt(pos))); }
    function schedule() { generation.current++; jumpSequence.current++; setOpened(null); structureRef.current = []; setStructure({ nodes: [], incomplete: false }); setPath([]); setPending(true); clearTimeout(timer); const version = generation.current; timer = setTimeout(() => { worker.postMessage({ version, text: instance!.getModel()?.getValue() || '' }); }, 180); }
    worker.onmessage = (event: MessageEvent<JsonStructure & { version: number }>) => { if (disposed || event.data.version !== generation.current) return; structureRef.current = event.data.nodes; setStructure(event.data); setPending(false); cursor(); };
    worker.onerror = () => { if (!disposed) { setPending(false); setStructure({ nodes: [], incomplete: true }); } };
    const content = instance.onDidChangeModelContent(schedule); const position = instance.onDidChangeCursorPosition(cursor); const model = instance.onDidChangeModel(schedule); schedule();
    return () => { disposed = true; jumpSequence.current++; clearTimeout(timer); content.dispose(); position.dispose(); model.dispose(); worker.terminate(); };
  }, [instance]);
  useEffect(() => { const nav = root.current?.querySelector<HTMLElement>('nav'); const active = root.current?.querySelector<HTMLElement>('[aria-current="location"]'); if (nav && active) { const a = active.getBoundingClientRect(); const n = nav.getBoundingClientRect(); if (a.right > n.right) nav.scrollLeft += a.right - n.right; else if (a.left < n.left) nav.scrollLeft -= n.left - a.left; } }, [path]);
  function close(restore = false) { setOpened(null); if (restore) trigger.current?.focus(); }
  useEffect(() => {
    if (opened === null) return;
    popup.current?.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [opened]);
  async function jump(node: JsonStructureNode) {
    if (!instance) return;
    const model = instance.getModel(); if (!model) return;
    const sequence = ++jumpSequence.current; const version = model.getVersionId();
    const start = model.getPositionAt(node.start); const end = model.getPositionAt(node.end);
    const selection = { selectionStartLineNumber: end.lineNumber, selectionStartColumn: end.column, positionLineNumber: start.lineNumber, positionColumn: start.column };
    close(); instance.setPosition(start);
    // 展开目标所在层级及祖先，避免定位落入不可见折叠区域。
    try { await instance.getAction('editor.unfold')?.run({ direction: 'up', levels: 10000, selectionLines: [start.lineNumber - 1] }); }
    catch { /* 语言服务尚未准备好时仍尝试定位。 */ }
    if (sequence !== jumpSequence.current || instance.getModel() !== model || model.isDisposed() || model.getVersionId() !== version) return;
    instance.setSelection(selection); instance.revealPositionInCenter(start); instance.focus();
  }
  function toggle(id: number) { setExpanded(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  const rows: { node: JsonStructureNode; depth: number }[] = [];
  if (opened !== null && structure.nodes[opened]) {
    const queue = [{ id: opened, depth: 1 }];
    while (queue.length && rows.length <= limit) { const item = queue.pop()!; const node = structure.nodes[item.id]; rows.push({ node, depth: item.depth }); if (expanded.has(item.id)) for (let i = node.children.length - 1; i >= 0; i--) queue.push({ id: node.children[i], depth: item.depth + 1 }); }
  }
  function focusRow(id: number) { setFocused(id); popup.current?.querySelector<HTMLElement>(`[data-structure-id="${id}"]`)?.focus(); }
  return <div className="json-breadcrumbs" ref={root} onKeyDown={e => { if (e.key === 'Escape' && opened !== null) { e.preventDefault(); e.stopPropagation(); close(true); } }}>
    <nav className="json-breadcrumb-path" aria-label="JSON 结构路径">
      {(path.length ? path : [0]).map((id, index) => { const node = structure.nodes[id]; const label = index === 0 ? name : node?.label || '（空属性名）'; return <span className="json-breadcrumb-segment" key={id}>{index > 0 && <span aria-hidden="true">›</span>}<button className="btn-icon" disabled={!node || pending} aria-current={index === path.length - 1 ? 'location' : undefined} aria-expanded={opened === id} aria-haspopup="tree" title={label} onClick={e => { trigger.current = e.currentTarget; if (opened === id) close(); else { setOpened(id); setFocused(id); setExpanded(new Set([id])); setLimit(200); } }}><span className="json-structure-icon" aria-hidden="true">{symbol(node?.kind || 'object')}</span>{label}</button></span>; })}
      {pending ? <span className="json-breadcrumb-note">解析中…</span> : structure.incomplete ? <span className="json-breadcrumb-note">JSON 未完成，显示可解析结构</span> : !structure.nodes.length ? <span className="json-breadcrumb-note">暂无结构</span> : null}
    </nav>
    {opened !== null && <div className="json-structure-popup" ref={popup}>
      <div role="tree" aria-label="JSON 结构树">{rows.slice(0, limit).map(({ node, depth }, index) => <div role="treeitem" aria-level={depth} aria-expanded={node.children.length ? expanded.has(node.id) : undefined} aria-selected={path.includes(node.id)} tabIndex={(rows.some(r => r.node.id === focused) ? focused === node.id : index === 0) ? 0 : -1} key={node.id} data-structure-id={node.id} className="json-structure-row" style={{ paddingLeft: 8 + Math.min(depth - 1, 12) * 16 }} onFocus={() => setFocused(node.id)} onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowDown') focusRow(rows[Math.min(index + 1, Math.min(rows.length, limit) - 1)].node.id);
        if (e.key === 'ArrowUp') focusRow(rows[Math.max(0, index - 1)].node.id);
        if (e.key === 'Home') focusRow(rows[0].node.id); if (e.key === 'End') focusRow(rows[Math.min(rows.length, limit) - 1].node.id);
        if (e.key === 'ArrowRight' && node.children.length) { if (!expanded.has(node.id)) toggle(node.id); else focusRow(node.children[0]); }
        if (e.key === 'ArrowLeft') { if (expanded.has(node.id)) toggle(node.id); else if (node.parent !== null && rows.some(r => r.node.id === node.parent)) focusRow(node.parent); }
        if (e.key === 'Enter') void jump(node); if (e.key === ' ' && node.children.length) toggle(node.id);
      }}><button tabIndex={-1} className="btn-icon json-structure-expand" aria-label={`${expanded.has(node.id) ? '收起' : '展开'} ${node.label}`} disabled={!node.children.length} onClick={() => { toggle(node.id); focusRow(node.id); }}>{node.children.length ? expanded.has(node.id) ? '▾' : '▸' : ' '}</button><button className="btn-icon json-structure-target" tabIndex={-1} onClick={() => void jump(node)} title={`跳转到 ${node.label}`}><span className="json-structure-icon">{symbol(node.kind)}</span><span>{node.id === 0 ? name : node.label || '（空属性名）'}</span><span className="json-structure-value">{node.preview}</span></button></div>)}</div>
      {rows.length > limit && <button className="json-structure-more" onClick={() => setLimit(n => n + 200)}>显示更多节点</button>}
    </div>}
  </div>;
};
export default JsonBreadcrumbs;

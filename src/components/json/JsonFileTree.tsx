import JsonNodeActionMenu from './JsonNodeActionMenu';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceNode } from '../../lib/json/jsonWorkspaceDb';
interface Props { nodes: WorkspaceNode[]; selected: string; expanded: string[]; onExpand: (ids: string[]) => void; onSelect: (node: WorkspaceNode) => void; layoutKey?: string; onAction: (node: WorkspaceNode, action: 'rename' | 'move' | 'delete') => void }
const JsonFileTree = ({ nodes, selected, expanded, onExpand, onSelect, onAction, layoutKey }: Props) => {
  const [menu, setMenu] = useState<{ node: WorkspaceNode; anchor: HTMLButtonElement }>();
  const [search, setSearch] = useState(''); const [focus, setFocus] = useState(''); const tree = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenu(undefined); }, [search, layoutKey, expanded]);
  useEffect(() => { if (menu && !nodes.some(n => n.id === menu.node.id)) setMenu(undefined); }, [nodes, menu]);
  const matches = new Set<string>();
  if (search) for (const n of nodes) if (n.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) { let item: WorkspaceNode | undefined = n; while (item) { matches.add(item.id); item = nodes.find(p => p.id === item!.parentId); } }
  const rows: { node: WorkspaceNode; level: number }[] = [];
  function visit(parent: string, level: number) { for (const node of nodes.filter(n => n.parentId === parent).sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))) { if (search && !matches.has(node.id)) continue; rows.push({ node, level }); if (node.kind === 'folder' && (search || expanded.includes(node.id))) visit(node.id, level + 1); } }
  visit('root', 1);
  function toggle(id: string) { onExpand(expanded.includes(id) ? expanded.filter(x => x !== id) : [...expanded, id]); }
  function focusRow(id: string) { setFocus(id); tree.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`)?.focus(); }
  return <><input className="jw-search" aria-label="搜索文件名称" placeholder="搜索文件名称" value={search} onChange={e => setSearch(e.target.value)} /><div className="jw-tree" role="tree" aria-label="JSON工具文件" ref={tree}>
    {rows.map(({ node, level }, index) => <div key={node.id} role="treeitem" aria-level={level} aria-selected={selected === node.id} aria-expanded={node.kind === 'folder' ? !!search || expanded.includes(node.id) : undefined} tabIndex={(rows.some(r => r.node.id === focus) ? focus === node.id : index === 0) ? 0 : -1} data-node-id={node.id} className={`jw-tree-row ${selected === node.id ? 'selected' : ''}`} style={{ paddingLeft: 8 + (level - 1) * 16 }} onFocus={() => setFocus(node.id)} onClick={() => onSelect(node)} onKeyDown={e => {
      if (e.target !== e.currentTarget) return;
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', 'F2'].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowDown') focusRow(rows[Math.min(index + 1, rows.length - 1)].node.id);
      if (e.key === 'ArrowUp') focusRow(rows[Math.max(index - 1, 0)].node.id);
      if (e.key === 'Home') focusRow(rows[0].node.id); if (e.key === 'End') focusRow(rows[rows.length - 1].node.id);
      if (e.key === 'ArrowRight' && node.kind === 'folder') { if (!expanded.includes(node.id)) toggle(node.id); else if (rows[index + 1]?.level > level) focusRow(rows[index + 1].node.id); }
      if (e.key === 'ArrowLeft') { if (expanded.includes(node.id)) toggle(node.id); else if (node.parentId !== 'root') focusRow(node.parentId); }
      if (e.key === 'Enter') { onSelect(node); if (node.kind === 'folder') toggle(node.id); } if (e.key === 'F2') onAction(node, 'rename');
    }}><button className="btn-icon jw-chevron" tabIndex={-1} aria-label={node.kind === 'folder' ? '展开或收起' : '打开 JSON'} onClick={e => { e.stopPropagation(); if (node.kind === 'folder') toggle(node.id); else onSelect(node); }}>{node.kind === 'folder' ? (search || expanded.includes(node.id) ? '▾' : '▸') : '{}'}</button><span className="jw-node-name" title={node.name}>{node.name}</span><button className="btn-icon jw-node-menu-trigger" aria-label={`${node.name} 操作`} aria-haspopup="menu" aria-expanded={menu?.node.id === node.id} aria-controls={menu?.node.id === node.id ? 'json-node-actions' : undefined} onClick={e => { e.stopPropagation(); setMenu(menu?.node.id === node.id ? undefined : { node, anchor: e.currentTarget }); }}>⋯</button></div>)}
    {!rows.length && <p className="jw-hint">{search ? '没有匹配的文件' : '暂无文件，创建 JSON 或导入文件开始使用。'}</p>}
  </div>{menu && <JsonNodeActionMenu node={menu.node} anchor={menu.anchor} onClose={() => setMenu(undefined)} onAction={action => onAction(menu.node, action)} />}</>;
};
export default JsonFileTree;

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkspaceNode } from '../../lib/json/jsonWorkspaceDb';
interface Props { node: WorkspaceNode; anchor: HTMLButtonElement; onClose: () => void; onAction: (action: 'rename' | 'move' | 'delete') => void }
const JsonNodeActionMenu = ({ node, anchor, onClose, onAction }: Props) => {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useLayoutEffect(() => {
    const box = anchor.getBoundingClientRect(); const popup = menu.current!;
    setPosition({ left: Math.max(8, Math.min(window.innerWidth - popup.offsetWidth - 8, box.right - popup.offsetWidth)), top: Math.max(8, box.bottom + popup.offsetHeight + 8 > window.innerHeight ? box.top - popup.offsetHeight : box.bottom) });
    popup.querySelector<HTMLButtonElement>('button')?.focus();
    const close = () => closeRef.current();
    const outside = (e: PointerEvent) => { if (!popup.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); };
    const scroll = (e: Event) => { if (!popup.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close); };
  }, [anchor]);
  return createPortal(<div ref={menu} id="json-node-actions" className="jw-popup-menu" role="menu" aria-label={`${node.name} 操作`} style={position} onKeyDown={e => {
    e.stopPropagation();
    const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); anchor.focus(); }
    if (e.key === 'Tab') { onClose(); anchor.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); buttons[e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowDown' ? 1 : 2)) % 3].focus(); }
  }}>{(['rename', 'move', 'delete'] as const).map((action, i) => <button key={action} role="menuitem" className={action === 'delete' ? 'danger' : ''} onClick={() => { onClose(); anchor.focus(); onAction(action); }}>{['重命名', '移动到', '删除'][i]}</button>)}</div>, document.body);
};
export default JsonNodeActionMenu;

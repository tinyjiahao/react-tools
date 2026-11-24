import Icon from '../common/Icon';
import { useEffect, useRef } from 'react';
import type { JsonFileProperty } from '../../lib/json/jsonWorkspaceDb';
interface Props { name: string; properties: JsonFileProperty[]; status: string; problem: string; disabled: boolean; modal: boolean; onChange: (properties: JsonFileProperty[]) => void; onClose: () => void; onRetry: () => void }
const JsonFilePropertiesDrawer = ({ name, properties, status, problem, disabled, modal, onChange, onClose, onRetry }: Props) => {
  const panel = useRef<HTMLElement>(null); const pendingFocus = useRef(false);
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  useEffect(() => { if (pendingFocus.current) { panel.current?.querySelectorAll<HTMLInputElement>('input')[properties.length - 1]?.focus(); pendingFocus.current = false; } }, [properties.length]);
  function change(id: string, field: 'key' | 'value', value: string) { onChange(properties.map(p => p.id === id ? { ...p, [field]: value } : p)); }
  return <>{modal && <button className="jw-property-backdrop" aria-label="关闭文件属性" onClick={onClose} />}<aside ref={panel} id="json-file-properties" className="jw-properties" role="dialog" aria-modal={modal || undefined} aria-labelledby="json-properties-title" onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
    if (modal && e.key === 'Tab') { const controls = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')]; const first = controls[0], last = controls[controls.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  }}><header><div><strong id="json-properties-title">文件属性</strong><div className="jw-property-filename" title={name}>{name}</div></div><button className="btn-icon" title="关闭" aria-label="关闭文件属性" onClick={onClose}><Icon name="close" size={16} /></button></header>
    <div className="jw-properties-list">{!properties.length && <p>暂无属性</p>}{properties.map((p, i) => <div className="jw-property-row" key={p.id}><label>Key<input aria-label={`属性 ${i + 1} Key`} disabled={disabled} value={p.key} onChange={e => change(p.id, 'key', e.target.value)} /></label><label>Value<textarea rows={1} aria-label={`属性 ${i + 1} Value`} disabled={disabled} value={p.value} onChange={e => change(p.id, 'value', e.target.value)} /></label><button className="btn-icon jw-property-delete" title="删除属性" aria-label={`删除属性 ${i + 1}`} disabled={disabled} onClick={() => onChange(properties.filter(item => item.id !== p.id))}><Icon name="trash" size={16} /></button></div>)}</div>
    <footer><button className="jw-property-add" disabled={disabled} onClick={() => { pendingFocus.current = true; onChange([...properties, { id: crypto.randomUUID(), key: '', value: '' }]); }}><Icon name="plus" size={14} />添加属性</button><span role="status">{status}</span>{problem && <div role="alert">{problem}<button onClick={onRetry}>重试保存</button></div>}</footer>
  </aside></>;
};
export default JsonFilePropertiesDrawer;

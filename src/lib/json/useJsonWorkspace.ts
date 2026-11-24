import { useEffect, useRef, useState } from 'react';
import { listNodes, readDocument, saveDocument } from './jsonWorkspaceDb';
import type { JsonFileProperty, WorkspaceDocument, WorkspaceNode } from './jsonWorkspaceDb';
import { safeGetJSON, safeSetItem, STORAGE_KEYS } from '../storage';
interface Preferences { sidebarWidth: number; selectedId: string; expandedIds: string[]; sidebarCollapsed: boolean; isMinified: boolean }
export function useJsonWorkspace() {
  const [preferences, setPreferences] = useState<Preferences>(() => { const p = safeGetJSON<Partial<Preferences>>(STORAGE_KEYS.jsonWorkspacePreferences, {}) || {}; return { sidebarWidth: typeof p.sidebarWidth === 'number' && Number.isFinite(p.sidebarWidth) ? Math.max(200, Math.min(480, p.sidebarWidth)) : 240, selectedId: typeof p.selectedId === 'string' ? p.selectedId : '', expandedIds: Array.isArray(p.expandedIds) ? p.expandedIds.filter(x => typeof x === 'string') : [], sidebarCollapsed: p.sidebarCollapsed === true, isMinified: p.isMinified === true }; });
  const [loadVersion, setLoadVersion] = useState(0);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]); const [doc, setDoc] = useState<WorkspaceDocument>(); const [status, setStatus] = useState('加载中'); const [problem, setProblem] = useState(''); const [busy, setBusy] = useState(true); const [temporary, setTemporary] = useState(false);
  const current = useRef<WorkspaceDocument | undefined>(undefined); const dirty = useRef(false); const sequence = useRef(0); const saving = useRef<Promise<boolean> | null>(null); const loadSequence = useRef(0); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const channel = useRef<BroadcastChannel | null>(null); const alive = useRef(true);
  function publish() { channel.current?.postMessage({ type: 'changed' }); }
  async function refresh() { const values = await listNodes(); if (alive.current) setNodes(values); return values; }
  function install(value: WorkspaceDocument | undefined) { setLoadVersion(v => v + 1); current.current = value; dirty.current = false; sequence.current++; setDoc(value); setStatus(value ? '已保存到本机' : '请选择或创建 JSON'); setProblem(''); setPreferences(p => ({ ...p, selectedId: value?.nodeId || '' })); }
  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (saving.current) { if (!await saving.current) return false; return dirty.current ? flush() : true; }
    if (!dirty.current || !current.current) return true;
    if (temporary) { setProblem('临时编辑无法保存，请先下载草稿'); return false; }
    saving.current = (async () => {
      try { while (dirty.current && current.current) { const snapshot = { ...current.current }; const version = sequence.current; setStatus('保存中'); const saved = await saveDocument(snapshot); if (current.current?.nodeId === snapshot.nodeId) { current.current = { ...current.current, revision: saved.revision }; setDoc(current.current); if (sequence.current === version) dirty.current = false; } publish(); } setStatus('已保存到本机'); setProblem(''); return true; }
      catch (e) { setProblem((e as Error).message); setStatus((e as Error).message.includes('冲突') ? '存在冲突' : '保存失败'); return false; }
    })();
    try { return await saving.current; } finally { saving.current = null; }
  }
  function update(changes: Partial<Pick<WorkspaceDocument, 'text' | 'jsonPath' | 'properties'>>) { if (!current.current) return; current.current = { ...current.current, ...changes }; sequence.current++; dirty.current = true; setDoc(current.current); setStatus(temporary ? '临时编辑，刷新会丢失' : '已修改'); clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 500); }
  function edit(text: string, jsonPath: string) { update({ text, jsonPath }); }
  function editProperties(properties: JsonFileProperty[]) { update({ properties }); }
  async function select(id: string) { const ticket = ++loadSequence.current; setBusy(true); try { if (!await flush() || ticket !== loadSequence.current) return false; const value = await readDocument(id); if (ticket === loadSequence.current) { install(value); return true; } return false; } catch (e) { setProblem((e as Error).message); return false; } finally { if (ticket === loadSequence.current) setBusy(false); } }
  async function reload() { if (dirty.current && !window.confirm('放弃当前未保存草稿并加载本地库版本？建议先下载草稿。')) return; const value = current.current ? await readDocument(current.current.nodeId) : undefined; install(value); await refresh(); }
  useEffect(() => { safeSetItem(STORAGE_KEYS.jsonWorkspacePreferences, JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void (async () => { try { const values = await listNodes(); const id = values.find(n => n.id === preferences.selectedId && n.kind === 'json')?.id || values.find(n => n.kind === 'json')?.id; const value = id ? await readDocument(id) : undefined; if (!cancelled) { setNodes(values); install(value); } } catch (e) { if (!cancelled) { setTemporary(true); install({ nodeId: 'temporary', text: '', jsonPath: '', revision: 1, updatedAt: Date.now() }); setStatus('临时编辑，刷新会丢失'); setProblem((e as Error).message); } } finally { if (!cancelled) setBusy(false); } })();
    return () => { cancelled = true; alive.current = false; clearTimeout(timer.current); };
    // 初始化仅恢复一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const interval = setInterval(() => { if (dirty.current) void flushRef.current(); }, 2000);
    const hide = () => { if (document.hidden) void flushRef.current(); };
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('beforeunload', unload);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', hide); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel('react-tools-json-workspace'); channel.current = c;
    c.onmessage = () => { void (async () => { try { await refresh(); const active = current.current; if (!active) return; const latest = await readDocument(active.nodeId); if (current.current?.nodeId !== active.nodeId) return; if (latest?.revision === active.revision) return; if (dirty.current) { setStatus('存在冲突'); setProblem('其他标签页已修改或删除当前文件，请加载本地库版本或另存副本'); } else install(latest); } catch (e) { setProblem((e as Error).message); } })(); };
    return () => { c.close(); channel.current = null; };
  }, []);
  return { nodes, doc, loadVersion, status, problem, setProblem, preferences, setPreferences, busy, temporary, refresh, select, reload, flush, edit, editProperties, publish, install };
}

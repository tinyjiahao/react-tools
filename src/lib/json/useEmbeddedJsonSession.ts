import { useEffect, useRef, useState } from 'react';
import type { EmbeddedCandidate, EmbeddedDraft, EmbeddedLayer } from './embeddedJson';
import { applyEmbedded, formatEmbedded, validateEmbeddedDraft } from './embeddedJson';
import { readEmbeddedDraft, writeEmbeddedDraft, downloadJson } from './jsonWorkspaceDb';
interface Options { nodeId: string; root: string; applyRoot: (text: string) => void; flushRoot: () => Promise<boolean> }
export function useEmbeddedJsonSession({ nodeId, root, applyRoot, flushRoot }: Options) {
  const pendingRoot = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<EmbeddedLayer[]>([]); const [baseline, setBaseline] = useState(root);
  const [recovery, setRecovery] = useState<EmbeddedDraft>(); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const [decision, setDecision] = useState<{ all: boolean; resolve: (ok: boolean) => void }>();
  const latest = useRef({ layers, baseline, root }); latest.current = { layers, baseline, root };
  const [busy, setBusy] = useState(false); const applying = useRef(false);
  const queue = useRef(Promise.resolve()); const alive = useRef(true);
  function persist(draft?: EmbeddedDraft) {
    setStatus('内层草稿保存中');
    const job = queue.current.catch(() => {}).then(() => writeEmbeddedDraft(nodeId, draft)); queue.current = job;
    void job.then(() => { if (alive.current) setStatus(draft ? '内层草稿已保存，尚未应用到文件' : ''); }, e => { if (alive.current) { setStatus('内层草稿保存失败'); setError(String(e.message)); } });
    return job;
  }
  useEffect(() => { alive.current = true; let cancelled = false; void readEmbeddedDraft(nodeId).then(d => { if (!cancelled) { setRecovery(d); setLoading(false); } }, e => { if (!cancelled) { setError(e.message); setLoading(false); } }); return () => { cancelled = true; alive.current = false; }; }, [nodeId]);
  useEffect(() => {
    if (!layers.length) return;
    const save = () => { const current = latest.current; if (current.layers.length && !applying.current) void persist({ nodeId, baseline: current.baseline, layers: current.layers, updatedAt: Date.now() }).catch(() => {}); };
    const timer = setTimeout(save, 500);
    const hide = () => { if (document.visibilityState === 'hidden') save(); };
    const unload = (e: BeforeUnloadEvent) => { if (latest.current.layers.length) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('beforeunload', unload);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('beforeunload', unload); };
  }, [layers, baseline]);
  function open(target: EmbeddedCandidate) {
    try {
      if (loading) throw new Error('正在读取内层草稿，请稍后重试');
      if (recovery) throw new Error('请先恢复或丢弃已有内层草稿');
      if (layers.length >= 8) throw new Error('最多支持 8 层内嵌编辑');
      if (new TextEncoder().encode(target.text).length > 1024 * 1024) throw new Error('单层内容最多 1 MiB');
      const parent = layers.length ? layers[layers.length - 1].text : root;
      const initial = formatEmbedded(target.text); const next = [...layers, { target, parent, text: initial, initial, id: crypto.randomUUID() }];
      const base = layers.length ? baseline : root;
      validateEmbeddedDraft({ nodeId, baseline: base, layers: next, updatedAt: Date.now() });
      setBaseline(base); setLayers(next); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  function edit(text: string) { setError(''); setLayers(current => current.map((l, i) => i === current.length - 1 ? { ...l, text } : l)); }
  async function apply(all = false): Promise<boolean> {
    if (applying.current) return false;
    applying.current = true; setBusy(true);
    try {
      const current = latest.current;
      if (pendingRoot.current !== null && current.root === pendingRoot.current) {
        if (!await flushRoot()) throw new Error('文件保存失败，内层草稿仍保留');
        await persist(); pendingRoot.current = null; setLayers([]); setError(''); return true;
      }
      if (current.root !== current.baseline) throw new Error('根文档已变化，不能应用旧草稿。请复制或下载草稿后重新打开');
      validateEmbeddedDraft({ nodeId, baseline: current.baseline, layers: current.layers, updatedAt: Date.now() });
      const next = [...current.layers];
      do {
        const layer = next.pop(); if (!layer) break;
        const parent = applyEmbedded(layer.parent, layer.target, layer.text);
        if (next.length) next[next.length - 1] = { ...next[next.length - 1], text: parent };
        else {
          pendingRoot.current = parent; applyRoot(parent);
          if (!await flushRoot()) throw new Error('文件保存失败，内层草稿仍保留，请处理保存错误');
        }
      } while (all && next.length);
      if (next.length) await persist({ nodeId, baseline: current.baseline, layers: next, updatedAt: Date.now() }); else await persist();
      pendingRoot.current = null; setLayers(next); setError(''); return true;
    } catch (e) { setError((e as Error).message); return false; } finally { applying.current = false; setBusy(false); }
  }
  async function leave(all = true): Promise<boolean> {
    if (applying.current) return false;
    if (!latest.current.layers.length) return true;
    if (latest.current.layers.every(l => l.text === l.initial)) {
      const next = all ? [] : latest.current.layers.slice(0, -1);
      try { await persist(next.length ? { nodeId, baseline, layers: next, updatedAt: Date.now() } : undefined); setLayers(next); setError(''); return true; } catch { return false; }
    }
    if (decision) return false;
    return new Promise(resolve => setDecision({ all, resolve }));
  }
  async function decide(choice: 'apply' | 'discard' | 'cancel') {
    if (!decision) return;
    let ok = choice !== 'cancel';
    if (choice === 'apply') ok = await apply(decision.all);
    if (choice === 'discard') {
      const next = decision.all ? [] : latest.current.layers.slice(0, -1);
      try { await persist(next.length ? { nodeId, baseline, layers: next, updatedAt: Date.now() } : undefined); setLayers(next); setError(''); } catch { ok = false; }
    }
    decision.resolve(ok); setDecision(undefined);
  }
  return { busy, layers, recovery, error, status, decision, open, edit, apply, leave, decide, setError,
    restore() { if (recovery) { setBaseline(recovery.baseline); setLayers(recovery.layers); setRecovery(undefined); } },
    async discardRecovery() { try { await persist(); setRecovery(undefined); } catch { /* 保留恢复入口 */ } },
    retry() { const current = latest.current; if (current.layers.length) void persist({ nodeId, baseline: current.baseline, layers: current.layers, updatedAt: Date.now() }).catch(() => {}); },
    download() { downloadJson('内嵌JSON草稿.json', JSON.stringify(recovery || { nodeId, baseline, layers, updatedAt: Date.now() }, null, 2)); },
    conflict: layers.length > 0 && root !== baseline && root !== pendingRoot.current };
}

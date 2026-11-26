import type { EscapePreviewSpan } from '../../lib/json/jsonEscapePreview';
import { buildEscapePreview } from '../../lib/json/jsonEscapePreview';
import EmbeddedJsonDecision from './EmbeddedJsonDecision';
import { useEmbeddedJsonSession } from '../../lib/json/useEmbeddedJsonSession';
import EmbeddedWorker from '../../lib/json/embeddedJson.worker?worker';
import { formatEmbedded } from '../../lib/json/embeddedJson';
import type { EmbeddedCandidate } from '../../lib/json/embeddedJson';
import { editor as monacoEditor, Uri } from 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { WorkspaceDocument } from '../../lib/json/jsonWorkspaceDb';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Editor from '@monaco-editor/react';
import MessageToast from '../common/MessageToast';
import Icon from '../common/Icon';
import JsonBreadcrumbs from './JsonBreadcrumbs';

const viewStates = new Map<string, editor.ICodeEditorViewState>();
interface JsonFormatterProps {
  onEmbeddedActive?: (active: boolean) => void;
  registerEmbeddedGuard?: (guard: (() => Promise<boolean>) | null) => void;
  flushRoot?: () => Promise<boolean>;
  propertiesOpen?: boolean;
  onPropertiesToggle?: () => void;
  darkMode?: boolean;
  name?: string;
  document: WorkspaceDocument;
  disabled: boolean;
  onEdit: (text: string, jsonPath: string) => void;
  minified: boolean;
  onMinifiedChange: (value: boolean) => void;
}
const JsonFormatter = ({ onEmbeddedActive, registerEmbeddedGuard, flushRoot, propertiesOpen, onPropertiesToggle, darkMode = false, name = 'JSON 文档', document: doc, disabled, onEdit, minified, onMinifiedChange }: JsonFormatterProps) => {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [error, setError] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const sourcePath = `json-workspace://${doc.nodeId}`;
  const rootPath = sourcePath;
  const session = useEmbeddedJsonSession({ nodeId: doc.nodeId, root: doc.text, applyRoot: value => {
    const model = monacoEditor.getModel(Uri.parse(rootPath));
    if (model) { model.pushStackElement(); model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null); model.pushStackElement(); }
    onEdit(value, doc.jsonPath);
  }, flushRoot: flushRoot || (async () => true) });
  useEffect(() => { onEmbeddedActive?.(session.layers.length > 0 || !!session.recovery); return () => onEmbeddedActive?.(false); }, [session.layers.length, session.recovery, onEmbeddedActive]);
  const layer = session.layers[session.layers.length - 1];
  const text = layer?.text ?? doc.text;
  const currentPath = layer ? `${rootPath}/embedded/${layer.id}` : rootPath;
  const [escapePreview, setEscapePreview] = useState<{ path: string; source: string; value: string; spans: EscapePreviewSpan[] }>();
  const sourceView = useRef<editor.ICodeEditorViewState | null>(null);
  const previewView = useRef<{ path: string; source: string; state: editor.ICodeEditorViewState | null } | undefined>(undefined);
  const initialPreviewScroll = useRef({ scrollTop: 0, scrollLeft: 0 });
  const previewContainer = useRef<HTMLDivElement>(null);
  const previewDecorations = useRef<editor.IEditorDecorationsCollection | null>(null);
  const previewRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const showPreview = escapePreview?.path === currentPath && escapePreview.source === text;
  useEffect(() => { if (escapePreview && !showPreview) setEscapePreview(undefined); }, [text, currentPath, showPreview, escapePreview]);
  const displayedText = showPreview ? escapePreview.value : text;
  useLayoutEffect(() => {
    if (!showPreview) return;
    const e = previewRef.current; if (!e) return;
    e.layout(); const saved = previewView.current;
    if (saved?.path === currentPath && saved.source === text && saved.state) e.restoreViewState(saved.state);
    else e.setScrollPosition(initialPreviewScroll.current);
  }, [showPreview, currentPath, text]);
  useEffect(() => () => {
    const e = previewRef.current; const model = e?.getModel();
    previewDecorations.current?.clear(); e?.dispose(); model?.dispose(); previewRef.current = null;
  }, [rootPath]);

  function toggleEscapes(keep: boolean) {
    if (keep) {
      previewView.current = { path: currentPath, source: text, state: previewRef.current?.saveViewState() ?? null };
      setEscapePreview(undefined); setError('');
      requestAnimationFrame(() => { const e = editorRef.current; e?.layout(); if (sourceView.current) e?.restoreViewState(sourceView.current); });
      return;
    }
    try { const preview = buildEscapePreview(text);
      if (!previewContainer.current) return;
      if (!previewRef.current) {
        const model = monacoEditor.createModel('', 'plaintext', Uri.parse(`${rootPath}/escape-preview`));
        previewRef.current = monacoEditor.create(previewContainer.current, { model, readOnly: true, automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', fontSize: 14, lineNumbersMinChars: 3, folding: true, scrollBeyondLastLine: false, scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 8 } });
        previewDecorations.current = previewRef.current.createDecorationsCollection();
      }
      const model = previewRef.current.getModel()!;
      if (model.getValue() !== preview.text) model.setValue(preview.text);
      previewDecorations.current?.set(preview.spans.map(span => {
        const start = model.getPositionAt(span.start); const end = model.getPositionAt(span.end);
        return { range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }, options: { inlineClassName: `json-preview-${span.kind}` } };
      }));
      sourceView.current = editorRef.current?.saveViewState() ?? null;
      initialPreviewScroll.current = { scrollTop: editorRef.current?.getScrollTop() ?? 0, scrollLeft: editorRef.current?.getScrollLeft() ?? 0 };
      setEscapePreview({ path: currentPath, source: text, value: preview.text, spans: preview.spans }); setCandidates(null); setError(''); }
    catch (e) { setError('无法预览，请先修复 JSON：' + (e as Error).message); }
  }
  const [candidates, setCandidates] = useState<EmbeddedCandidate[] | null>(null);
  const [filter, setFilter] = useState('');
  const picker = useRef<HTMLDivElement>(null);
  const previousLayers = useRef(session.layers);
  useEffect(() => {
    const previous = previousLayers.current; previousLayers.current = session.layers;
    if (previous.length <= session.layers.length) return;
    const target = previous[session.layers.length]?.target;
    const frame = requestAnimationFrame(() => { const e = editorRef.current; const model = e?.getModel(); if (!e || !model || model.uri.toString() !== Uri.parse(currentPath).toString() || !target) return; const pos = model.getPositionAt(target.start); e.setPosition(pos); e.revealPositionInCenter(pos); e.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [currentPath, session.layers]);
  useEffect(() => { if (!candidates) return; const outside = (e: PointerEvent) => { if (!picker.current?.contains(e.target as Node)) setCandidates(null); }; window.document.addEventListener('pointerdown', outside); return () => window.document.removeEventListener('pointerdown', outside); }, [candidates]);
  const knownModels = useRef(new Set<string>());
  const innerAction = useRef<() => void>(() => {});
  useEffect(() => { registerEmbeddedGuard?.(() => session.leave(true)); return () => registerEmbeddedGuard?.(null); });
  useEffect(() => {
    knownModels.current.add(currentPath);
    const keep = new Set([rootPath, ...session.layers.map(l => `${rootPath}/embedded/${l.id}`)]);
    const timer = setTimeout(() => { for (const uri of knownModels.current) if (!keep.has(uri)) { const model = monacoEditor.getModel(Uri.parse(uri)); if (model && model !== editorRef.current?.getModel()) { model.dispose(); knownModels.current.delete(uri); } } }, 0);
    return () => clearTimeout(timer);
  }, [currentPath, rootPath, session.layers]);
  useEffect(() => () => { for (const uri of knownModels.current) if (uri !== rootPath) monacoEditor.getModel(Uri.parse(uri))?.dispose(); }, [rootPath]);
  const scan = useRef<{ text: string; values: EmbeddedCandidate[]; error?: string }>({ text: '', values: [] });
  const scanVersion = useRef(0);
  const [scanning, setScanning] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => { const worker = new EmbeddedWorker(); workerRef.current = worker; return () => { worker.terminate(); workerRef.current = null; }; }, []);
  useEffect(() => {
    const worker = workerRef.current; if (!worker) return;
    const version = ++scanVersion.current; setScanning(true);
    worker.onmessage = event => { if (event.data.version !== scanVersion.current) return; scan.current = { text, values: event.data.candidates, error: event.data.error }; setScanning(false); };
    worker.onerror = () => { scan.current = { text, values: [], error: '解析失败，请重新编辑后重试' }; setScanning(false); };
    const timer = setTimeout(() => worker.postMessage({ version, text }), 200);
    return () => clearTimeout(timer);
  }, [text]);
  function openEmbedded() {
    try {
      if (showPreview) throw new Error('请先勾选保留转义，再编辑内嵌 JSON');
      if (scan.current.text !== text || scanning) throw new Error('正在解析当前层，请稍后重试');
      if (scan.current.error) throw new Error(scan.current.error);
      const values = scan.current.values; const instance = editorRef.current;
      const position = instance?.getPosition(); const offset = position ? instance!.getModel()!.getOffsetAt(position) : -1;
      const target = values.find(c => offset >= (c.propertyStart ?? c.start) && offset <= c.start + c.length);
      if (target) session.open(target); else { setCandidates(values); setFilter(''); }
    } catch (e) { session.setError((e as Error).message); }
  }
  innerAction.current = openEmbedded;


  useEffect(() => () => {
    const instance = editorRef.current;
    const state = instance?.saveViewState();
    if (state) { viewStates.delete(doc.nodeId); viewStates.set(doc.nodeId, state); if (viewStates.size > 20) viewStates.delete(viewStates.keys().next().value!); }
    monacoEditor.getModel(Uri.parse(sourcePath))?.dispose();
  }, [doc.nodeId, sourcePath]);

  function replaceDocument(value: string) {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (instance && model) {
      instance.pushUndoStop();
      instance.executeEdits('json-format', [{ range: model.getFullModelRange(), text: value }]);
      instance.pushUndoStop();
    } else onEdit(value, doc.jsonPath);
  }
  function reformat(compact: boolean) {
    try {
      const formatted = formatEmbedded(text, compact);
      replaceDocument(formatted);
      if (!layer) onMinifiedChange(compact);
      setError('');
    } catch (e) { setError('JSON 格式无效，内容未修改：' + (e as Error).message); }
  }
  function openFindReplace() {
    const instance = showPreview ? previewRef.current : editorRef.current;
    if (!instance || disabled) return;
    instance.focus();
    instance.trigger('toolbar', showPreview ? 'actions.find' : 'editor.action.startFindReplaceAction', null);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(displayedText); setShowCopyToast(false); setTimeout(() => setShowCopyToast(true), 0); }
    catch { setError('复制失败，请检查浏览器剪贴板权限'); }
  }
  return <div className="json-formatter json-formatter--single">
    <div className="json-content" aria-label="JSON 编辑区">
      <div className="json-panel json-input">
        <div className="panel-header">
          <h3>JSON 编辑器</h3>
          <span className="json-preview-hint" style={{ visibility: showPreview ? 'visible' : 'hidden' }} aria-hidden={!showPreview} role={showPreview ? 'status' : undefined} title="未修改原文，复制结果可能不是合法 JSON。勾选“保留转义”返回编辑。">去转义预览（只读）· 原文未修改</span>
          <div className="panel-actions json-editor-actions" role="group" aria-label="JSON 编辑操作">
            <button className="btn btn-primary" disabled={disabled || session.busy || showPreview} onClick={() => reformat(false)}>格式化</button>
            <label className="format-toggle"><input type="checkbox" checked={layer ? !text.includes("\n") : minified} disabled={disabled || session.busy || showPreview} onChange={e => reformat(e.target.checked)} />压缩</label>
            <label className="format-toggle" title="取消勾选可查看去掉一层转义的只读预览，不修改原文"><input type="checkbox" checked={!showPreview} disabled={disabled || session.busy} onChange={e => toggleEscapes(e.target.checked)} />保留转义</label>
            <button className="btn-icon" title="搜索替换" aria-label="搜索替换" disabled={disabled || !instance} onClick={openFindReplace}><Icon name="search" size={18} /></button>
            <button className="btn-icon" title={showPreview ? "复制去转义预览（可能不是合法 JSON）" : layer ? "复制当前层 JSON" : "复制到剪贴板"} disabled={disabled || !text} onClick={() => void copy()}><Icon name="copy" size={18} /></button>
            <button className="btn-icon" title="内嵌 JSON" aria-label="内嵌 JSON" disabled={disabled || session.busy || scanning || showPreview} onClick={openEmbedded}><Icon name="embedded-json" size={18} /></button>
            <span className="char-count">{displayedText.length} 字符</span>
            <button className="btn-icon jw-properties-toggle" title="文件属性" aria-label="属性" aria-expanded={!!propertiesOpen} aria-controls="json-file-properties" disabled={disabled || session.busy} onClick={onPropertiesToggle}><Icon name="properties" size={18} /></button>
          </div>
        </div>
        {session.recovery && <div className="embedded-bar" role="status">发现未应用的内层草稿<button onClick={session.restore}>恢复草稿</button><button onClick={() => void session.discardRecovery()}>丢弃草稿</button><button onClick={session.download}>下载草稿</button></div>}
        {layer && <div className="embedded-bar"><span title={session.layers.map(l => l.target.label).join(' > ')}>{name} › {session.layers.map(l => l.target.label).join(' › ')}（字符串内 JSON）</span><button onClick={() => void session.leave(false)}>返回上层</button><button disabled={session.conflict || session.busy} onClick={() => void session.apply()}>应用到上层</button><button onClick={session.download}>下载草稿</button><small>{session.status || '内层草稿尚未应用到文件'}</small>{session.status.includes('失败') && <button onClick={session.retry}>重试保存草稿</button>}</div>}
        {(session.error || session.conflict) && <div className="error-message" role="alert">{session.error || '根文档已变化，请下载内层草稿后重新打开'}</div>}
        {candidates && <div ref={picker} className="embedded-picker" role="dialog" aria-label="选择内嵌 JSON" onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('input,button')]; const i = controls.indexOf(window.document.activeElement as HTMLElement); controls[(i + (e.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length]?.focus(); } if (e.key === 'Escape') { e.stopPropagation(); setCandidates(null); editorRef.current?.focus(); } }}><input autoFocus aria-label="筛选字段路径" placeholder="筛选字段路径" value={filter} onChange={e => setFilter(e.target.value)} /><button onClick={() => setCandidates(null)}>关闭</button>{!candidates.length && <p>当前层没有可展开的 JSON 字符串</p>}{candidates.filter(c => c.label.includes(filter)).map(c => <button key={c.start} onClick={() => { session.open(c); setCandidates(null); }}>{c.label} · {c.text.trim().startsWith('[') ? '数组' : '对象'} · {c.text.slice(0, 80)}</button>)}</div>}
        {session.decision && <EmbeddedJsonDecision busy={session.busy} onChoose={choice => void session.decide(choice)} />}
        <div inert={showPreview} style={{ flexShrink: 0 }}><JsonBreadcrumbs instance={instance} name={layer ? layer.target.label : name} /></div>
        <div className="panel-body json-editor-body">
          <div ref={previewContainer} aria-label="去转义预览" style={{ height: '100%', display: showPreview ? 'block' : 'none' }} />
          <div style={{ height: '100%', display: showPreview ? 'none' : 'block' }}>
          <Editor height="100%" path={currentPath} defaultLanguage="json" value={text} keepCurrentModel saveViewState
            onChange={value => {
              // 仅接收当前文档 model 的编辑事件。
              const model = editorRef.current?.getModel();
              if (!disabled && model?.uri.toString() === Uri.parse(currentPath).toString() && model.getValue() === value) { if (layer) session.edit(value ?? ''); else onEdit(value ?? '', doc.jsonPath); setError(''); }
            }}
            onMount={instance => { instance.addAction({ id: 'embedded-json.open', label: '编辑内嵌 JSON', contextMenuGroupId: 'navigation', run: () => innerAction.current() }); editorRef.current = instance; setInstance(instance); const state = viewStates.get(doc.nodeId); if (state) instance.restoreViewState(state); if (!window.matchMedia('(max-width: 700px)').matches || window.document.querySelector('.jw-collapsed')) instance.focus(); }}
            options={{ readOnly: disabled || session.busy, automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', fontSize: 14, lineNumbersMinChars: 3, folding: true, scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 8 } }} theme={darkMode ? 'vs-dark' : 'vs'} />
          </div>
          {error && <div className="error-message" role="alert"><Icon name="warning" size={18} />{error}</div>}
        </div>
      </div>
    </div>
    <MessageToast show={showCopyToast} message="复制成功！" />
  </div>;
};
export default JsonFormatter;

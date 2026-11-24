import { editor as monacoEditor, Uri } from 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { WorkspaceDocument } from '../../lib/json/jsonWorkspaceDb';
import { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import MessageToast from '../common/MessageToast';
import Icon from '../common/Icon';
import JsonBreadcrumbs from './JsonBreadcrumbs';

const viewStates = new Map<string, editor.ICodeEditorViewState>();
interface JsonFormatterProps {
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
const JsonFormatter = ({ propertiesOpen, onPropertiesToggle, darkMode = false, name = 'JSON 文档', document: doc, disabled, onEdit, minified, onMinifiedChange }: JsonFormatterProps) => {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [error, setError] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const sourcePath = `json-workspace://${doc.nodeId}`;
  const text = doc.text;

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
      const formatted = JSON.stringify(JSON.parse(text), null, compact ? undefined : 2);
      replaceDocument(formatted);
      onMinifiedChange(compact);
      setError('');
    } catch (e) { setError('JSON 格式无效，内容未修改：' + (e as Error).message); }
  }
  function openFindReplace() {
    const instance = editorRef.current;
    if (!instance || disabled) return;
    instance.focus();
    instance.trigger('toolbar', 'editor.action.startFindReplaceAction', null);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setShowCopyToast(false); setTimeout(() => setShowCopyToast(true), 0); }
    catch { setError('复制失败，请检查浏览器剪贴板权限'); }
  }
  return <div className="json-formatter json-formatter--single">
    <div className="json-content" aria-label="JSON 编辑区">
      <div className="json-panel json-input">
        <div className="panel-header">
          <h3>JSON 编辑器</h3>
          <div className="panel-actions json-editor-actions" role="group" aria-label="JSON 编辑操作">
            <button className="btn btn-primary" disabled={disabled} onClick={() => reformat(false)}>格式化</button>
            <label className="format-toggle"><input type="checkbox" checked={minified} disabled={disabled} onChange={e => reformat(e.target.checked)} />压缩</label>
            <button className="btn-icon" title="搜索替换" aria-label="搜索替换" disabled={disabled || !instance} onClick={openFindReplace}><Icon name="search" size={18} /></button>
            <button className="btn-icon" title="复制到剪贴板" disabled={disabled || !text} onClick={() => void copy()}><Icon name="copy" size={18} /></button>
            <span className="char-count">{text.length} 字符</span>
            <button className="btn-icon jw-properties-toggle" title="文件属性" aria-label="属性" aria-expanded={!!propertiesOpen} aria-controls="json-file-properties" disabled={disabled} onClick={onPropertiesToggle}><Icon name="properties" size={18} /></button>
          </div>
        </div>
        <JsonBreadcrumbs instance={instance} name={name} />
        <div className="panel-body json-editor-body">
          <Editor height="100%" path={sourcePath} defaultLanguage="json" value={text} keepCurrentModel saveViewState
            onChange={value => {
              // 仅接收当前文档 model 的编辑事件。
              const model = editorRef.current?.getModel();
              if (!disabled && model?.uri.toString() === Uri.parse(sourcePath).toString() && model.getValue() === value) { onEdit(value ?? '', doc.jsonPath); setError(''); }
            }}
            onMount={instance => { editorRef.current = instance; setInstance(instance); const state = viewStates.get(doc.nodeId); if (state) instance.restoreViewState(state); if (!window.matchMedia('(max-width: 700px)').matches || window.document.querySelector('.jw-collapsed')) instance.focus(); }}
            options={{ readOnly: disabled, automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', fontSize: 14, lineNumbersMinChars: 3, folding: true, scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 8 } }} theme={darkMode ? 'vs-dark' : 'vs'} />
          {error && <div className="error-message" role="alert"><Icon name="warning" size={18} />{error}</div>}
        </div>
      </div>
    </div>
    <MessageToast show={showCopyToast} message="复制成功！" />
  </div>;
};
export default JsonFormatter;

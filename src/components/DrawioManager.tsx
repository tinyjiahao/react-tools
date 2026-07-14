import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';
import SettingsDialog from './SettingsDialog';
import type { FileItem } from '../lib/types';
import { callWorkerApi, uploadWithProgress } from '../lib/r2Api';
import { safeGetConfig, safeSetItem, STORAGE_KEYS } from '../lib/storage';

interface Diagram {
  id: string;
  title: string;
  xml: string;
  createdAt: string;
  updatedAt: string;
}

interface DrawioMessage {
  event?: string;
  xml?: string;
  data?: string;
  modified?: boolean;
}

type ExportIntent = 'save' | 'download';

const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
const DRAWIO_URL = `${DRAWIO_ORIGIN}/?proto=json&spin=1&libraries=1&noExitBtn=1`;
const EMPTY_DIAGRAM = '<mxfile host="embed.diagrams.net"><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function parseMessage(data: unknown): DrawioMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as DrawioMessage;
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object' ? data as DrawioMessage : null;
}

function downloadDiagramFile(diagram: Diagram): void {
  const url = URL.createObjectURL(new Blob([diagram.xml], { type: 'application/xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${diagram.title || '未命名图表'}.drawio`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const DrawioManager = () => {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [selectedDiagram, setSelectedDiagram] = useState<Diagram | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [error, setError] = useState('');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    localStorage.getItem(STORAGE_KEYS.drawioSidebarCollapsed) === 'true'
  ));

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef<Diagram | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<Diagram | null>(null);
  const exportIntentRef = useRef<ExportIntent | null>(null);

  const updateSelectedDiagram = useCallback((diagram: Diagram | null) => {
    selectedRef.current = diagram;
    setSelectedDiagram(diagram);
  }, []);

  const notify = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowToast(false);
    setToastMessage(message);
    window.setTimeout(() => setShowToast(true), 0);
    toastTimerRef.current = setTimeout(() => setShowToast(false), 3000);
  }, []);

  const saveDiagram = useCallback(async (diagram: Diagram, showFeedback = false) => {
    const config = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!config?.workerUrl) {
      setError('未配置 R2 存储信息，请在设置中完成配置');
      return;
    }

    if (isSavingRef.current) {
      pendingSaveRef.current = diagram;
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    try {
      const updatedDiagram = { ...diagram, updatedAt: new Date().toISOString() };
      const content = JSON.stringify({
        title: updatedDiagram.title,
        xml: updatedDiagram.xml,
        createdAt: updatedDiagram.createdAt,
        updatedAt: updatedDiagram.updatedAt,
      });
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([content], { type: 'application/json' }),
        `drawio/${diagram.id}.json`,
      );
      await uploadWithProgress(config, formData);

      setDiagrams(current => current.map(item => (
        item.id === diagram.id ? updatedDiagram : item
      )));
      if (selectedRef.current?.id === diagram.id) {
        selectedRef.current = updatedDiagram;
        setSelectedDiagram(updatedDiagram);
      }
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
        action: 'status',
        messageKey: 'allChangesSaved',
        modified: false,
      }), DRAWIO_ORIGIN);
      if (showFeedback) notify('图表已保存');
    } catch (err) {
      setError(`保存失败: ${(err as Error).message}`);
    } finally {
      isSavingRef.current = false;
      setSaving(false);
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void saveDiagram(pending);
    }
  }, [notify]);

  const scheduleSave = useCallback((diagram: Diagram) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveDiagram(selectedRef.current ?? diagram);
    }, 1200);
  }, [saveDiagram]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (selectedRef.current) void saveDiagram(selectedRef.current);
    }
  }, [saveDiagram]);

  const loadDiagrams = useCallback(async () => {
    const config = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!config?.workerUrl) {
      setError('未配置 R2 存储信息，请在设置中完成配置');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await callWorkerApi('list', config, { prefix: 'drawio/' });
      const files = (result.files as FileItem[] || [])
        .filter(file => file.Key.endsWith('.json'))
        .sort((a, b) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime());
      const loaded = await Promise.all(files.map(async file => {
        try {
          const baseUrl = config.workerUrl.replace(/\/$/, '');
          const response = await fetch(
            `${baseUrl}/file/${encodeURIComponent(file.Key)}?_t=${Date.now()}`,
            { headers: config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {} },
          );
          if (!response.ok) return null;
          const data = await response.json() as Omit<Diagram, 'id'>;
          return {
            id: file.Key.replace('drawio/', '').replace(/\.json$/, ''),
            ...data,
          } as Diagram;
        } catch {
          return null;
        }
      }));
      const nextDiagrams = loaded.filter((item): item is Diagram => item !== null);
      setDiagrams(nextDiagrams);

      const savedId = localStorage.getItem(STORAGE_KEYS.drawioSelectedId);
      const restored = nextDiagrams.find(item => item.id === savedId) ?? null;
      updateSelectedDiagram(restored);
    } catch (err) {
      setError(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [updateSelectedDiagram]);

  useEffect(() => {
    void loadDiagrams();
  }, [loadDiagrams]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.drawioSidebarCollapsed, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (selectedDiagram) {
      safeSetItem(STORAGE_KEYS.drawioSelectedId, selectedDiagram.id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.drawioSelectedId);
    }
  }, [selectedDiagram?.id]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== DRAWIO_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const message = parseMessage(event.data);
      if (!message?.event) return;

      if (message.event === 'init') {
        const current = selectedRef.current;
        if (!current) return;
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
          action: 'load',
          autosave: 1,
          saveAndExit: '0',
          modified: 'unsavedChanges',
          xml: current.xml || EMPTY_DIAGRAM,
          title: `${current.title}.drawio`,
        }), DRAWIO_ORIGIN);
        setEditorReady(true);
        return;
      }

      if ((message.event === 'autosave' || message.event === 'save') && message.xml) {
        const current = selectedRef.current;
        if (!current) return;
        const updated = { ...current, xml: message.xml };
        updateSelectedDiagram(updated);
        setDiagrams(items => items.map(item => item.id === updated.id ? updated : item));
        if (message.event === 'save') {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          void saveDiagram(updated, true);
        } else {
          scheduleSave(updated);
        }
        return;
      }

      if (message.event === 'export' && typeof message.data === 'string') {
        const current = selectedRef.current;
        const intent = exportIntentRef.current;
        exportIntentRef.current = null;
        if (!current) return;
        const updated = { ...current, xml: message.data };
        updateSelectedDiagram(updated);
        if (intent === 'download') {
          downloadDiagramFile(updated);
        } else if (intent === 'save') {
          void saveDiagram(updated, true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [saveDiagram, scheduleSave, updateSelectedDiagram]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', flushSave);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', flushSave);
      flushSave();
    };
  }, [flushSave]);

  const createDiagram = useCallback((title = '新图表', xml = EMPTY_DIAGRAM) => {
    const config = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!config?.workerUrl) {
      setError('未配置 R2 存储信息，请在设置中完成配置');
      setShowSettingsDialog(true);
      return;
    }
    setError('');
    flushSave();
    const now = new Date().toISOString();
    const diagram: Diagram = { id: `${Date.now()}`, title, xml, createdAt: now, updatedAt: now };
    setDiagrams(items => [diagram, ...items]);
    setEditorReady(false);
    updateSelectedDiagram(diagram);
    void saveDiagram(diagram);
    notify('图表已创建');
  }, [flushSave, notify, saveDiagram, updateSelectedDiagram]);

  const selectDiagram = useCallback((diagram: Diagram) => {
    if (diagram.id === selectedRef.current?.id) return;
    flushSave();
    setEditorReady(false);
    updateSelectedDiagram(diagram);
  }, [flushSave, updateSelectedDiagram]);

  const deleteDiagram = useCallback(async (diagram: Diagram) => {
    if (!window.confirm(`确定删除“${diagram.title}”吗？此操作不可撤销。`)) return;
    const config = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!config) return;
    try {
      await callWorkerApi('delete', config, { key: `drawio/${diagram.id}.json` });
      setDiagrams(items => items.filter(item => item.id !== diagram.id));
      if (selectedRef.current?.id === diagram.id) {
        updateSelectedDiagram(null);
        setEditorReady(false);
      }
      notify('图表已删除');
    } catch (err) {
      setError(`删除失败: ${(err as Error).message}`);
    }
  }, [notify, updateSelectedDiagram]);

  const requestEditorXml = useCallback((intent: ExportIntent) => {
    if (!selectedRef.current) return;
    if (!editorReady) {
      if (intent === 'save') void saveDiagram(selectedRef.current, true);
      if (intent === 'download') downloadDiagramFile(selectedRef.current);
      return;
    }
    exportIntentRef.current = intent;
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
      action: 'export',
      format: 'xml',
      spinKey: 'export',
    }), DRAWIO_ORIGIN);
  }, [editorReady, saveDiagram]);

  const importDiagram = useCallback(async (file: File) => {
    try {
      const xml = await file.text();
      if (!xml.includes('<mxfile') && !xml.includes('<mxGraphModel')) {
        throw new Error('文件不是有效的 draw.io 图表');
      }
      createDiagram(file.name.replace(/\.(drawio|xml)$/i, '') || '导入的图表', xml);
    } catch (err) {
      setError(`导入失败: ${(err as Error).message}`);
    }
  }, [createDiagram]);

  const filteredDiagrams = diagrams.filter(diagram => (
    diagram.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ));

  return (
    <div className="tool-container drawio-tool-container">
      <div className="drawio-manager">
        <aside className={`drawio-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <h3>在线画图 ({diagrams.length})</h3>
            <div className="sidebar-actions">
              <button className="btn btn-secondary" onClick={() => setSidebarCollapsed(true)} title="收起图表列表">
                <Icon name="chevron-left" size={16} />
              </button>
              <button className="btn btn-primary" onClick={() => createDiagram()} title="新建图表">
                <Icon name="plus" size={16} />
              </button>
              <button className="btn btn-secondary" onClick={() => void loadDiagrams()} title="刷新列表">
                <Icon name="refresh" size={16} />
              </button>
            </div>
          </div>
          <div className="drawio-import-bar">
            <button className="btn btn-secondary btn-small" onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={14} />
              导入图表
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".drawio,.xml,application/xml,text/xml"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importDiagram(file);
                event.target.value = '';
              }}
            />
          </div>
          <div className="search-box">
            <Icon name="search" size={16} className="search-icon" />
            <input
              className="search-input"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="搜索图表..."
            />
          </div>
          {error && <div className="drawio-error"><Icon name="warning" size={16} />{error}</div>}
          <div className="drawio-list">
            {loading && diagrams.length === 0 ? (
              <div className="loading-state">加载中...</div>
            ) : filteredDiagrams.length === 0 ? (
              <div className="editor-empty drawio-list-empty">
                <Icon name="file" size={40} className="empty-icon" />
                <p>{searchQuery ? '没有匹配的图表' : '暂无图表'}</p>
              </div>
            ) : filteredDiagrams.map(diagram => (
              <button
                key={diagram.id}
                className={`drawio-list-item ${selectedDiagram?.id === diagram.id ? 'active' : ''}`}
                onClick={() => selectDiagram(diagram)}
              >
                <span className="drawio-list-item-main">
                  <span className="drawio-list-title">{diagram.title || '未命名图表'}</span>
                  <span className="drawio-list-date">{formatDate(diagram.updatedAt)}</span>
                </span>
                <span
                  className="drawio-delete-button"
                  role="button"
                  tabIndex={0}
                  title="删除图表"
                  onClick={event => {
                    event.stopPropagation();
                    void deleteDiagram(diagram);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                      void deleteDiagram(diagram);
                    }
                  }}
                >
                  <Icon name="trash" size={14} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="drawio-workspace">
          {selectedDiagram ? (
            <>
              <div className="drawio-header">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setSidebarCollapsed(value => !value)}
                  title={sidebarCollapsed ? '展开图表列表' : '收起图表列表'}
                >
                  <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={14} />
                </button>
                <input
                  className="drawio-title-input"
                  value={selectedDiagram.title}
                  onChange={event => {
                    const updated = { ...selectedDiagram, title: event.target.value };
                    updateSelectedDiagram(updated);
                    setDiagrams(items => items.map(item => item.id === updated.id ? updated : item));
                    scheduleSave(updated);
                  }}
                  placeholder="图表标题"
                />
                <div className="drawio-header-actions">
                  <span className={`drawio-save-state ${saving ? 'saving' : ''}`}>
                    {saving ? '保存中...' : editorReady ? '已连接' : '加载编辑器...'}
                  </span>
                  <button className="btn btn-primary btn-small" onClick={() => requestEditorXml('save')} disabled={saving}>
                    <Icon name="save" size={14} />
                    保存
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => requestEditorXml('download')}>
                    <Icon name="download" size={14} />
                    下载
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => setShowSettingsDialog(true)} title="设置">
                    <Icon name="gear" size={14} />
                  </button>
                </div>
              </div>
              <div className="drawio-frame-wrap">
                {!editorReady && <div className="drawio-frame-loading">正在加载 draw.io 编辑器...</div>}
                <iframe
                  key={selectedDiagram.id}
                  ref={iframeRef}
                  className="drawio-frame"
                  src={DRAWIO_URL}
                  title={`编辑图表：${selectedDiagram.title}`}
                  allow="clipboard-read; clipboard-write"
                />
              </div>
            </>
          ) : (
            <div className="editor-empty drawio-empty">
              <Icon name="edit" size={56} className="empty-icon" />
              <h3>创建你的第一张图表</h3>
              <p>图表会自动保存到已配置的 R2 存储</p>
              <div className="drawio-empty-actions">
                <button className="btn btn-primary" onClick={() => createDiagram()}>
                  <Icon name="plus" size={16} />
                  新建图表
                </button>
                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={16} />
                  导入图表
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSettingsDialog(true)}>
                  <Icon name="gear" size={16} />
                  R2 设置
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <SettingsDialog isOpen={showSettingsDialog} onClose={() => setShowSettingsDialog(false)} />
      <MessageToast show={showToast} message={toastMessage} />
    </div>
  );
};

export default DrawioManager;

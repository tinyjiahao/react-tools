import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import MessageToast from './MessageToast';
import Icon from './Icon';
import 'highlight.js/styles/github-dark.css';

interface FileItem {
  Key: string;
  Size: number;
  LastModified: string;
  ETag?: string;
}

interface Config {
  workerUrl: string;
  apiToken: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const NotesManager = () => {
  const [config, setConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsConfig, setSettingsConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  // 调用 Workers API
  const callWorkerApi = useCallback(async (action: string, currentConfig: Config, body?: any) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (currentConfig.apiToken) {
      headers['Authorization'] = `Bearer ${currentConfig.apiToken}`;
    }

    const response = await fetch(`${currentConfig.workerUrl}?action=${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `操作失败 (${response.status})`);
    }

    return response.json();
  }, []);

  // 加载笔记列表
  const loadNotesList = useCallback(async () => {
    const r2_config = localStorage.getItem('r2_config');
    if (!r2_config) {
      setError('未配置 R2 存储信息，请点击设置按钮进行配置');
      return;
    }

    const currentConfig = JSON.parse(r2_config) as Config;
    if (!currentConfig.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await callWorkerApi('list', currentConfig, { prefix: 'notes/' });
      const noteFiles = (result.files || [])
        .filter((file: FileItem) => file.Key.toLowerCase().endsWith('.json'))
        .sort((a: FileItem, b: FileItem) => {
          return new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime();
        });

      // 加载每个笔记的内容
      const loadedNotes: Note[] = [];
      for (const file of noteFiles) {
        try {
          const baseUrl = currentConfig.workerUrl.replace(/\/$/, '');
          const fileUrl = `${baseUrl}/file/${encodeURIComponent(file.Key)}`;

          const headers: Record<string, string> = {};
          if (currentConfig.apiToken) {
            headers['Authorization'] = `Bearer ${currentConfig.apiToken}`;
          }

          const response = await fetch(fileUrl, { headers });
          if (response.ok) {
            const noteData = await response.json();
            loadedNotes.push({
              id: file.Key.replace('notes/', '').replace('.json', ''),
              ...noteData
            });
          }
        } catch (e) {
          console.error(`Failed to load note ${file.Key}:`, e);
        }
      }

      setNotes(loadedNotes);
    } catch (err) {
      console.error('加载笔记列表失败:', err);
      setError(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [callWorkerApi]);

  // 加载配置
  useEffect(() => {
    const r2_config = localStorage.getItem('r2_config');
    if (r2_config) {
      try {
        const parsed = JSON.parse(r2_config);
        if (parsed.workerUrl) {
          setConfig(parsed);
          setSettingsConfig(parsed);
          loadNotesList();
        } else {
          setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
        }
      } catch (e) {
        console.error('Failed to parse config:', e);
        setError('配置读取失败，请重新配置');
      }
    } else {
      setError('未配置 R2 存储信息，请点击设置按钮进行配置');
    }
  }, []);

  // 自动保存笔记（防抖1秒）
  const saveNote = useCallback(async (note: Note) => {
    const r2_config = localStorage.getItem('r2_config');
    if (!r2_config) return;

    const currentConfig = JSON.parse(r2_config) as Config;
    if (!currentConfig.workerUrl) return;

    setSaving(true);
    try {
      const fileName = `notes/${note.id}.json`;
      const content = JSON.stringify({
        title: note.title,
        content: note.content,
        tags: note.tags,
        createdAt: note.createdAt,
        updatedAt: new Date().toISOString()
      }, null, 2);

      const blob = new Blob([content], { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', blob, fileName);

      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error('保存失败'));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('保存失败，请检查网络连接'));
        });

        xhr.open('POST', `${currentConfig.workerUrl}?action=upload&authorization=${encodeURIComponent(currentConfig.apiToken)}`);
        xhr.send(formData);
      });

      // 更新笔记列表中的时间
      setNotes(prev => prev.map(n =>
        n.id === note.id ? { ...n, updatedAt: new Date().toISOString() } : n
      ));
    } catch (err) {
      console.error('保存笔记失败:', err);
      setError(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, []);

  // 防抖自动保存
  useEffect(() => {
    if (!selectedNote) return;

    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
    }

    autoSaveRef.current = setTimeout(() => {
      saveNote(selectedNote);
    }, 1000);

    return () => {
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
      }
    };
  }, [selectedNote, saveNote]);

  // 创建新笔记
  const createNote = () => {
    const newNote: Note = {
      id: `${Date.now()}`,
      title: '新笔记',
      content: '',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);

    // 立即保存到 R2
    saveNote(newNote);
    setToastMessage('笔记已创建');
    setShowToast(true);
  };

  // 确认删除笔记
  const confirmDelete = (noteId: string) => {
    setDeletingNoteId(noteId);
    setShowDeleteConfirm(true);
  };

  // 执行删除笔记
  const performDelete = async () => {
    if (!deletingNoteId) return;

    const r2_config = localStorage.getItem('r2_config');
    if (!r2_config) {
      setError('未配置 R2 存储信息');
      setShowDeleteConfirm(false);
      return;
    }

    const currentConfig = JSON.parse(r2_config) as Config;
    if (!currentConfig.workerUrl) {
      setShowDeleteConfirm(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await callWorkerApi('delete', currentConfig, { key: `notes/${deletingNoteId}.json` });

      setNotes(prev => prev.filter(n => n.id !== deletingNoteId));
      if (selectedNote?.id === deletingNoteId) {
        setSelectedNote(null);
      }

      setToastMessage('笔记已删除');
      setShowToast(true);
    } catch (err) {
      setError(`删除失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
      setDeletingNoteId(null);
    }
  };

  // 处理图片粘贴上传
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const r2_config = localStorage.getItem('r2_config');
        if (!r2_config) {
          setError('未配置 R2 存储信息');
          return;
        }

        const currentConfig = JSON.parse(r2_config) as Config;
        if (!currentConfig.workerUrl) return;

        try {
          const formData = new FormData();
          const fileName = `assets/${Date.now()}-${file.name}`;
          formData.append('file', file, fileName);

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.addEventListener('load', () => {
              if (xhr.status === 200) {
                resolve();
              } else {
                reject(new Error('上传失败'));
              }
            });
            xhr.addEventListener('error', () => {
              reject(new Error('上传失败'));
            });
            xhr.open('POST', `${currentConfig.workerUrl}?action=upload&authorization=${encodeURIComponent(currentConfig.apiToken)}`);
            xhr.send(formData);
          });

          // 插入图片 Markdown
          const imageUrl = `${currentConfig.workerUrl.replace(/\/$/, '')}/file/${encodeURIComponent(fileName)}`;
          const imageMarkdown = `![${file.name}](${imageUrl})\n`;

          setSelectedNote(prev => prev ? {
            ...prev,
            content: prev.content + imageMarkdown
          } : null);

          setToastMessage('图片已上传');
          setShowToast(true);
        } catch (err) {
          setError(`图片上传失败: ${(err as Error).message}`);
        }

        break;
      }
    }
  };

  // 过滤笔记
  const filteredNotes = notes.filter(note => {
    const query = searchQuery.toLowerCase();
    return note.title.toLowerCase().includes(query) ||
           note.content.toLowerCase().includes(query) ||
           note.tags.some(tag => tag.toLowerCase().includes(query));
  });

  // 格式化时间
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="tool-container">
      <div className="notes-manager">
        {/* 左侧栏 - 笔记列表 */}
        <div className="notes-sidebar">
          <div className="sidebar-header">
            <h3>备忘录 ({notes.length})</h3>
            <div className="sidebar-actions">
              <button
                className="btn btn-primary"
                onClick={createNote}
                title="新建笔记"
              >
                <Icon name="plus" size={16} />
                新建
              </button>
              <button
                className="btn btn-primary"
                onClick={() => loadNotesList()}
                title="刷新列表"
              >
                <Icon name="refresh" size={16} />
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSettingsDialog(true)}
                title="设置"
              >
                <Icon name="gear" size={16} />
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="search-box">
            <Icon name="search" size={16} className="search-icon" />
            <input
              type="text"
              placeholder="搜索笔记..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="error-message">
              <Icon name="warning" size={18} className="error-icon" />
              {error}
            </div>
          )}

          {/* 笔记列表 */}
          <div className="notes-list-container">
            {loading && notes.length === 0 ? (
              <div className="loading-state">加载中...</div>
            ) : filteredNotes.length === 0 ? (
              <div className="empty-state">
                <Icon name="file" size={48} className="empty-icon" />
                <p>{searchQuery ? '没有找到匹配的笔记' : '暂无笔记'}</p>
                <p className="empty-hint">{searchQuery ? '尝试其他关键词' : '点击上方新建按钮创建笔记'}</p>
              </div>
            ) : (
              <div className="notes-list">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`note-item ${selectedNote?.id === note.id ? 'active' : ''}`}
                    onClick={() => setSelectedNote(note)}
                  >
                    <div className="note-item-main">
                      <div className="note-item-info">
                        <span className="note-title">{note.title || '无标题'}</span>
                        <span className="note-meta">
                          {formatDate(note.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      className="action-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(note.id);
                      }}
                      title="删除"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧栏 - 编辑器 */}
        <div className="notes-editor">
          {saving && (
            <div className="saving-indicator">
              <div className="loading-spinner-small"></div>
              保存中...
            </div>
          )}
          {selectedNote ? (
            <>
              <div className="editor-header">
                <input
                  type="text"
                  className="note-title-input"
                  value={selectedNote.title}
                  onChange={(e) => setSelectedNote({ ...selectedNote, title: e.target.value })}
                  placeholder="笔记标题"
                />
                <button
                  className="btn-close"
                  onClick={() => setSelectedNote(null)}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="editor-content">
                <textarea
                  className="note-textarea"
                  value={selectedNote.content}
                  onChange={(e) => setSelectedNote({ ...selectedNote, content: e.target.value })}
                  onPaste={handlePaste}
                  placeholder="开始输入笔记内容... (支持粘贴图片)"
                />
                <div className="note-preview">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {selectedNote.content || '*开始编写笔记...*'}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="editor-footer">
                <span className="note-meta-info">
                  创建于 {formatDate(selectedNote.createdAt)}
                </span>
              </div>
            </>
          ) : (
            <div className="editor-empty">
              <Icon name="file" size={64} className="empty-icon" />
              <h3>选择或创建笔记</h3>
              <p>从左侧列表中选择笔记，或点击新建按钮创建新笔记</p>
            </div>
          )}
        </div>
      </div>

      {/* 设置对话框 */}
      {showSettingsDialog && (
        <div className="settings-overlay" onClick={() => setShowSettingsDialog(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>R2 存储配置</h2>
              <button
                className="btn-close"
                onClick={() => setShowSettingsDialog(false)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="settings-content">
              <div className="settings-form">
                <div className="form-group">
                  <label htmlFor="workerUrl">Workers URL:</label>
                  <input
                    id="workerUrl"
                    type="text"
                    value={settingsConfig.workerUrl}
                    onChange={(e) => setSettingsConfig(prev => ({ ...prev, workerUrl: e.target.value }))}
                    placeholder="https://your-worker.your-subdomain.workers.dev"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="apiToken">API Token (可选):</label>
                  <input
                    id="apiToken"
                    type="text"
                    value={settingsConfig.apiToken}
                    onChange={(e) => setSettingsConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                    placeholder="用于验证请求的可选 Token"
                  />
                </div>
                <div className="settings-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      localStorage.setItem('r2_config', JSON.stringify(settingsConfig));
                      setConfig(settingsConfig);
                      setShowSettingsDialog(false);
                      setToastMessage('配置已保存');
                      setShowToast(true);
                      loadNotesList();
                    }}
                  >
                    保存配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="settings-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="settings-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>确认删除</h2>
            </div>
            <div className="settings-content">
              <div className="confirm-message">
                <Icon name="warning" size={48} className="confirm-icon" />
                <p>确定要删除这条笔记吗？</p>
                <p className="confirm-hint">此操作无法撤销</p>
              </div>
            </div>
            <div className="settings-footer">
              <button
                className="btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={performDelete}
                disabled={loading}
              >
                {loading ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MessageToast show={showToast} message={toastMessage} />
    </div>
  );
};

export default NotesManager;

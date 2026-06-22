import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import MessageToast from './MessageToast';
import Icon from './Icon';
import type { Config, FileItem } from '../lib/types';
import { STORAGE_KEYS, safeGetConfig } from '../lib/storage';
import { callWorkerApi, uploadWithProgress } from '../lib/r2Api';

// Monaco 编辑器主题选项
type MonacoTheme = 'vs' | 'vs-dark' | 'hc-black';
type MonacoLanguage = 'plaintext' | 'markdown' | 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'html' | 'css' | 'json' | 'xml' | 'sql' | 'yaml';

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  language?: MonacoLanguage;  // 每篇笔记单独记录高亮语言；旧笔记无此字段时回落到全局默认
  createdAt: string;
  updatedAt: string;
}

const THEME_OPTIONS: { value: MonacoTheme; label: string }[] = [
  { value: 'vs', label: '浅色' },
  { value: 'vs-dark', label: '深色' },
  { value: 'hc-black', label: '高对比度' }
];

const LANGUAGE_OPTIONS: { value: MonacoLanguage; label: string }[] = [
  { value: 'plaintext', label: '纯文本' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' }
];

const NotesManager = () => {
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
  const [editorTheme, setEditorTheme] = useState<MonacoTheme>(() => {
    return (localStorage.getItem('monaco_theme') as MonacoTheme) || 'vs';
  });
  const [editorLanguage, setEditorLanguage] = useState<MonacoLanguage>(() => {
    return (localStorage.getItem('monaco_language') as MonacoLanguage) || 'markdown';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('notes_sidebar_collapsed') === 'true';
  });
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 使用 ref 来跟踪当前笔记的最新内容，避免闭包中的旧值
  const currentNoteRef = useRef<Note | null>(null);
  // 存储原始笔记内容，用于比较是否有变化
  const originalNoteRef = useRef<Note | null>(null);
  // 保存并发控制：是否正在保存、是否在保存期间又产生了新的改动
  const isSavingRef = useRef(false);
  const isSavePendingRef = useRef(false);

  // 调用 Workers API —— 使用共享封装（见 src/lib/r2Api.ts），参数顺序 (action, config, body)

  // 从 R2 加载单个笔记的完整内容
  const loadNoteContent = useCallback(async (noteId: string): Promise<Note | null> => {
    const currentConfig = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!currentConfig || !currentConfig.workerUrl) return null;

    try {
      const baseUrl = currentConfig.workerUrl.replace(/\/$/, '');
      // 添加时间戳参数避免浏览器缓存
      const fileUrl = `${baseUrl}/file/notes/${encodeURIComponent(noteId)}.json?_t=${Date.now()}`;

      const headers: Record<string, string> = {};
      if (currentConfig.apiToken) {
        headers['Authorization'] = `Bearer ${currentConfig.apiToken}`;
      }

      const response = await fetch(fileUrl, { headers });
      if (response.ok) {
        const noteData = await response.json();
        return {
          id: noteId,
          ...noteData
        };
      }
    } catch (e) {
      console.error(`Failed to load note content for ${noteId}:`, e);
    }
    return null;
  }, []);

  // 加载笔记列表
  const loadNotesList = useCallback(async () => {
    const currentConfig = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!currentConfig) {
      setError('未配置 R2 存储信息，请点击设置按钮进行配置');
      return;
    }

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
          // 添加时间戳参数避免浏览器缓存
          const fileUrl = `${baseUrl}/file/${encodeURIComponent(file.Key)}?_t=${Date.now()}`;

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

      // 恢复上次选中的笔记
      const savedSelectedId = localStorage.getItem('notes_selected_id');
      if (savedSelectedId) {
        const savedNote = loadedNotes.find(n => n.id === savedSelectedId);
        if (savedNote) {
          // 从 R2 加载最新内容
          const latestNote = await loadNoteContent(savedNote.id);
          if (latestNote) {
            updateSelectedNote(latestNote, true);
          } else {
            updateSelectedNote(savedNote, true);
          }
        }
      }
    } catch (err) {
      console.error('加载笔记列表失败:', err);
      setError(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [callWorkerApi]); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载配置
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const currentConfig = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!currentConfig) {
      setError('未配置 R2 存储信息，请点击设置按钮进行配置');
      return;
    }
    if (!currentConfig.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }
    setSettingsConfig(currentConfig);
    loadNotesList();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/exhaustive-deps */

  // 保存侧边栏收起状态到 localStorage
  useEffect(() => {
    localStorage.setItem('notes_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // 保存当前选中的笔记 ID 到 localStorage
  useEffect(() => {
    if (selectedNote) {
      localStorage.setItem('notes_selected_id', selectedNote.id);
    } else {
      localStorage.removeItem('notes_selected_id');
    }
  }, [selectedNote]);

  // 同步 ref 和 state
  // resetOriginal=true 表示这是一次"笔记切换/新建"，需要把"原始内容基准"重置为该笔记的初始内容，
  // 否则 saveNote 的"内容是否有变化"比较会基于错误的基准线（导致永不保存或重复保存）。
  // 编辑输入（onChange）调用本函数时传 resetOriginal=false，绝不移动 originalNoteRef。
  const updateSelectedNote = useCallback((
    note: Note | null | ((prev: Note | null) => Note | null),
    resetOriginal: boolean = false
  ) => {
    setSelectedNote(prev => {
      const newNote = typeof note === 'function' ? (note as (prev: Note | null) => Note | null)(prev) : note;
      currentNoteRef.current = newNote;
      // 仅在切换/新建笔记时重置原始内容基准；编辑更新不触碰它
      if (resetOriginal && newNote) {
        originalNoteRef.current = { ...newNote };
      }
      return newNote;
    });
  }, []);

  // 自动保存笔记（防抖后触发）
  // force=true 时跳过"内容无变化"判断（手动保存必须强制写盘并给用户明确反馈，
  // 否则在自动保存已成功的情形下点保存会静默 return，用户感觉"没反应"）
  const saveNote = useCallback(async (note: Note, force: boolean = false) => {
    const currentConfig = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!currentConfig || !currentConfig.workerUrl) {
      setError('未配置 R2 存储信息，请点击设置按钮进行配置');
      return;
    }

    // 检查内容是否有变化（手动保存强制跳过该判断）
    if (!force) {
      const original = originalNoteRef.current;
      if (original &&
          original.id === note.id &&
          original.title === note.title &&
          original.content === note.content &&
          JSON.stringify(original.tags) === JSON.stringify(note.tags)) {
        // 自动保存场景下内容没有变化，不保存（静默）
        return;
      }
    }

    // 并发控制：如果已有保存正在进行，标记需要再次保存（保存最新内容）
    if (isSavingRef.current) {
      isSavePendingRef.current = true;
      return;
    }

    setSaving(true);
    isSavingRef.current = true;
    try {
      const fileName = `notes/${note.id}.json`;
      const nowIso = new Date().toISOString();
      const content = JSON.stringify({
        title: note.title,
        content: note.content,
        tags: note.tags,
        language: note.language ?? null,  // 持久化每篇笔记的高亮语言
        createdAt: note.createdAt,
        updatedAt: nowIso
      }, null, 2);

      const formData = new FormData();
      formData.append('file', new Blob([content], { type: 'application/json' }), fileName);

      await uploadWithProgress(currentConfig, formData);

      // 保存成功后把完整笔记（含 title/content/tags）同步回列表，确保刷新前列表即最新
      setNotes(prev => prev.map(n =>
        n.id === note.id ? { ...n, ...note, updatedAt: nowIso } : n
      ));

      // 保存成功后更新原始内容
      originalNoteRef.current = { ...note, updatedAt: nowIso };

      // 显示保存成功提示
      setToastMessage('笔记已保存');
      setShowToast(true);
    } catch (err) {
      console.error('保存笔记失败:', err);
      setError(`保存失败: ${(err as Error).message}`);
    } finally {
      isSavingRef.current = false;
      setSaving(false);

      // 如果在保存期间又产生了新的改动，再保存一次最新内容
      if (isSavePendingRef.current) {
        isSavePendingRef.current = false;
        const latestNote = currentNoteRef.current;
        if (latestNote) {
          saveNote(latestNote);
        }
      }
    }
  }, []);

  // 立即执行待保存（取消防抖定时器，同步触发一次保存）
  const flushSave = useCallback(() => {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    const latestNote = currentNoteRef.current;
    if (latestNote) {
      saveNote(latestNote);
    }
  }, [saveNote]);

  // 处理点击笔记 - 从 R2 加载最新内容
  const handleNoteClick = useCallback(async (note: Note) => {
    // 切换前先提交当前笔记未保存的改动，避免防抖定时器被清除导致丢失
    if (selectedNote?.id && selectedNote.id !== note.id) {
      flushSave();
    }

    // 先用列表数据显示，避免等待（切换笔记：重置原始内容基准）
    updateSelectedNote(note, true);
    // 切换到该笔记时，应用其记录的高亮语言（无记录则保持全局默认）
    if (note.language) {
      setEditorLanguage(note.language);
    }

    // 然后从 R2 加载最新内容
    const latestNote = await loadNoteContent(note.id);
    if (latestNote) {
      // 用从 R2 读到的最新内容作为原始基准（updateSelectedNote 传 true 重置）
      updateSelectedNote(latestNote, true);
      // 加载到的内容可能带有更准确的语言记录，再次同步
      if (latestNote.language) {
        setEditorLanguage(latestNote.language);
      }
      // 同时更新列表中的数据
      setNotes(prev => prev.map(n => n.id === latestNote.id ? latestNote : n));
    }
  }, [loadNoteContent, updateSelectedNote, selectedNote, flushSave]);

  // 手动保存笔记 - 使用 ref 中的最新数据
  // 手动保存强制写盘（force=true），并始终给用户反馈，避免"点了没反应"
  const handleManualSave = useCallback(async () => {
    const latestNote = currentNoteRef.current;
    if (!latestNote) return;
    // 取消待执行的自动保存，以手动保存为准
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    await saveNote(latestNote, true);
  }, [saveNote]);

  // 防抖自动保存 - 使用 ref 获取最新内容
  // 仅依赖 noteId（切换笔记时才重建定时器），内容变化通过 ref 读取，
  // 避免每次输入都重置定时器导致自动保存永不触发
  useEffect(() => {
    if (!selectedNote) return;

    // 切换笔记时清理上一次的定时器
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
    }

    autoSaveRef.current = setTimeout(() => {
      autoSaveRef.current = null;
      // 使用 ref 中的最新数据，而不是闭包中的旧值
      const latestNote = currentNoteRef.current;
      if (latestNote) {
        saveNote(latestNote);
      }
    }, 1500); // 1.5秒防抖

    return () => {
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
        autoSaveRef.current = null;
      }
    };
  }, [selectedNote?.id, saveNote]); // eslint-disable-line react-hooks/exhaustive-deps

  // 页面隐藏 / 关闭 / 切换标签页时，立即保存未提交的改动
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };
    const beforeUnloadHandler = () => {
      flushSave();
    };

    document.addEventListener('visibilitychange', handler);
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [flushSave]);

  // 组件卸载时保存
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  // 创建新笔记
  const createNote = () => {
    // 创建前先提交当前笔记未保存的改动
    if (selectedNote) {
      flushSave();
    }

    const newNote: Note = {
      id: `${Date.now()}`,
      title: '新笔记',
      content: '',
      tags: [],
      language: editorLanguage,  // 新笔记沿用当前编辑器语言作为默认
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setNotes(prev => [newNote, ...prev]);
    // 新笔记：原始基准设为 null，保证首次 saveNote 一定写盘（saveNote 中 original 为 null 即视为有变化）
    originalNoteRef.current = null;
    // 这里不能传 true 重置基准（会把基准设为空笔记，导致 saveNote 认为"无变化"不保存）
    updateSelectedNote(newNote, false);

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

    const currentConfig = safeGetConfig(STORAGE_KEYS.r2Config);
    if (!currentConfig) {
      setError('未配置 R2 存储信息');
      setShowDeleteConfirm(false);
      return;
    }

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
        updateSelectedNote(null);
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
        <div className={`notes-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <h3>备忘录 ({notes.length})</h3>
            <div className="sidebar-actions">
              <button
                className="btn btn-primary"
                onClick={() => loadNotesList()}
                title="刷新列表"
              >
                <Icon name="refresh" size={16} />
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
                    onClick={() => handleNoteClick(note)}
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
        <div className={`notes-editor ${sidebarCollapsed ? 'expanded' : ''}`}>
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
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    // 同时更新当前选中笔记与左侧列表中的标题，保证列表实时反映改名
                    updateSelectedNote({ ...selectedNote, title: newTitle }, false);
                    setNotes(prev => prev.map(n =>
                      n.id === selectedNote.id ? { ...n, title: newTitle } : n
                    ));
                  }}
                  placeholder="笔记标题"
                />
                <div className="editor-header-actions">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={createNote}
                    title="新建笔记"
                  >
                    <Icon name="plus" size={14} />
                    新建
                  </button>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={handleManualSave}
                    disabled={saving}
                    title="保存笔记"
                  >
                    <Icon name="save" size={14} />
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setShowSettingsDialog(true)}
                    title="设置"
                  >
                    <Icon name="gear" size={14} />
                  </button>
                  <button
                    className="btn-close"
                    onClick={() => updateSelectedNote(null)}
                    title="关闭"
                  >
                    <Icon name="close" size={20} />
                  </button>
                </div>
              </div>
              <div className="editor-toolbar">
                <div className="editor-toolbar-group">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    title={sidebarCollapsed ? "展开笔记列表" : "收起笔记列表"}
                  >
                    <Icon name={sidebarCollapsed ? "chevron-right" : "chevron-left"} size={14} />
                  </button>
                </div>
                <div className="editor-toolbar-group">
                  <label className="editor-toolbar-label">
                    <Icon name="palette" size={14} />
                    主题:
                  </label>
                  <select
                    className="editor-toolbar-select"
                    value={editorTheme}
                    onChange={(e) => {
                      const theme = e.target.value as MonacoTheme;
                      setEditorTheme(theme);
                      localStorage.setItem('monaco_theme', theme);
                    }}
                  >
                    {THEME_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="editor-toolbar-group">
                  <label className="editor-toolbar-label">
                    <Icon name="code" size={14} />
                    语言:
                  </label>
                  <select
                    className="editor-toolbar-select"
                    value={editorLanguage}
                    onChange={(e) => {
                      const lang = e.target.value as MonacoLanguage;
                      setEditorLanguage(lang);
                      // 记为该笔记专属语言（下次进入自动应用），并作为新建笔记的默认值
                      localStorage.setItem('monaco_language', lang);
                      if (selectedNote) {
                        const updated = { ...selectedNote, language: lang };
                        updateSelectedNote(updated, false);
                        setNotes(prev => prev.map(n =>
                          n.id === selectedNote.id ? { ...n, language: lang } : n
                        ));
                        // 立即保存语言设置到 R2
                        saveNote(updated, true);
                      }
                    }}
                  >
                    {LANGUAGE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="editor-content">
                <Editor
                  height="100%"
                  language={editorLanguage}
                  value={selectedNote.content}
                  onChange={(value) => updateSelectedNote({ ...selectedNote, content: value || '' }, false)}
                  theme={editorTheme}
                  onMount={(editor, monaco) => {
                    // 添加 ESC 键监听来关闭搜索框
                    editor.addCommand(monaco.KeyCode.Escape, () => {
                      // 触发关闭搜索框的动作
                      editor.trigger('keyboard', 'closeFindWidget', null);
                    });
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 2,
                    formatOnPaste: true,
                    formatOnType: true,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="editor-empty">
              <Icon name="file" size={64} className="empty-icon" />
              <h3>选择或创建笔记</h3>
              <p>从左侧列表中选择笔记，或点击下方按钮创建新笔记</p>
              <button
                className="btn btn-primary"
                onClick={createNote}
                style={{ marginTop: '20px' }}
              >
                <Icon name="plus" size={16} />
                新建笔记
              </button>
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

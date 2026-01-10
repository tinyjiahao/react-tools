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

const MarkdownViewer = () => {
  const [config, setConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string>('');
  const [newFileName, setNewFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 调用 Workers API
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callWorkerApi = useCallback(async (action: string, body?: any, currentConfig = config) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 列出文件
  const listFiles = useCallback(async () => {
    // 从 localStorage 重新读取最新配置
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
      // 传递 prefix 参数指定目录（如果 Worker 支持）
      const result = await callWorkerApi('list', { prefix: 'markdown_file/' }, currentConfig);
      // 前端过滤：只保留 markdown_file 目录下的 Markdown 文件
      const markdownFiles = (result.files || []).filter((file: FileItem) => {
        const key = file.Key.toLowerCase();
        return (key.startsWith('markdown_file/') || key.startsWith('markdown_file\\')) &&
               (key.endsWith('.md') || key.endsWith('.markdown'));
      });
      // 按修改时间倒序排序
      markdownFiles.sort((a: FileItem, b: FileItem) => {
        return new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime();
      });
      setFiles(markdownFiles);
    } catch (err) {
      console.error('加载文件列表失败:', err);
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
          const loadInitialFiles = async () => {
            setLoading(true);
            setError('');
            try {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              if (parsed.apiToken) {
                headers['Authorization'] = `Bearer ${parsed.apiToken}`;
              }
              const response = await fetch(`${parsed.workerUrl}?action=list`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ prefix: 'markdown_file/' }),
              });
              if (response.ok) {
                const result = await response.json();
                // 前端过滤：只保留 markdown_file 目录下的 Markdown 文件
                const markdownFiles = (result.files || []).filter((file: FileItem) => {
                  const key = file.Key.toLowerCase();
                  return (key.startsWith('markdown_file/') || key.startsWith('markdown_file\\')) &&
                         (key.endsWith('.md') || key.endsWith('.markdown'));
                });
                markdownFiles.sort((a: FileItem, b: FileItem) => {
                  return new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime();
                });
                setFiles(markdownFiles);
              } else {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                setError(errorData.error || `加载失败 (${response.status})`);
              }
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setLoading(false);
            }
          };
          loadInitialFiles();
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

  // 上传文件
  const uploadToR2 = async () => {
    if (!uploadFile) return;
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    // 验证文件类型
    const fileName = uploadFile.name.toLowerCase();
    if (!fileName.endsWith('.md') && !fileName.endsWith('.markdown')) {
      setError('只能上传 Markdown 文件（.md 或 .markdown）');
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      const formData = new FormData();
      // 上传到 markdown_file 目录下
      formData.append('file', uploadFile, `markdown_file/${uploadFile.name}`);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setUploadFile(null);
          setUploadProgress(0);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          listFiles();
          setToastMessage('上传成功！');
          setShowToast(true);
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            setError(errorData.error || '上传失败');
          } catch {
            setError('上传失败');
          }
        }
        setLoading(false);
      });

      xhr.addEventListener('error', () => {
        setError('上传失败，请检查网络连接');
        setLoading(false);
      });

      xhr.open('POST', `${config.workerUrl}?action=upload&authorization=${encodeURIComponent(config.apiToken)}`);
      xhr.send(formData);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  // 删除文件
  const deleteFile = async (key: string) => {
    if (!window.confirm(`确定要删除文件 "${key}" 吗？`)) return;
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await callWorkerApi('delete', { key });
      if (selectedFile === key) {
        setSelectedFile(null);
        setMarkdownContent('');
      }
      listFiles();
      setToastMessage('删除成功！');
      setShowToast(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 重命名文件
  const renameFile = async () => {
    if (!newFileName.trim()) {
      setError('新文件名不能为空');
      return;
    }

    // 验证文件名
    const fileName = newFileName.toLowerCase();
    if (!fileName.endsWith('.md') && !fileName.endsWith('.markdown')) {
      setError('文件名必须以 .md 或 .markdown 结尾');
      return;
    }

    // 从 localStorage 读取最新配置
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
      const oldKey = renamingFile;
      // 保持目录前缀
      const prefix = 'markdown_file/';
      const newKey = prefix + newFileName;

      await callWorkerApi('rename', { oldKey, newKey }, currentConfig);

      // 如果重命名的是当前选中的文件，更新选中状态
      if (selectedFile === oldKey) {
        setSelectedFile(newKey);
      }

      setShowRenameDialog(false);
      setNewFileName('');
      setRenamingFile('');
      listFiles();
      setToastMessage('重命名成功！');
      setShowToast(true);
    } catch (err) {
      setError(`重命名失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // 打开重命名对话框
  const openRenameDialog = (key: string) => {
    // 提取纯文件名（去掉目录前缀）
    const fileName = key.replace(/^markdown_file[/\\]/, '');
    setRenamingFile(key);
    setNewFileName(fileName);
    setShowRenameDialog(true);
    setError('');
  };

  // 下载文件
  const downloadFile = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const baseUrl = config.workerUrl.replace(/\/$/, '');
      const fileUrl = `${baseUrl}/file/${encodeURIComponent(key)}`;

      const headers: Record<string, string> = {};
      if (config.apiToken) {
        headers['Authorization'] = `Bearer ${config.apiToken}`;
      }

      const response = await fetch(fileUrl, { headers });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请检查 API Token 配置');
        }
        if (response.status === 404) {
          throw new Error('文件不存在');
        }
        throw new Error(`下载失败 (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = key;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 加载文件内容
  const loadFileContent = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    setPreviewLoading(true);
    setError('');
    setSelectedFile(key);
    try {
      const baseUrl = config.workerUrl.replace(/\/$/, '');
      const fileUrl = `${baseUrl}/file/${encodeURIComponent(key)}`;

      const headers: Record<string, string> = {};
      if (config.apiToken) {
        headers['Authorization'] = `Bearer ${config.apiToken}`;
      }

      // 先检查文件大小
      const headResponse = await fetch(fileUrl, {
        method: 'HEAD',
        headers
      });

      if (!headResponse.ok) {
        throw new Error('无法获取文件信息');
      }

      const contentLength = headResponse.headers.get('content-length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

      // 限制预览文件大小为 2MB
      const maxSize = 2 * 1024 * 1024;
      if (fileSize > maxSize) {
        throw new Error(`文件过大，超过预览限制 (2MB)，请下载后查看`);
      }

      const response = await fetch(fileUrl, { headers });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请检查 API Token 配置');
        }
        if (response.status === 404) {
          throw new Error('文件不存在');
        }
        throw new Error(`加载失败 (${response.status})`);
      }

      const text = await response.text();
      setMarkdownContent(text);
    } catch (err) {
      setError((err as Error).message);
      setSelectedFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化时间
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="tool-container">
      <h2>Markdown 在线预览</h2>
      <div className="markdown-viewer-container">
        {/* 左侧栏 - 文件列表 */}
        <div className="markdown-sidebar">
          <div className="sidebar-header">
            <h3>文件列表 ({files.length})</h3>
            <div className="sidebar-actions">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    const fileName = file.name.toLowerCase();
                    if (!fileName.endsWith('.md') && !fileName.endsWith('.markdown')) {
                      setError('只能上传 Markdown 文件（.md 或 .markdown）');
                      return;
                    }
                  }
                  setUploadFile(file);
                }}
                accept=".md,.markdown"
                className="hidden-file-input"
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                title="上传文件"
              >
                <Icon name="upload" size={16} />
              </button>
              <button
                className="btn btn-primary"
                onClick={() => listFiles()}
                title="刷新列表"
              >
                <Icon name="refresh" size={16} />
              </button>
            </div>
          </div>

          {/* 上传文件区域 */}
          {uploadFile && (
            <div className="upload-file-item">
              <div className="upload-file-info">
                <Icon name="file" size={16} />
                <span className="upload-file-name">{uploadFile.name}</span>
                <span className="upload-file-size">({formatSize(uploadFile.size)})</span>
              </div>
              {uploadProgress > 0 && (
                <div className="progress-bar-small">
                  <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}
              <div className="upload-file-actions">
                <button
                  className="btn btn-primary btn-small"
                  onClick={uploadToR2}
                  disabled={loading}
                >
                  {loading ? '上传中...' : '上传'}
                </button>
                <button
                  className="btn-close"
                  onClick={() => {
                    setUploadFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="error-message">
              <Icon name="warning" size={18} className="error-icon" />
              {error}
            </div>
          )}

          {/* 文件列表 */}
          <div className="file-list-container">
            {loading && files.length === 0 ? (
              <div className="loading-state">加载中...</div>
            ) : files.length === 0 ? (
              <div className="empty-state">
                <Icon name="file" size={48} className="empty-icon" />
                <p>暂无 Markdown 文件</p>
                <p className="empty-hint">点击上方上传按钮添加文件</p>
              </div>
            ) : (
              <div className="file-list">
                {files.map((file) => (
                  <div
                    key={file.Key}
                    className={`file-item ${selectedFile === file.Key ? 'active' : ''}`}
                    onClick={() => loadFileContent(file.Key)}
                  >
                    <div className="file-item-main">
                      <Icon name="file" size={18} className="file-icon" />
                      <div className="file-item-info">
                        <span className="file-name" title={file.Key}>{file.Key}</span>
                        <span className="file-meta">
                          {formatSize(file.Size)} · {formatDate(file.LastModified)}
                        </span>
                      </div>
                    </div>
                    <div className="file-item-actions">
                      <button
                        className="action-btn rename-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameDialog(file.Key);
                        }}
                        title="重命名"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="action-btn download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFile(file.Key);
                        }}
                        title="下载"
                      >
                        <Icon name="download" size={14} />
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(file.Key);
                        }}
                        title="删除"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧栏 - 预览区域 */}
        <div className="markdown-preview">
          {previewLoading ? (
            <div className="preview-loading">
              <div className="loading-spinner"></div>
              <p>加载中...</p>
            </div>
          ) : selectedFile ? (
            <>
              <div className="preview-header">
                <h3>{selectedFile}</h3>
              </div>
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            </>
          ) : (
            <div className="preview-empty">
              <Icon name="file" size={64} className="empty-icon" />
              <h3>选择一个文件开始预览</h3>
              <p>从左侧列表中选择一个 Markdown 文件进行预览</p>
            </div>
          )}
        </div>
      </div>

      {/* 重命名对话框 */}
      {showRenameDialog && (
        <div className="settings-overlay" onClick={() => setShowRenameDialog(false)}>
          <div className="settings-dialog rename-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>重命名文件</h2>
              <button
                className="btn-close"
                onClick={() => setShowRenameDialog(false)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="settings-content">
              <div className="form-group">
                <label>原文件名</label>
                <input
                  type="text"
                  value={renamingFile.replace(/^markdown_file[/\\]/, '')}
                  disabled
                  className="disabled-input"
                />
              </div>
              <div className="form-group">
                <label>新文件名</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="输入新文件名（需要包含 .md 扩展名）"
                  autoFocus
                />
                <span className="input-hint">文件名必须以 .md 或 .markdown 结尾</span>
              </div>
            </div>
            <div className="settings-footer">
              <button
                className="btn"
                onClick={() => setShowRenameDialog(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={renameFile}
                disabled={loading}
              >
                {loading ? '重命名中...' : '确认重命名'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MessageToast show={showToast} message={toastMessage} />
    </div>
  );
};

export default MarkdownViewer;

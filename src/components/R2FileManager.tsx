import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageToast from './MessageToast';
import Icon from './Icon';

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

const R2FileManager = () => {
  const [config, setConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string; type: 'text' | 'image' } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
  }, [config.workerUrl, config.apiToken]);

  // 列出文件
  const listFiles = useCallback(async (currentConfig = config) => {
    console.log('currentConfig', currentConfig);
    if (!currentConfig.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await callWorkerApi('list', undefined, currentConfig);
      setFiles(result.files || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [config, callWorkerApi]);

  // 加载配置
  useEffect(() => {
    const r2_config = localStorage.getItem('r2_config');
    console.log('r2_config', r2_config);
    if (r2_config) {
      try {
        const parsed = JSON.parse(r2_config);
        // 验证配置有效
        if (parsed.workerUrl) {
          setConfig(parsed);
          // 配置加载后再调用 API 获取文件列表
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
                body: JSON.stringify({}),
              });
              if (response.ok) {
                const result = await response.json();
                setFiles(result.files || []);
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
      // 没有配置时显示提示
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

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

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
          setShowCopyToast(true);
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
      listFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板的工具函数
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      // 尝试使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback method:', err);
    }

    // 备选方法：使用 document.execCommand
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback copy method also failed:', err);
      return false;
    }
  };

  // 获取文件URL - 复制文件访问链接（不包含 token，更安全）
  // 注意：直接打开此链接需要 Worker 的 /file/ 路由公开访问或使用其他验证方式
  const getFileUrl = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    try {
      // 使用配置的 workerUrl 构造文件访问链接（不包含 token）
      const baseUrl = config.workerUrl.replace(/\/$/, '');
      const fileUrl = `${baseUrl}/file/${encodeURIComponent(key)}`;

      const success = await copyToClipboard(fileUrl);
      if (success) {
        setCopiedUrl(fileUrl);
        setShowCopyToast(true);
      } else {
        setError('复制失败，请手动复制 URL');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 下载文件 - 使用 fetch 下载，token 放在 header 中不暴露在 url
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

      // 使用 fetch 下载，token 放在 Authorization header 中
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

      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = key;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // 转换为 blob 并触发下载
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
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

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化时间
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  // 获取文件扩展名图标
  const getFileIconName = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, string> = {
      'txt': 'file',
      'json': 'file',
      'js': 'file',
      'ts': 'file',
      'html': 'file',
      'css': 'file',
      'png': 'file',
      'jpg': 'file',
      'jpeg': 'file',
      'gif': 'file',
      'svg': 'file',
      'pdf': 'file',
      'zip': 'file',
      'mp4': 'file',
      'mp3': 'file',
    };
    return iconMap[ext] || 'file';
  };

  // 检测是否为文本文件
  const isTextFile = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const textExtensions = [
      'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'less',
      'md', 'markdown', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config',
      'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp',
      'go', 'rs', 'swift', 'kt', 'scala', 'groovy', 'lua', 'r', 'sql', 'graphql',
      'vue', 'svelte', 'webc', 'astro', 'htaccess', 'env', 'gitignore', 'dockerignore'
    ];
    return textExtensions.includes(ext);
  };

  // 检测是否为图片文件
  const isImageFile = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif'];
    return imageExtensions.includes(ext);
  };

  // 预览文件
  const previewFileContent = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    setPreviewLoading(true);
    setError('');
    try {
      const baseUrl = config.workerUrl.replace(/\/$/, '');
      const fileUrl = `${baseUrl}/file/${encodeURIComponent(key)}`;

      // 如果是图片，直接保存URL
      if (isImageFile(key)) {
        // 对于图片，如果需要认证，我们需要使用 blob URL
        if (config.apiToken) {
          const headers: Record<string, string> = {
            'Authorization': `Bearer ${config.apiToken}`
          };
          const response = await fetch(fileUrl, { headers });
          if (!response.ok) {
            if (response.status === 401) {
              throw new Error('未授权，请检查 API Token 配置');
            }
            if (response.status === 404) {
              throw new Error('文件不存在');
            }
            throw new Error(`预览失败 (${response.status})`);
          }
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          setPreviewFile({ name: key, content: blobUrl, type: 'image' });
        } else {
          setPreviewFile({ name: key, content: fileUrl, type: 'image' });
        }
      } else {
        // 文本文件处理 - 先检查文件大小
        const headers: Record<string, string> = {};
        if (config.apiToken) {
          headers['Authorization'] = `Bearer ${config.apiToken}`;
        }

        // 使用 HEAD 请求先检查文件大小
        const headResponse = await fetch(fileUrl, {
          method: 'HEAD',
          headers
        });

        if (!headResponse.ok) {
          throw new Error('无法获取文件信息');
        }

        const contentLength = headResponse.headers.get('content-length');
        const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

        // 限制预览文件大小为 5MB
        const maxSize = 5 * 1024 * 1024;
        if (fileSize > maxSize) {
          throw new Error(`文件过大 (${formatSize(fileSize)})，超过预览限制 (5MB)，请下载后查看`);
        }

        const response = await fetch(fileUrl, { headers });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('未授权，请检查 API Token 配置');
          }
          if (response.status === 404) {
            throw new Error('文件不存在');
          }
          throw new Error(`预览失败 (${response.status})`);
        }

        const text = await response.text();
        setPreviewFile({ name: key, content: text, type: 'text' });
      }
    } catch (err) {
      setError((err as Error).message);
      setPreviewLoading(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="tool-container">
      <h2>R2 文件管理工具</h2>
      <div className="tool-content">
        {/* 上传区域 */}
        <div className="upload-section">
          <div className="upload-area">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="file-input"
            />
            {uploadFile && (
              <div className="selected-file">
                <Icon name={getFileIconName(uploadFile.name)} size={18} />
                <span>{uploadFile.name}</span>
                <span className="file-size">({formatSize(uploadFile.size)})</span>
                <button className="btn-close" onClick={() => {
                  setUploadFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}>×</button>
              </div>
            )}
          </div>
          {uploadFile && uploadProgress > 0 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
              <span className="progress-text">{uploadProgress}%</span>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={uploadToR2}
            disabled={!uploadFile || loading}
          >
            {loading ? '上传中...' : '开始上传'}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-message">
            <Icon name="warning" size={18} className="error-icon" />
            {error}
          </div>
        )}

        {/* 文件列表 */}
        <div className="file-list-section">
          <div className="file-list-header">
            <h3>文件列表 ({files.length} 个文件)</h3>
            <button className="btn btn-primary" onClick={() => listFiles()}>
              <Icon name="refresh" size={16} />
              刷新
            </button>
          </div>
          {loading && files.length === 0 ? (
            <div className="loading-state">加载中...</div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <Icon name="box" size={64} className="empty-icon" />
              <p>暂无文件</p>
            </div>
          ) : (
            <table className="file-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.Key}>
                    <td>
                      <div className="file-table-cell">
                        <Icon name={getFileIconName(file.Key)} size={18} className="file-icon" />
                        <span className="file-name" title={file.Key}>{file.Key}</span>
                      </div>
                    </td>
                    <td>{formatSize(file.Size)}</td>
                    <td>{formatDate(file.LastModified)}</td>
                    <td>
                      <div className="file-table-cell-actions">
                        {(isTextFile(file.Key) || isImageFile(file.Key)) && (
                          <button
                            className="action-btn preview-btn"
                            onClick={() => previewFileContent(file.Key)}
                            title="预览"
                          >
                            <Icon name="eye" size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn copy-btn"
                          onClick={() => getFileUrl(file.Key)}
                          title="复制 URL"
                        >
                          <Icon name="link" size={14} />
                        </button>
                        <button
                          className="action-btn download-btn"
                          onClick={() => downloadFile(file.Key)}
                          title="下载"
                        >
                          <Icon name="download" size={14} />
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => deleteFile(file.Key)}
                          title="删除"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 文件预览对话框 */}
        {(previewLoading || previewFile) && (
          <div className="preview-overlay" onClick={() => {
            if (!previewLoading) {
              setPreviewFile(null);
              // 如果是图片且使用了 blob URL，需要释放
              if (previewFile && previewFile.type === 'image' && previewFile.content.startsWith('blob:')) {
                URL.revokeObjectURL(previewFile.content);
              }
            }
          }}>
            <div className="preview-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="preview-header">
                <h3>{previewFile?.name || '加载中...'}</h3>
                <button
                  className="btn-close"
                  onClick={() => {
                    if (!previewLoading) {
                      setPreviewFile(null);
                      // 如果是图片且使用了 blob URL，需要释放
                      if (previewFile && previewFile.type === 'image' && previewFile.content.startsWith('blob:')) {
                        URL.revokeObjectURL(previewFile.content);
                      }
                    }
                  }}
                  disabled={previewLoading}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="preview-content">
                {previewLoading ? (
                  <div className="loading-state">加载中...</div>
                ) : previewFile?.type === 'image' ? (
                  <div className="preview-image-container">
                    <img src={previewFile.content} alt={previewFile.name} className="preview-image" />
                  </div>
                ) : previewFile?.type === 'text' ? (
                  <pre className="preview-code">{previewFile.content}</pre>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <MessageToast show={showCopyToast} message={copiedUrl ? `已复制: ${copiedUrl}` : '上传成功！'} />
      </div>
    </div>
  );
};

export default R2FileManager;

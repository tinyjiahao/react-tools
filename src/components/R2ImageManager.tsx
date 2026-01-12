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

const R2ImageManager = () => {
  const [config, setConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsConfig, setSettingsConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 支持的图片格式
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];

  // 判断是否为图片文件
  const isImageFile = (fileName: string): boolean => {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  };

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

  // 列出文件
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listFiles = useCallback(async () => {
    const r2_image_config = localStorage.getItem('r2_image_config');
    if (!r2_image_config) {
      setError('未配置图片存储信息，请点击设置按钮进行配置');
      return;
    }

    const currentConfig = JSON.parse(r2_image_config) as Config;
    if (!currentConfig.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置图片存储信息');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await callWorkerApi('list', currentConfig);
      // 只显示图片文件
      const imageFiles = (result.files || []).filter((file: FileItem) => isImageFile(file.Key));
      // 按修改时间倒序排序
      imageFiles.sort((a: FileItem, b: FileItem) => {
        return new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime();
      });
      setFiles(imageFiles);
    } catch (err) {
      console.error('加载文件列表失败:', err);
      setError(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [callWorkerApi]);

  // 加载配置
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r2_image_config = localStorage.getItem('r2_image_config');
    if (r2_image_config) {
      try {
        const parsed = JSON.parse(r2_image_config);
        if (parsed.workerUrl) {
          setConfig(parsed);
          setSettingsConfig(parsed);
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
                const imageFiles = (result.files || []).filter((file: FileItem) => isImageFile(file.Key));
                imageFiles.sort((a: FileItem, b: FileItem) => {
                  return new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime();
                });
                setFiles(imageFiles);
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
          setError('未配置 Worker URL，请在设置中配置图片存储信息');
        }
      } catch (e) {
        console.error('Failed to parse config:', e);
        setError('配置读取失败，请重新配置');
      }
    } else {
      setError('未配置图片存储信息，请点击设置按钮进行配置');
    }
  }, []);

  // 上传文件
  const uploadToR2 = async () => {
    if (uploadFiles.length === 0) return;
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置图片存储信息');
      return;
    }

    // 验证文件类型
    const invalidFiles = uploadFiles.filter(file => !isImageFile(file.name));
    if (invalidFiles.length > 0) {
      setError(`只能上传图片文件，不支持的文件: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const totalProgress = Math.round(((i * e.total + e.loaded) / (uploadFiles.length * e.total)) * 100);
            setUploadProgress(totalProgress);
          }
        });

        await new Promise<void>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              resolve();
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                reject(new Error(errorData.error || '上传失败'));
              } catch {
                reject(new Error('上传失败'));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('上传失败，请检查网络连接'));
          });

          xhr.open('POST', `${config.workerUrl}?action=upload&authorization=${encodeURIComponent(config.apiToken)}`);
          xhr.send(formData);
        });
      }

      setUploadFiles([]);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      listFiles();
      setToastMessage(`成功上传 ${uploadFiles.length} 个图片！`);
      setShowToast(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 删除文件
  const deleteFile = async (key: string) => {
    if (!window.confirm(`确定要删除图片 "${key}" 吗？`)) return;
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置图片存储信息');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await callWorkerApi('delete', config, { key });
      if (selectedImage === key) {
        setSelectedImage(null);
        setImageUrl('');
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

  // 下载文件
  const downloadFile = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置图片存储信息');
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

  // 加载图片预览
  const loadImagePreview = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置图片存储信息');
      return;
    }

    setPreviewLoading(true);
    setError('');
    setSelectedImage(key);
    try {
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
        throw new Error(`加载失败 (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      setError((err as Error).message);
      setSelectedImage(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // 复制图片URL
  const copyImageUrl = async (key: string) => {
    if (!config.workerUrl) {
      setError('未配置 Worker URL');
      return;
    }

    const baseUrl = config.workerUrl.replace(/\/$/, '');
    const url = `${baseUrl}/file/${encodeURIComponent(key)}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setToastMessage('图片链接已复制！');
        setShowToast(true);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          setToastMessage('图片链接已复制！');
          setShowToast(true);
        }
      }
    } catch (err) {
      setError('复制失败');
    }
  };

  // 保存设置
  const saveSettings = () => {
    localStorage.setItem('r2_image_config', JSON.stringify(settingsConfig));
    setConfig(settingsConfig);
    setShowSettingsDialog(false);
    setToastMessage('配置已保存！');
    setShowToast(true);
    listFiles();
  };

  // 清除配置
  const clearConfig = () => {
    if (window.confirm('确定要清除图片存储配置吗？')) {
      localStorage.removeItem('r2_image_config');
      setConfig({ workerUrl: '', apiToken: '' });
      setSettingsConfig({ workerUrl: '', apiToken: '' });
      setShowSettingsDialog(false);
      setFiles([]);
      setError('未配置图片存储信息，请点击设置按钮进行配置');
      setToastMessage('配置已清除！');
      setShowToast(true);
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

  return (
    <div className="tool-container">
      <div className="r2-image-manager">
        <div className="r2-image-header">
          <h2>R2 图片管理</h2>
          <div className="r2-image-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const imageFiles = files.filter(file => isImageFile(file.name));
                if (imageFiles.length !== files.length) {
                  setError('部分文件不是图片格式，已自动过滤');
                }
                setUploadFiles(imageFiles);
              }}
              accept={imageExtensions.join(',')}
              multiple
              className="hidden-file-input"
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              title="上传图片"
            >
              <Icon name="upload" size={16} />
              上传图片
            </button>
            <button
              className="btn btn-primary"
              onClick={() => listFiles()}
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

        {/* 上传文件区域 */}
        {uploadFiles.length > 0 && (
          <div className="upload-files-area">
            <div className="upload-files-info">
              <Icon name="image" size={16} />
              <span>已选择 {uploadFiles.length} 个图片文件</span>
              <span className="upload-files-total">({formatSize(uploadFiles.reduce((sum, f) => sum + f.size, 0))})</span>
            </div>
            {uploadProgress > 0 && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
            <div className="upload-files-actions">
              <button
                className="btn btn-primary"
                onClick={uploadToR2}
                disabled={loading}
              >
                {loading ? '上传中...' : '开始上传'}
              </button>
              <button
                className="btn-close"
                onClick={() => {
                  setUploadFiles([]);
                  setUploadProgress(0);
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

        {/* 图片列表 */}
        <div className="file-list-section">
          <div className="file-list-header">
            <h3>图片列表 ({files.length} 个文件)</h3>
            <button className="btn btn-primary" onClick={() => listFiles()}>
              <Icon name="refresh" size={16} />
              刷新
            </button>
          </div>
          {loading && files.length === 0 ? (
            <div className="loading-state">加载中...</div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <Icon name="image" size={64} className="empty-icon" />
              <p>暂无图片文件</p>
              <p className="empty-hint">点击上传按钮添加图片</p>
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
                        <div className="file-table-thumbnail">
                          <img
                            src={`${config.workerUrl.replace(/\/$/, '')}/file/${encodeURIComponent(file.Key)}`}
                            alt={file.Key}
                            loading="lazy"
                            className="thumbnail-image"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.classList.add('thumbnail-load-error');
                            }}
                          />
                          <Icon name="image" size={24} className="thumbnail-fallback" />
                        </div>
                        <span className="file-name" title={file.Key}>{file.Key}</span>
                      </div>
                    </td>
                    <td>{formatSize(file.Size)}</td>
                    <td>{new Date(file.LastModified).toLocaleDateString('zh-CN')}</td>
                    <td>
                      <div className="file-table-cell-actions">
                        <button
                          className="action-btn preview-btn"
                          onClick={() => loadImagePreview(file.Key)}
                          title="预览"
                        >
                          <Icon name="eye" size={14} />
                        </button>
                        <button
                          className="action-btn copy-btn"
                          onClick={() => copyImageUrl(file.Key)}
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

        {/* 图片预览模态框 */}
        {selectedImage && (
          <div className="image-preview-overlay" onClick={() => setSelectedImage(null)}>
            <div className="image-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="image-preview-header">
                <h3>{selectedImage}</h3>
                <button
                  className="btn-close"
                  onClick={() => {
                    setSelectedImage(null);
                    setImageUrl('');
                  }}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="image-preview-content">
                {previewLoading ? (
                  <div className="preview-loading">
                    <div className="loading-spinner"></div>
                    <p>加载中...</p>
                  </div>
                ) : (
                  <img src={imageUrl} alt={selectedImage} />
                )}
              </div>
              <div className="image-preview-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => copyImageUrl(selectedImage!)}
                >
                  <Icon name="link" size={16} />
                  复制链接
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadFile(selectedImage!)}
                >
                  <Icon name="download" size={16} />
                  下载
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 设置对话框 */}
        {showSettingsDialog && (
          <div className="settings-overlay" onClick={() => setShowSettingsDialog(false)}>
            <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>图片存储配置</h2>
                <button
                  className="btn-close"
                  onClick={() => setShowSettingsDialog(false)}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="settings-content">
                <div className="settings-section">
                  <p className="settings-desc">
                    配置 Cloudflare Workers 和 R2 存储的连接信息（独立于通用文件管理）
                  </p>

                  <div className="settings-form">
                    <div className="form-group">
                      <label htmlFor="imageWorkerUrl">Workers URL:</label>
                      <input
                        id="imageWorkerUrl"
                        type="text"
                        value={settingsConfig.workerUrl}
                        onChange={(e) => setSettingsConfig(prev => ({ ...prev, workerUrl: e.target.value }))}
                        placeholder="https://your-worker.your-subdomain.workers.dev"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="imageApiToken">API Token (可选):</label>
                      <input
                        id="imageApiToken"
                        type="text"
                        value={settingsConfig.apiToken}
                        onChange={(e) => setSettingsConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                        placeholder="用于验证请求的可选 Token"
                      />
                    </div>
                    <div className="settings-actions">
                      <button className="btn btn-primary" onClick={saveSettings}>
                        <Icon name="refresh" size={16} />
                        保存配置
                      </button>
                      {settingsConfig.workerUrl && (
                        <button className="btn btn-secondary" onClick={clearConfig}>
                          <Icon name="trash" size={16} />
                          清除配置
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="settings-info">
                    <h4>配置说明</h4>
                    <p>此配置独立于通用 R2 文件管理，可使用不同的 Worker 和存储桶。</p>
                    <p>支持上传的图片格式：JPG、PNG、GIF、WebP、SVG、BMP、ICO</p>
                  </div>
                </div>
              </div>
              <div className="settings-footer">
                <button className="btn" onClick={() => setShowSettingsDialog(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <MessageToast show={showToast} message={toastMessage} />
    </div>
  );
};

export default R2ImageManager;

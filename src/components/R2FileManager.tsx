import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageToast from './MessageToast';
import Icon from './Icon';
import type { Config, FileItem } from '../lib/types';
import { STORAGE_KEYS, safeGetConfig } from '../lib/storage';
import { callWorkerApi, uploadWithProgress } from '../lib/r2Api';

interface DirectoryItem {
  name: string;
  path: string;
}

const R2FileManager = () => {
  const [config, setConfig] = useState<Config>({ workerUrl: '', apiToken: '' });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{ file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string; type: 'text' | 'image' | 'html' | 'pdf' } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string>('');
  const [newFileName, setNewFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [uploadDirectory, setUploadDirectory] = useState('');
  const [showDirInput, setShowDirInput] = useState(false);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [previewPanelVisible, setPreviewPanelVisible] = useState(false);

  // 调用 Workers API —— 使用共享封装（见 src/lib/r2Api.ts），参数顺序 (action, config, body)
  // 本地包装保留 (action, body, currentConfig) 形式以减少本组件内改动
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callApi = useCallback(async (action: string, body?: Record<string, unknown>, currentConfig: Config = config) => {
    return callWorkerApi(action, currentConfig, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.workerUrl, config.apiToken]);

  // 列出文件
  const listFiles = useCallback(async (directory: string = '', currentConfig = config) => {
    if (!currentConfig.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const prefix = directory ? (directory.endsWith('/') ? directory : `${directory}/`) : '';
      const result = await callApi('list', { prefix }, currentConfig);

      // 过滤出当前目录下的文件和子目录
      const allFiles = result.files || [];
      const currentFiles: FileItem[] = [];
      const dirSet = new Set<string>();

      allFiles.forEach((file: FileItem) => {
        const key = file.Key;

        // 跳过与当前目录前缀完全相同的 key（目录本身）
        // 例如：在 "resume/" 目录下，跳过 key="resume" 或 key="resume/" 的项
        if (key === prefix || key === prefix.replace(/\/$/, '') || key + '/' === prefix) {
          return;
        }

        // 只处理以当前目录前缀开头的文件
        if (prefix && !key.startsWith(prefix)) {
          return;
        }

        // 计算相对路径
        const relativePath = prefix ? key.substring(prefix.length) : key;
        const firstSlashIndex = relativePath.indexOf('/');

        if (firstSlashIndex === -1) {
          // 当前目录下的文件
          currentFiles.push(file);
        } else {
          // 子目录
          const dirName = relativePath.substring(0, firstSlashIndex);
          // 跳过空目录名和与当前目录同名的目录
          if (dirName && dirName !== currentDirectory) {
            dirSet.add(dirName);
          }
        }
      });

      setFiles(currentFiles);
      setDirectories(
        Array.from(dirSet).sort().map(name => ({
          name,
          path: prefix + name
        }))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [config, callWorkerApi, currentDirectory]);

  // 加载配置（仅在挂载时执行一次）
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
    setConfig(currentConfig);
    // 配置加载后由下面的目录 effect 负责拉取列表，这里不再重复请求
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当目录变化时重新加载文件列表（统一的数据源，避免并发重复请求）
  useEffect(() => {
    if (!config.workerUrl) return;
    listFiles(currentDirectory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDirectory, config.workerUrl, config.apiToken]);

  // 上传单个文件
  const uploadSingleFile = (file: File, queueIndex: number): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);

    // 构建完整路径（目录 + 文件名）
    const directory = uploadDirectory.trim();
    const fileName = file.name;
    const fullPath = directory ? `${directory}/${fileName}` : fileName;

    formData.append('path', fullPath);

    return uploadWithProgress(config, formData, (percentComplete) => {
      setUploadQueue(prev => prev.map((item, idx) =>
        idx === queueIndex ? { ...item, progress: percentComplete } : item
      ));
    }).then(() => {
      setUploadQueue(prev => prev.map((item, idx) =>
        idx === queueIndex ? { ...item, status: 'success', progress: 100 } : item
      ));
    }).catch((err: Error) => {
      setUploadQueue(prev => prev.map((item, idx) =>
        idx === queueIndex ? { ...item, status: 'error', error: err.message } : item
      ));
      throw err;
    });
  };

  // 上传文件（批量）
  const uploadToR2 = async () => {
    if (uploadFiles.length === 0) return;
    if (!config.workerUrl) {
      setError('未配置 Worker URL，请在设置中配置 R2 存储信息');
      return;
    }

    setIsUploading(true);
    setError('');

    // 初始化上传队列
    const initialQueue = uploadFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const
    }));
    setUploadQueue(initialQueue);

    // 用局部变量累计成功/失败数量（避免读取闭包里的旧 uploadQueue 状态）
    let successCount = 0;
    let failedCount = 0;

    // 串行上传每个文件
    for (let i = 0; i < initialQueue.length; i++) {
      setUploadQueue(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'uploading' as const } : item
      ));

      try {
        await uploadSingleFile(initialQueue[i].file, i);
        successCount++;
      } catch (err) {
        // 单个文件失败不影响其他文件继续上传
        failedCount++;
        console.error(`文件 ${initialQueue[i].file.name} 上传失败:`, err);
      }
    }

    // 上传完成后刷新文件列表
    setTimeout(() => {
      listFiles(currentDirectory);
      setIsUploading(false);

      // 基于局部变量如实反映上传结果（修复之前永远报"成功"的 bug）
      if (failedCount > 0) {
        setError(`部分文件上传失败：${successCount}/${uploadFiles.length} 成功`);
      } else {
        setCopiedUrl(`成功上传 ${uploadFiles.length} 个文件！`);
        setShowCopyToast(true);
      }

      // 清空上传队列和文件列表
      setUploadFiles([]);
      setUploadQueue([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
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
      await callApi('delete', { key });
      listFiles();
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

    // 从 localStorage 读取最新配置（safeGetConfig 带容错）
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
      const oldKey = renamingFile;
      // 保持目录结构（如果有）
      const lastSlashIndex = oldKey.lastIndexOf('/');
      const prefix = lastSlashIndex >= 0 ? oldKey.substring(0, lastSlashIndex + 1) : '';
      const newKey = prefix + newFileName;

      await callApi('rename', { oldKey, newKey }, currentConfig);

      setShowRenameDialog(false);
      setNewFileName('');
      setRenamingFile('');
      listFiles();
      setShowCopyToast(true);
      setCopiedUrl('重命名成功！');
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (err) {
      setError(`重命名失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // 打开重命名对话框
  const openRenameDialog = (key: string) => {
    // 提取纯文件名（去掉目录前缀）
    const fileName = key.includes('/') ? key.substring(key.lastIndexOf('/') + 1) : key;
    setRenamingFile(key);
    setNewFileName(fileName);
    setShowRenameDialog(true);
    setError('');
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

      // 获取文件名（从key中提取纯文件名，去掉目录前缀）
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = key.includes('/') ? key.substring(key.lastIndexOf('/') + 1) : key;
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
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
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
      'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less',
      'md', 'markdown', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config',
      'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp',
      'go', 'rs', 'swift', 'kt', 'scala', 'groovy', 'lua', 'r', 'sql', 'graphql',
      'vue', 'svelte', 'webc', 'astro', 'htaccess', 'env', 'gitignore', 'dockerignore'
    ];
    return textExtensions.includes(ext);
  };

  // 检测是否为HTML文件
  const isHtmlFile = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['html', 'htm'].includes(ext);
  };

  // 检测是否为PDF文件
  const isPdfFile = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ext === 'pdf';
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
      } else if (isHtmlFile(key)) {
        // HTML文件处理 - 使用blob URL以便在iframe中渲染
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

        // 限制预览文件大小为 10MB
        const maxSize = 10 * 1024 * 1024;
        if (fileSize > maxSize) {
          throw new Error(`文件过大 (${formatSize(fileSize)})，超过预览限制 (10MB)，请下载后查看`);
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

        const html = await response.text();
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        setPreviewFile({ name: key, content: blobUrl, type: 'html' });
      } else if (isPdfFile(key)) {
        // PDF文件处理 - 使用blob URL以便在iframe中预览
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

        // 限制预览文件大小为 50MB
        const maxSize = 50 * 1024 * 1024;
        if (fileSize > maxSize) {
          throw new Error(`文件过大 (${formatSize(fileSize)})，超过预览限制 (50MB)，请下载后查看`);
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

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewFile({ name: key, content: blobUrl, type: 'pdf' });
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

  // 拖拽事件处理
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 检查是否真正离开了拖放区域
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadFiles(files);
      setError('');
    }
  };

  // 点击上传区域触发文件选择
  const handleUploadAreaClick = () => {
    if (uploadFiles.length === 0 && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 快速选择目录
  const handleSelectDirectory = (dir: string) => {
    setUploadDirectory(dir);
    setShowDirInput(false);
  };

  // 进入目录
  const enterDirectory = (dirPath: string) => {
    setCurrentDirectory(dirPath);
    setUploadDirectory(dirPath); // 同时更新上传目录
    // 文件列表由 [currentDirectory] effect 统一拉取，此处不再手动调用，
    // 否则会与 effect 触发的请求并发，快速点击时出现错乱
  };

  // 返回上级目录
  const goUpDirectory = () => {
    if (!currentDirectory) return;
    const lastSlashIndex = currentDirectory.lastIndexOf('/');
    const parentDir = lastSlashIndex > 0 ? currentDirectory.substring(0, lastSlashIndex) : '';
    setCurrentDirectory(parentDir);
    setUploadDirectory(parentDir); // 同时更新上传目录
    // 同上，列表由 effect 统一拉取
  };

  // 获取面包屑路径
  const getBreadcrumbs = () => {
    if (!currentDirectory) return [{ name: '根目录', path: '' }];
    const parts = currentDirectory.split('/');
    const breadcrumbs = [{ name: '根目录', path: '' }];
    let path = '';
    parts.forEach((part, index) => {
      path += (index > 0 ? '/' : '') + part;
      breadcrumbs.push({ name: part, path });
    });
    return breadcrumbs;
  };

  // 获取唯一的目录列表
  const getUniqueDirectories = (): string[] => {
    const directories = new Set<string>();
    files.forEach((file: FileItem) => {
      const key = file.Key;
      const lastSlashIndex = key.lastIndexOf('/');
      if (lastSlashIndex > 0) {
        const dir = key.substring(0, lastSlashIndex);
        directories.add(dir);
      }
    });
    return Array.from(directories).sort();
  };

  return (
    <div className="tool-container r2-file-manager-layout">
      <h2>R2 文件管理工具</h2>
      <div className="tool-content r2-split-layout">
        {/* 左侧：文件列表区域 */}
        <div className="file-list-section r2-left-panel">
          {/* 文件列表头部 - 包含面包屑和操作按钮 */}
          <div className="file-list-header">
            <div className="file-list-title">
              {/* 面包屑导航 */}
              {currentDirectory || directories.length > 0 ? (
                <div className="breadcrumb-list">
                  {getBreadcrumbs().map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      {index > 0 && <span className="breadcrumb-separator">/</span>}
                      <button
                        className="breadcrumb-item"
                        onClick={() => enterDirectory(crumb.path)}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <h3>根目录</h3>
              )}
              <span className="file-count"> ({files.length} 个文件{directories.length > 0 ? `, ${directories.length} 个目录` : ''})</span>
            </div>
            <div className="file-list-actions">
              <button
                className="btn btn-primary btn-small"
                onClick={() => setShowUploadDialog(true)}
                title="上传文件"
              >
                <Icon name="upload" size={14} />
                上传文件
              </button>
              {currentDirectory && (
                <button
                  className="btn btn-secondary btn-small"
                  onClick={goUpDirectory}
                  title="返回上级目录"
                >
                  <Icon name="arrow-left" size={14} />
                  上级
                </button>
              )}
              <button className="btn btn-primary btn-small" onClick={() => listFiles(currentDirectory)}>
                <Icon name="refresh" size={14} />
                刷新
              </button>
            </div>
          </div>

          {/* 错误提示 - 显示在文件列表区域 */}
          {error && (
            <div className="error-message">
              <Icon name="warning" size={18} className="error-icon" />
              {error}
            </div>
          )}

          {loading && files.length === 0 && directories.length === 0 ? (
            <div className="loading-state">加载中...</div>
          ) : files.length === 0 && directories.length === 0 ? (
            <div className="empty-state">
              <Icon name="box" size={64} className="empty-icon" />
              <p>暂无文件</p>
            </div>
          ) : (
            <div className="file-list-table-wrapper">
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
                {/* 目录列表 */}
                {directories.map((dir) => (
                  <tr key={`dir-${dir.path}`} className="directory-row">
                    <td>
                      <div
                        className="file-table-cell directory-cell"
                        onClick={() => enterDirectory(dir.path)}
                      >
                        <Icon name="folder" size={18} className="file-icon directory-icon" />
                        <span className="file-name directory-name">{dir.name}</span>
                      </div>
                    </td>
                    <td>-</td>
                    <td>-</td>
                    <td>
                      <div className="file-table-cell-actions">
                        <button
                          className="action-btn"
                          onClick={() => enterDirectory(dir.path)}
                          title="进入目录"
                        >
                          <Icon name="arrow-right" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* 文件列表 */}
                {files.map((file) => (
                  <tr key={file.Key}>
                    <td>
                      <div className="file-table-cell">
                        <Icon name={getFileIconName(file.Key)} size={18} className="file-icon" />
                        <span className="file-name" title={file.Key}>{file.Key.includes('/') ? file.Key.substring(file.Key.lastIndexOf('/') + 1) : file.Key}</span>
                      </div>
                    </td>
                    <td>{formatSize(file.Size)}</td>
                    <td>{formatDate(file.LastModified)}</td>
                    <td>
                      <div className="file-table-cell-actions">
                        {(isTextFile(file.Key) || isImageFile(file.Key) || isHtmlFile(file.Key) || isPdfFile(file.Key)) && (
                          <button
                            className="action-btn preview-btn"
                            onClick={() => {
                              setPreviewPanelVisible(true);
                              previewFileContent(file.Key);
                            }}
                            title="预览"
                          >
                            <Icon name="eye" size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn rename-btn"
                          onClick={() => openRenameDialog(file.Key)}
                          title="重命名"
                        >
                          <Icon name="edit" size={14} />
                        </button>
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
            </div>
          )}
        </div>

        {/* 右侧：预览面板 */}
        <div className={`preview-panel r2-right-panel ${previewPanelVisible ? 'visible' : ''}`}>
          {previewLoading ? (
            <div className="preview-loading">
              <div className="loading-state">加载中...</div>
            </div>
          ) : previewFile ? (
            <div className="preview-content-wrapper">
              <div className="preview-panel-header">
                <h3 className="preview-file-name">{previewFile.name}</h3>
                <button
                  className="btn-close"
                  onClick={() => {
                    setPreviewFile(null);
                    setPreviewPanelVisible(false);
                    // 如果是图片、HTML或PDF且使用了 blob URL，需要释放
                    if ((previewFile.type === 'image' || previewFile.type === 'html' || previewFile.type === 'pdf') && previewFile.content.startsWith('blob:')) {
                      URL.revokeObjectURL(previewFile.content);
                    }
                  }}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="preview-panel-content">
                {previewFile.type === 'image' ? (
                  <div className="preview-image-container">
                    <img src={previewFile.content} alt={previewFile.name} className="preview-image" />
                  </div>
                ) : previewFile.type === 'html' ? (
                  <iframe
                    src={previewFile.content}
                    className="preview-html"
                    title={previewFile.name}
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : previewFile.type === 'pdf' ? (
                  <object
                    data={previewFile.content}
                    type="application/pdf"
                    className="preview-pdf"
                    title={previewFile.name}
                  >
                    <div className="preview-pdf-fallback">
                      <p>PDF 文件预览</p>
                      <a href={previewFile.content} download={previewFile.name.includes('/') ? previewFile.name.substring(previewFile.name.lastIndexOf('/') + 1) : previewFile.name} className="btn btn-primary">
                        下载 PDF 文件
                      </a>
                    </div>
                  </object>
                ) : previewFile.type === 'text' ? (
                  <pre className="preview-code">{previewFile.content}</pre>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="preview-empty">
              <Icon name="eye" size={64} className="preview-empty-icon" />
              <p>点击预览按钮查看文件内容</p>
            </div>
          )}
        </div>

        {/* 上传文件对话框 */}
        {showUploadDialog && (
          <div className="upload-dialog-overlay" onClick={() => setShowUploadDialog(false)}>
            <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="upload-dialog-header">
                <h3>上传文件</h3>
                <button
                  className="btn-close"
                  onClick={() => setShowUploadDialog(false)}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className="upload-dialog-content">
                {/* 错误提示 */}
                {error && (
                  <div className="error-message">
                    <Icon name="warning" size={18} className="error-icon" />
                    {error}
                  </div>
                )}

                {/* 目录选择 */}
                <div className="directory-selector">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setShowDirInput(!showDirInput)}
                  >
                    <Icon name="folder" size={14} />
                    {showDirInput ? '隐藏目录' : '指定目录'}
                  </button>
                  {showDirInput && (
                    <div className="directory-input-wrapper">
                      <input
                        type="text"
                        value={uploadDirectory}
                        onChange={(e) => setUploadDirectory(e.target.value)}
                        placeholder="例如: documents/images"
                        className="directory-input"
                      />
                      <span className="directory-hint">输入目录路径（可选）</span>
                      {getUniqueDirectories().length > 0 && (
                        <div className="directory-quick-select">
                          <span className="directory-hint">或选择现有目录:</span>
                          <div className="directory-list">
                            {getUniqueDirectories().map(dir => (
                              <button
                                key={dir}
                                className="btn btn-directory btn-small"
                                onClick={() => handleSelectDirectory(dir)}
                              >
                                <Icon name="folder" size={12} />
                                {dir}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  ref={dropZoneRef}
                  className={`upload-area ${isDragging ? 'dragging' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={handleUploadAreaClick}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                    className="file-input"
                    multiple
                  />
                  {uploadFiles.length === 0 ? (
                    <div className="upload-prompt">
                      <Icon name="upload" size={48} className="upload-icon" />
                      <p>拖拽文件到此处，或点击选择文件</p>
                      <p className="upload-hint">支持多文件上传</p>
                      {uploadDirectory && (
                        <p className="directory-preview">
                          将上传到: <strong>{uploadDirectory}</strong>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="selected-files-list">
                      {uploadFiles.map((file, index) => {
                        const queueItem = uploadQueue[index];
                        const progress = queueItem?.progress || 0;
                        const status = queueItem?.status || 'pending';

                        return (
                          <div key={index} className={`selected-file ${status}`}>
                            <Icon name={getFileIconName(file.name)} size={18} />
                            <div className="selected-file-info">
                              <span className="selected-file-name">{file.name}</span>
                              {uploadDirectory && (
                                <span className="selected-file-path">→ {uploadDirectory}/</span>
                              )}
                              <span className="file-size">({formatSize(file.size)})</span>
                              {status === 'uploading' && progress > 0 && (
                                <span className="file-progress">{progress}%</span>
                              )}
                              {status === 'success' && (
                                <span className="file-success">✓ 上传成功</span>
                              )}
                              {status === 'error' && (
                                <span className="file-error" title={queueItem?.error}>✗ 上传失败</span>
                              )}
                            </div>
                            {!isUploading && (
                              <button
                                className="btn-close"
                                onClick={() => {
                                  setUploadFiles(uploadFiles.filter((_, i) => i !== index));
                                  if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                  }
                                }}
                              >×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="upload-dialog-footer">
                <button
                  className="btn"
                  onClick={() => {
                    if (!isUploading) {
                      setShowUploadDialog(false);
                      setUploadFiles([]);
                      setUploadQueue([]);
                    }
                  }}
                  disabled={isUploading}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={uploadToR2}
                  disabled={uploadFiles.length === 0 || isUploading}
                >
                  {isUploading
                    ? `上传中... (${uploadQueue.filter(q => q.status === 'success').length}/${uploadFiles.length})`
                    : `开始上传 (${uploadFiles.length} 个文件)`
                  }
                </button>
              </div>
            </div>
          </div>
        )}

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
                    value={renamingFile.includes('/') ? renamingFile.substring(renamingFile.lastIndexOf('/') + 1) : renamingFile}
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
                    placeholder="输入新文件名"
                    autoFocus
                  />
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

        <MessageToast show={showCopyToast} message={copiedUrl ? `已复制: ${copiedUrl}` : '上传成功！'} />
      </div>
    </div>
  );
};

export default R2FileManager;

import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ThemeColor {
  name: string;
  value: string;
  icon: string;
}

const themeColors: ThemeColor[] = [
  { name: '橙色', value: '#F6821F', icon: '🟠' },
  { name: '蓝色', value: '#0066FF', icon: '🔵' },
  { name: '绿色', value: '#00C853', icon: '🟢' },
  { name: '紫色', value: '#9C27B0', icon: '🟣' },
  { name: '红色', value: '#E53935', icon: '🔴' },
  { name: '青色', value: '#00BCD4', icon: '🔷' },
];

interface R2Config {
  workerUrl: string;
  apiToken: string;
}

// Worker 代码示例
const workerCode = `export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    // CORS 预检请求处理 - 必须在最前面
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 设置 CORS 响应头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    // 验证 Token (可选)
    const token = url.searchParams.get('authorization') ||
                  request.headers.get('Authorization')?.replace('Bearer ', '');
    if (env.API_TOKEN && token !== env.API_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    try {
      // 直接访问文件 (通过 Worker 代理) - 必须在 action 检查之前
      if (url.pathname.startsWith('/file/')) {
        // 验证 Token (从 Authorization header 获取)
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (env.API_TOKEN && token !== env.API_TOKEN) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        const key = decodeURIComponent(url.pathname.substring(6)); // 去掉 '/file/' 前缀
        const object = await env.R2_BUCKET.get(key);

        if (!object) {
          return new Response('File not found', {
            status: 404,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000'); // 缓存 1 年
        headers.set('Access-Control-Allow-Origin', '*'); // 添加 CORS 头

        // 设置 Content-Disposition 以便浏览器正确处理文件名
        const encodedFilename = encodeURIComponent(key);
        headers.set('Content-Disposition', \`attachment; filename="\${encodedFilename}"\`);

        return new Response(object.body, { headers });
      }

      // 列出文件
      if (action === 'list') {
        const listed = await env.R2_BUCKET.list();
        return Response.json({
          files: listed.objects.map(obj => ({
            Key: obj.key,
            Size: obj.size,
            LastModified: obj.uploaded.toISOString(),
            ETag: obj.etag
          }))
        }, { headers: corsHeaders });
      }

      // 上传文件
      if (action === 'upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400, headers: corsHeaders
          });
        }
        await env.R2_BUCKET.put(file.name, file.stream(), {
          httpMetadata: { contentType: file.type }
        });
        return Response.json({ success: true, key: file.name }, { headers: corsHeaders });
      }

      // 删除文件
      if (action === 'delete' && request.method === 'POST') {
        const { key } = await request.json();
        await env.R2_BUCKET.delete(key);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        error: 'Invalid action',
        availableActions: ['list', 'upload', 'delete'],
        note: '文件下载直接访问 /file/{key} 路径，需在 Authorization header 中携带 token'
      }), {
        status: 400,
        headers: corsHeaders,
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message || 'Unknown error'
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }
};`;

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [themeColor, setThemeColor] = useState<string>(() => {
    return localStorage.getItem('themeColor') || '#F6821F';
  });
  const [r2Config, setR2Config] = useState<R2Config>({
    workerUrl: '',
    apiToken: '',
  });
  const [activeTab, setActiveTab] = useState<'theme' | 'r2' | 'worker-code'>('theme');
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    // 加载 R2 配置
    const savedConfig = localStorage.getItem('r2_config');
    if (savedConfig) {
      try {
        setR2Config(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Failed to parse R2 config:', e);
      }
    }
  }, []);

  useEffect(() => {
    // 应用主题颜色
    document.documentElement.style.setProperty('--cf-orange', themeColor);
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  const handleColorChange = (color: string) => {
    setThemeColor(color);
  };

  const handleR2ConfigChange = (field: keyof R2Config, value: string) => {
    setR2Config(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveR2Config = () => {
    localStorage.setItem('r2_config', JSON.stringify(r2Config));
  };

  const handleClearR2Config = () => {
    if (window.confirm('确定要清除 R2 配置吗？')) {
      localStorage.removeItem('r2_config');
      setR2Config({ workerUrl: '', apiToken: '' });
      window.location.reload();
    }
  };

  // 复制 Worker 代码到剪贴板
  const copyWorkerCode = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(workerCode);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      } else {
        // 备选方法：使用 document.execCommand
        const textArea = document.createElement('textarea');
        textArea.value = workerCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          setCodeCopied(true);
          setTimeout(() => setCodeCopied(false), 2000);
        }
      }
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'theme' ? 'active' : ''}`}
            onClick={() => setActiveTab('theme')}
          >
            <Icon name="sidebar-left" size={16} />
            主题设置
          </button>
          <button
            className={`settings-tab ${activeTab === 'r2' ? 'active' : ''}`}
            onClick={() => setActiveTab('r2')}
          >
            <Icon name="cloud" size={16} />
            R2 存储
          </button>
          <button
            className={`settings-tab ${activeTab === 'worker-code' ? 'active' : ''}`}
            onClick={() => setActiveTab('worker-code')}
          >
            <Icon name="file" size={16} />
            Worker 代码
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'theme' && (
            <div className="settings-section">
              <h3>主题颜色</h3>
              <p className="settings-desc">选择您喜欢的主题颜色，将应用到整个网站</p>
              <div className="color-grid">
                {themeColors.map((color) => (
                  <button
                    key={color.value}
                    className={`color-option ${themeColor === color.value ? 'active' : ''}`}
                    onClick={() => handleColorChange(color.value)}
                    title={color.name}
                    style={{ backgroundColor: color.value }}
                  >
                    <span className="color-icon">{color.icon}</span>
                    {themeColor === color.value && (
                      <span className="check-mark">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'r2' && (
            <div className="settings-section">
              <h3>R2 存储配置</h3>
              <p className="settings-desc">
                配置 Cloudflare Workers 和 R2 存储的连接信息
              </p>

              <div className="settings-form">
                <div className="form-group">
                  <label htmlFor="workerUrl">Workers URL:</label>
                  <input
                    id="workerUrl"
                    type="text"
                    value={r2Config.workerUrl}
                    onChange={(e) => handleR2ConfigChange('workerUrl', e.target.value)}
                    placeholder="https://your-worker.your-subdomain.workers.dev"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="apiToken">API Token (可选):</label>
                  <input
                    id="apiToken"
                    type="text"
                    value={r2Config.apiToken}
                    onChange={(e) => handleR2ConfigChange('apiToken', e.target.value)}
                    placeholder="用于验证请求的可选 Token"
                  />
                </div>
                <div className="settings-actions">
                  <button className="btn btn-primary" onClick={handleSaveR2Config}>
                    <Icon name="refresh" size={16} />
                    保存配置
                  </button>
                  {r2Config.workerUrl && (
                    <button className="btn btn-secondary" onClick={handleClearR2Config}>
                      <Icon name="trash" size={16} />
                      清除配置
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-info">
                <h4>配置说明</h4>
                <p>首次使用需要部署 Cloudflare Workers 作为 R2 的代理服务器。</p>
                <p>详细配置步骤请查看 Worker 代码选项卡。</p>
              </div>
            </div>
          )}

          {activeTab === 'worker-code' && (
            <div className="settings-section">
              <h3>Workers 代码示例</h3>
              <p className="settings-desc">
                将此代码部署到 Cloudflare Workers，作为 R2 存储的代理服务器
              </p>
              <div className="worker-code-container">
                <button
                  className="btn-copy-code"
                  onClick={copyWorkerCode}
                  title="复制代码"
                >
                  <Icon name={codeCopied ? 'check' : 'copy'} size={14} />
                  {codeCopied ? '已复制' : '复制代码'}
                </button>
                <pre className="code-block">{workerCode}</pre>
              </div>
              <div className="settings-info">
                <h4>部署步骤</h4>
                <ol>
                  <li>登录 Cloudflare Dashboard</li>
                  <li>进入 Workers & Pages → 创建 Worker</li>
                  <li>粘贴上述代码并保存</li>
                  <li>在 Worker 设置中绑定 R2 存储桶</li>
                  <li>配置自定义域名（可选）</li>
                  <li>复制 Worker URL 到 R2 存储配置</li>
                </ol>
                <h4>wrangler.toml 配置</h4>
                <pre className="mini-code-block">
{`[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"

[vars]
# API_TOKEN 通过 wrangler secret 命令设置更安全`}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;

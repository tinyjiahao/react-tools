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
// Worker 代码示例。
// 真正的、持续维护的 Worker 源码位于仓库的 docs/worker.js。
// 这里不再内嵌完整副本（旧副本曾与 docs/worker.js 漂移、含已修复的安全问题），
// 改为引导用户复制 docs/worker.js 的内容部署。
const workerCode = `// 请复制仓库中 docs/worker.js 的完整内容部署到 Cloudflare Worker。
//
// docs/worker.js 是唯一维护来源，包含：
//   - fail-closed 鉴权（未配置 API_TOKEN 时拒绝所有写操作）
//   - token 仅从 Authorization header 读取（不再进 URL，避免泄露进日志）
//   - CORS 来源白名单（环境变量 ALLOWED_ORIGINS）
//   - 可变内容（notes/、markdown_file/）不长期缓存
//   - list 分页、重命名原子性、上传大小上限、key 安全校验
//
// 需要的环境变量 / 绑定：
//   R2_BUCKET      —— R2 存储桶绑定（必填）
//   API_TOKEN      —— 访问令牌（必填）
//   ALLOWED_ORIGINS—— 允许的跨域来源，逗号分隔（生产必填，如 https://your-app.pages.dev）
`;

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

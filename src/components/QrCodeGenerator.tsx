import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface HistoryItem {
  id: string;
  url: string;
  timestamp: number;
  note?: string;
}

const QrCodeGenerator = () => {
  const [url, setUrl] = useState<string>('https://www.example.com');
  const [size, setSize] = useState<number>(256);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [fgColor, setFgColor] = useState<string>('#000000');
  const [includeMargin, setIncludeMargin] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('qr_history');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
        // 如果有历史记录，自动填充最新的一条
        if (parsedHistory.length > 0) {
          setUrl(parsedHistory[0].url);
        }
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }
  }, []);

  // 保存历史记录
  const addToHistory = (newUrl: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      url: newUrl,
      timestamp: Date.now(),
    };

    setHistory((prev) => {
      // 过滤掉重复的 URL，只保留最新的
      const filtered = prev.filter((item) => item.url !== newUrl);
      const newHistory = [newItem, ...filtered].slice(0, 100); // 只保留最近 100 条
      localStorage.setItem('qr_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id);
      localStorage.setItem('qr_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const updateHistoryNote = (id: string, note: string) => {
    setHistory((prev) => {
      const newHistory = prev.map((item) =>
        item.id === id ? { ...item, note } : item
      );
      localStorage.setItem('qr_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('qr_history');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证URL格式
    try {
      new URL(url);
    } catch (err) {
      setError('请输入有效的URL地址');
      return;
    }

    // 验证URL长度
    if (url.length > 2000) {
      setError('URL过长，无法生成二维码。建议使用URL缩短服务。');
      return;
    }

    addToHistory(url);
  };

  const downloadQRCode = () => {
    if (error) {
      alert('请先解决错误再下载');
      return;
    }

    const canvas = document.getElementById('qr-code-canvas') as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'qrcode.png';
      link.href = url;
      link.click();
    }
  };

  // 检查URL是否过长
  const isUrlTooLong = url.length > 2000;

  return (
    <div className="tool-container">
      <h2>URL转二维码工具</h2>
      <div className="qr-layout">
        <div className="qr-config">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="url">URL地址:</label>
              <textarea
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="请输入URL地址，例如: https://www.example.com"
                rows={3}
              />
              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
              {url.length > 1000 && !error && (
                <div className="warning-message">
                  <span className="warning-icon">⚠️</span>
                  URL较长 ({url.length} 字符)，可能无法生成二维码
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="size">尺寸: {size}px</label>
              <input
                type="range"
                id="size"
                min="100"
                max="500"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bgColor">背景颜色:</label>
                <input
                  type="color"
                  id="bgColor"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="fgColor">前景颜色:</label>
                <input
                  type="color"
                  id="fgColor"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={includeMargin}
                  onChange={(e) => setIncludeMargin(e.target.checked)}
                />
                包含边距
              </label>
            </div>

            <div className="button-section">
              <button type="submit">生成二维码</button>
              <button
                type="button"
                onClick={downloadQRCode}
                disabled={isUrlTooLong}
              >
                下载二维码
              </button>
            </div>
          </form>
        </div>

        <div className="qr-preview">
          <h3>二维码预览:</h3>
          <div className="qr-code-container">
            {!isUrlTooLong ? (
              <QRCodeCanvas
                id="qr-code-canvas"
                value={url}
                size={size}
                bgColor={bgColor}
                fgColor={fgColor}
                includeMargin={includeMargin}
                level="H" // 容错级别
              />
            ) : (
              <div className="error-state">
                <div className="error-icon">❌</div>
                <p>URL过长，无法生成二维码</p>
                <p className="error-desc">
                  当前URL长度: {url.length} 字符<br/>
                  建议使用URL缩短服务
                </p>
              </div>
            )}
          </div>
          <p className="qr-url-display">URL: {url}</p>
        </div>
      </div>

      {history.length > 0 && (
        <div className="history-section">
          <div className="history-header">
            <h3>历史记录</h3>
            <button onClick={clearHistory} className="clear-btn">清空历史</button>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item" onClick={() => setUrl(item.url)}>
                <div className="history-content">
                  <div className="history-url" title={item.url}>{item.url}</div>
                  <div className="history-meta">
                    <span className="history-time">{new Date(item.timestamp).toLocaleString()}</span>
                    {item.note && <span className="history-note" title={item.note}>{item.note}</span>}
                  </div>
                </div>
                <div className="history-actions">
                  <button
                    className="action-btn edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newNote = prompt('请输入备注', item.note || '');
                      if (newNote !== null) {
                        updateHistoryNote(item.id, newNote);
                      }
                    }}
                    title="修改备注"
                  >
                    ✎
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteHistoryItem(item.id);
                    }}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QrCodeGenerator;
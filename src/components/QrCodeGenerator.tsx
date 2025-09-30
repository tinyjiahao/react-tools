import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

const QrCodeGenerator = () => {
  const [url, setUrl] = useState<string>('https://www.example.com');
  const [size, setSize] = useState<number>(256);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [fgColor, setFgColor] = useState<string>('#000000');
  const [includeMargin, setIncludeMargin] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

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
    </div>
  );
};

export default QrCodeGenerator;

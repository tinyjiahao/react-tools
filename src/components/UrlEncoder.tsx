import React, { useState } from 'react';
import MessageToast from './MessageToast';

const UrlEncoder = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);

  const encodeUrl = () => {
    try {
      // 解析URL，只对参数值进行编码
      const url = new URL(input);
      const searchParams = new URLSearchParams(url.search);

      // 对每个参数值进行编码
      const encodedParams = new URLSearchParams();
      searchParams.forEach((value, key) => {
        encodedParams.set(key, encodeURI(value));
      });

      // 构建新的URL，保持其他部分不变
      const encodedUrl = new URL(url);
      encodedUrl.search = encodedParams.toString();

      setOutput(encodedUrl.toString());
      setError('');
    } catch (err) {
      // 如果不是完整的URL，尝试对整个字符串进行编码
      try {
        const encoded = encodeURI(input);
        setOutput(encoded);
        setError('');
      } catch (fallbackErr) {
        setError('URL编码失败');
        setOutput('');
      }
    }
  };

  const decodeUrl = () => {
    try {
      const decoded = decodeURIComponent(input);
      setOutput(decoded);
      setError('');
    } catch (err) {
      setError('URL解码失败，请检查输入是否为有效的编码URL');
      setOutput('');
    }
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setShowCopyToast(true);
    }
  };

  return (
    <div className="tool-container">
      <h2>URL编解码工具</h2>
      <div className="tool-content">
        <div className="diff-inputs">
          <div className="text-section">
            <h3>输入URL</h3>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入需要编码或解码的URL..."
              rows={8}
            />
          </div>
          <div className="text-section">
            <h3>输出结果</h3>
            <textarea
              value={output}
              readOnly
              placeholder="编码或解码后的结果将显示在这里..."
              rows={8}
            />
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <div className="button-section">
          <button onClick={encodeUrl}>URL编码</button>
          <button onClick={decodeUrl}>URL解码</button>
          <button onClick={clearAll}>清空</button>
          <button
            onClick={copyToClipboard}
            disabled={!output}
          >
            复制结果
          </button>
        </div>

        <div className="info-section">
          <h3>使用说明：</h3>
          <ul>
            <li><strong>URL编码</strong>：将URL中的特殊字符转换为%加十六进制格式</li>
            <li><strong>URL解码</strong>：将编码后的URL还原为原始格式</li>
            <li>支持中文、空格、特殊符号等字符的编码和解码</li>
          </ul>
        </div>

        {/* 复制成功提示 */}
        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default UrlEncoder;

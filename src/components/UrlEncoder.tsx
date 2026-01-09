import React, { useState, useEffect } from 'react';
import MessageToast from './MessageToast';
import Icon from './Icon';

interface HistoryItem {
  id: string;
  input: string;
  output: string;
  type: 'encode' | 'decode';
  timestamp: number;
  note?: string;
}

const UrlEncoder = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('url_history');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
        // 如果有历史记录，自动填充最新的一条
        if (parsedHistory.length > 0) {
          const latest = parsedHistory[0];
          setInput(latest.input);
          setOutput(latest.output);
        }
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }
  }, []);

  // 保存历史记录
  const addToHistory = (inputStr: string, outputStr: string, type: 'encode' | 'decode') => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      input: inputStr,
      output: outputStr,
      type,
      timestamp: Date.now(),
    };

    setHistory((prev) => {
      // 过滤掉重复的记录（输入和输出都相同）
      const filtered = prev.filter((item) => item.input !== inputStr || item.output !== outputStr);
      const newHistory = [newItem, ...filtered].slice(0, 100); // 只保留最近 100 条
      localStorage.setItem('url_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id);
      localStorage.setItem('url_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const updateHistoryNote = (id: string, note: string) => {
    setHistory((prev) => {
      const newHistory = prev.map((item) =>
        item.id === id ? { ...item, note } : item
      );
      localStorage.setItem('url_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('url_history');
  };

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
      addToHistory(input, encodedUrl.toString(), 'encode');
    } catch (err) {
      // 如果不是完整的URL，尝试对整个字符串进行编码
      try {
        const encoded = encodeURI(input);
        setOutput(encoded);
        setError('');
        addToHistory(input, encoded, 'encode');
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
      addToHistory(input, decoded, 'decode');
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
            <Icon name="warning" size={18} className="error-icon" />
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
            title="复制结果"
          >
            复制
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

        {history.length > 0 && (
          <div className="history-section">
            <div className="history-header">
              <h3>历史记录</h3>
              <button onClick={clearHistory} className="clear-btn">清空历史</button>
            </div>
            <div className="history-list">
              {history.map((item) => (
                <div 
                  key={item.id} 
                  className="history-item" 
                  onClick={() => {
                    setInput(item.input);
                    setOutput(item.output);
                  }}
                >
                  <div className="history-content">
                    <div className="history-url" title={item.input}>
                      <span className={`operation-tag ${item.type}`}>
                        {item.type === 'encode' ? '编码' : '解码'}
                      </span>
                      {item.input}
                    </div>
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

        {/* 复制成功提示 */}
        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default UrlEncoder;
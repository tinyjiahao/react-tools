import React, { useState, useEffect } from 'react';
import pako from 'pako';
import SnappyJS from 'snappyjs';
import MessageToast from './MessageToast';
import Icon from './Icon';

type CompressionType = 'none' | 'gzip' | 'snappy';

interface HistoryItem {
  id: string;
  input: string;
  output: string;
  type: 'encode' | 'decode';
  compression: CompressionType;
  timestamp: number;
}

const Base64Encoder = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [compression, setCompression] = useState<CompressionType>('gzip');
  const [error, setError] = useState<string>('');
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('base64_history');
    if (savedHistory) {
      try {
        const parsedHistory: HistoryItem[] = JSON.parse(savedHistory);
        setHistory(parsedHistory);
        if (parsedHistory.length > 0) {
          const latest = parsedHistory[0];
          setInput(latest.input);
          setOutput(latest.output);
          setCompression(latest.compression);
        }
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  const saveHistory = (inputStr: string, outputStr: string, type: 'encode' | 'decode') => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      input: inputStr,
      output: outputStr,
      type,
      compression,
      timestamp: Date.now(),
    };

    const newHistory = [newItem, ...history].slice(0, 100);
    setHistory(newHistory);
    localStorage.setItem('base64_history', JSON.stringify(newHistory));
  };

  // 辅助函数：Uint8Array 转 Base64
  const uint8ToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // 辅助函数：Base64 转 Uint8Array
  const base64ToUint8 = (base64: string): Uint8Array => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // 辅助函数：字符串转 Uint8Array
  const stringToUint8 = (str: string): Uint8Array => {
    return new TextEncoder().encode(str);
  };

  // 辅助函数：Uint8Array 转字符串
  const uint8ToString = (bytes: Uint8Array): string => {
    return new TextDecoder().decode(bytes);
  };

  const handleEncode = () => {
    try {
      setError('');
      if (!input) {
        setOutput('');
        return;
      }

      const inputBytes = stringToUint8(input);
      let compressedBytes: Uint8Array;

      switch (compression) {
        case 'gzip':
          compressedBytes = pako.gzip(inputBytes);
          break;
        case 'snappy':
          // snappyjs 需要 ArrayBuffer
          const snappyBuffer = SnappyJS.compress(inputBytes.buffer as ArrayBuffer);
          compressedBytes = new Uint8Array(snappyBuffer);
          break;
        case 'none':
        default:
          compressedBytes = inputBytes;
          break;
      }

      const base64 = uint8ToBase64(compressedBytes);
      setOutput(base64);
      saveHistory(input, base64, 'encode');
    } catch (err) {
      console.error(err);
      setError('编码/压缩失败: ' + (err as Error).message);
      setOutput('');
    }
  };

  const handleDecode = () => {
    try {
      setError('');
      if (!input) {
        setOutput('');
        return;
      }

      // 先 Base64 解码
      let compressedBytes: Uint8Array;
      try {
        compressedBytes = base64ToUint8(input);
      } catch (e) {
        throw new Error('无效的 Base64 字符串');
      }

      let decompressedBytes: Uint8Array;

      switch (compression) {
        case 'gzip':
          decompressedBytes = pako.ungzip(compressedBytes);
          break;
        case 'snappy':
          // snappyjs 需要 ArrayBuffer
          const snappyBuffer = SnappyJS.uncompress(compressedBytes.buffer as ArrayBuffer);
          decompressedBytes = new Uint8Array(snappyBuffer);
          break;
        case 'none':
        default:
          decompressedBytes = compressedBytes;
          break;
      }

      const resultStr = uint8ToString(decompressedBytes);
      setOutput(resultStr);
      saveHistory(input, resultStr, 'decode');
    } catch (err) {
      console.error(err);
      setError('解码/解压失败: ' + (err as Error).message);
      setOutput('');
    }
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setShowCopyToast(true);
    }
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="tool-container">
      <h2>Base64 压缩编码工具</h2>
      <div className="tool-content">
        <div className="diff-inputs">
          <div className="text-section">
            <h3>输入文本</h3>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入需要处理的文本..."
              rows={8}
            />
          </div>
          <div className="text-section">
            <h3>输出结果</h3>
            <textarea
              value={output}
              readOnly
              placeholder="处理结果将显示在这里..."
              rows={8}
            />
          </div>
        </div>

        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <label style={{ fontWeight: 500 }}>压缩算法:</label>
          <select
            value={compression}
            onChange={(e) => setCompression(e.target.value as CompressionType)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
          >
            <option value="gzip">Gzip</option>
            <option value="snappy">Snappy</option>
            <option value="none">无 (仅Base64)</option>
          </select>
        </div>

        {error && (
          <div className="error-message">
            <Icon name="warning" size={18} className="error-icon" />
            {error}
          </div>
        )}

        <div className="button-section">
          <button onClick={handleEncode}>压缩并编码</button>
          <button onClick={handleDecode}>解码并解压</button>
          <button onClick={clearAll}>清空</button>
          <button
            onClick={copyToClipboard}
            disabled={!output}
            title="复制结果"
          >
            <Icon name="copy" size={16} />
          </button>
        </div>

        <div className="info-section">
          <h3>使用说明：</h3>
          <ul>
            <li><strong>压缩并编码</strong>：先使用选定的算法压缩文本，然后将压缩后的二进制数据转换为 Base64 字符串。</li>
            <li><strong>解码并解压</strong>：先将 Base64 字符串转换为二进制数据，然后使用选定的算法解压还原文本。</li>
            <li>支持 <strong>Gzip</strong>, <strong>Snappy</strong> 等常见压缩格式。</li>
          </ul>
        </div>

        <div className="history-section" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>历史记录 (最近100条)</h3>
            <button 
              onClick={() => {
                setHistory([]);
                localStorage.removeItem('base64_history');
              }}
              style={{ fontSize: '12px', padding: '4px 8px', cursor: 'pointer' }}
            >
              清空历史
            </button>
          </div>
          <div className="history-list" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
            {history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>暂无历史记录</div>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id} 
                  className="history-item"
                  onClick={() => {
                    setInput(item.input);
                    setOutput(item.output);
                    setCompression(item.compression);
                  }}
                  style={{ 
                    padding: '10px', 
                    borderBottom: '1px solid #eee', 
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    backgroundColor: '#fff'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
                    <span>{item.type === 'encode' ? '编码' : '解码'} ({item.compression})</span>
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#333' }}>
                    {item.input.substring(0, 100)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default Base64Encoder;
import React, { useState, useCallback } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';

function buildCurl(url: string, paramsText: string, headersText: string): string {
  // Parse params (JSON object or key=value lines)
  let fullUrl = url.trim();
  if (paramsText.trim()) {
    let params: Record<string, string> = {};
    try {
      params = JSON.parse(paramsText.trim());
    } catch {
      // Try key=value or key: value line format
      for (const line of paramsText.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        const colonIdx = trimmed.indexOf(':');
        let key = '', val = '';
        if (eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
          key = trimmed.slice(0, eqIdx).trim();
          val = trimmed.slice(eqIdx + 1).trim();
        } else if (colonIdx !== -1) {
          key = trimmed.slice(0, colonIdx).trim();
          val = trimmed.slice(colonIdx + 1).trim();
        } else {
          continue;
        }
        params[key] = val;
      }
    }
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }
  }

  // Parse headers (JSON object or Key: Value line format)
  let headers: Record<string, string> = {};
  if (headersText.trim()) {
    try {
      headers = JSON.parse(headersText.trim());
    } catch {
      for (const line of headersText.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (key) headers[key] = val;
      }
    }
  }

  const headerParts = Object.entries(headers)
    .map(([k, v]) => `-H '${k}:${v}'`)
    .join(' ');

  const parts = ['curl -i'];
  if (headerParts) parts.push(headerParts);
  parts.push(`'${fullUrl}'`);

  return parts.join(' ');
}

export default function CurlBuilder() {
  const [url, setUrl] = useState('https://mapi.dianping.com/mapi/searchshop.api');
  const [params, setParams] = useState('');
  const [headers, setHeaders] = useState('');
  const [result, setResult] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastShow(false);
    setTimeout(() => setToastShow(true), 10);
  };

  const handleGenerate = useCallback(() => {
    if (!url.trim()) {
      setErrorMessage('请输入URL');
      return;
    }
    setErrorMessage('');
    try {
      const curl = buildCurl(url, params, headers);
      setResult(curl);
    } catch (e) {
      setErrorMessage(`生成失败: ${(e as Error).message}`);
    }
  }, [url, params, headers]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    // 复制失败时也要给用户反馈（之前 reject 没有 .catch，toast 永不显示）
    navigator.clipboard.writeText(result)
      .then(() => showToast('已复制到剪贴板'))
      .catch(() => showToast('复制失败，请手动复制'));
  }, [result]);

  const handleClear = useCallback(() => {
    setUrl('');
    setParams('');
    setHeaders('');
    setResult('');
    setErrorMessage('');
  }, []);

  return (
    <div className="tool-container">
      <MessageToast show={toastShow} message={toastMessage} />

      <div className="tool-header">
        <h2 className="tool-title">
          <Icon name="url" size={20} className="tool-title-icon" />
          cURL 构建器
        </h2>
        <p className="tool-description">输入 URL、请求参数和 Headers，生成 cURL 命令（参数自动编码拼接到 URL）</p>
      </div>

      <div className="curl-builder-layout">
        {/* Left: inputs */}
        <div className="curl-builder-inputs">
          <div className="form-group">
            <label className="form-label">URL</label>
            <input
              className="form-input"
              type="text"
              placeholder="https://example.com/api"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Params
              <span className="form-label-hint">JSON 对象 或 key=value 每行一个</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder={'{"keyword": "海底捞", "cityId": 1}\n或\nkeyword=海底捞\ncityId=1'}
              value={params}
              onChange={e => setParams(e.target.value)}
              rows={8}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Headers
              <span className="form-label-hint">JSON 对象 或 Key: Value 每行一个</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder={'{"token": "abc123", "user-agent": "MApi 1.4"}\n或\ntoken: abc123\nuser-agent: MApi 1.4'}
              value={headers}
              onChange={e => setHeaders(e.target.value)}
              rows={10}
            />
          </div>

          {errorMessage && (
            <div style={{ color: 'var(--cf-red, #e74c3c)', fontSize: 13, marginTop: -8 }}>
              {errorMessage}
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleGenerate}>
              <Icon name="activity" size={16} />
              生成 cURL
            </button>
            <button className="btn btn-secondary" onClick={handleClear}>
              清空
            </button>
          </div>
        </div>

        {/* Right: output */}
        <div className="curl-builder-output">
          <div className="output-header">
            <label className="form-label">生成结果</label>
            {result && (
              <button className="btn-icon" onClick={handleCopy} title="复制">
                <Icon name="copy" size={16} />
              </button>
            )}
          </div>
          <textarea
            className="form-textarea"
            readOnly
            value={result}
            placeholder="点击「生成 cURL」后结果显示在这里"
            rows={20}
          />
        </div>
      </div>
    </div>
  );
}

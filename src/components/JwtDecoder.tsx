import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface JwtState {
  token: string;
}

const DEFAULT_STATE: JwtState = { token: '' };

// base64url → 普通字符串（UTF-8 安全）
const decodeBase64Url = (input: string): string => {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  // 补齐到 4 的倍数
  while (s.length % 4) s += '=';
  const binary = atob(s);
  // 处理 UTF-8（atob 返回的是 binary string）
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

interface DecodedJwt {
  header: unknown;
  payload: unknown;
  signature: string;
}

interface ExpInfo {
  expired: boolean;
  expDate: string | null;
  remaining: string | null;
}

// 把任意值渲染为带简单着色的格式化 JSON
const renderJson = (value: unknown, indent = 0): ReactNode => {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string') return <span className="json-string">"{value}"</span>;
  if (typeof value === 'number') return <span className="json-number">{value}</span>;
  if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <span>
        {'[\n'}
        {value.map((v, i) => (
          <span key={i}>
            {padInner}{renderJson(v, indent + 1)}{i < value.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {pad}{']'}
      </span>
    );
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <span>
        {'{\n'}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {padInner}<span className="json-key">"{k}"</span>{': '}{renderJson(v, indent + 1)}{i < entries.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {pad}{'}'}
      </span>
    );
  }
  return <span>{String(value)}</span>;
};

const JwtDecoder = () => {
  const [token, setToken] = useState<string>(() =>
    safeGetJSON<JwtState>(STORAGE_KEYS.jwtDecoder, DEFAULT_STATE).token
  );

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.jwtDecoder, JSON.stringify({ token }));
  }, [token]);

  // 解析结果
  const result = (() => {
    const trimmed = token.trim();
    if (!trimmed) return { kind: 'empty' as const };
    const parts = trimmed.split('.');
    if (parts.length !== 3) return { kind: 'error' as const, message: 'JWT 应为 3 段（header.payload.signature），用 . 分隔' };
    try {
      const header = JSON.parse(decodeBase64Url(parts[0]));
      const payload = JSON.parse(decodeBase64Url(parts[1]));
      const decoded: DecodedJwt = { header, payload, signature: parts[2] };
      return { kind: 'ok' as const, decoded };
    } catch (e) {
      return { kind: 'error' as const, message: `解码失败: ${(e as Error).message}` };
    }
  })();

  // exp 校验
  const expInfo = (() => {
    if (result.kind !== 'ok') return null;
    const payload = result.decoded.payload as Record<string, unknown> | null;
    if (!payload || typeof payload.exp !== 'number') {
      return { expired: false, expDate: null, remaining: null } as ExpInfo;
    }
    const expMillis = payload.exp * 1000;
    const now = Date.now();
    const expired = now >= expMillis;
    const diff = Math.abs(expMillis - now);
    const remaining = diff > 86400000
      ? `${Math.floor(diff / 86400000)} 天`
      : `${Math.floor(diff / 3600000)} 小时 ${Math.floor((diff % 3600000) / 60000)} 分`;
    return { expired, expDate: new Date(expMillis).toLocaleString('zh-CN', { hour12: false }), remaining };
  })();

  const alg = result.kind === 'ok'
    ? ((result.decoded.header as Record<string, unknown>)?.alg as string ?? '未知')
    : '';

  return (
    <div className="tool-container">
      <h2>JWT 解码器</h2>
      <div className="tool-content jwt-decoder">
        <textarea
          className="jwt-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 JWT (eyJ...)"
          spellCheck={false}
        />

        <div className="jwt-output">
          {result.kind === 'empty' && <p className="jwt-hint">粘贴 JWT 开始解码</p>}
          {result.kind === 'error' && (
            <div className="jwt-error"><Icon name="warning" size={16} /> {result.message}</div>
          )}
          {result.kind === 'ok' && (
            <>
              <div className="jwt-meta">
                <span className="jwt-meta-item">算法: <strong>{alg}</strong></span>
                {expInfo && expInfo.expDate && (
                  <span className={`jwt-exp ${expInfo.expired ? 'expired' : 'valid'}`}>
                    {expInfo.expired
                      ? `已过期（${expInfo.expDate}）`
                      : `有效，剩余 ${expInfo.remaining}（${expInfo.expDate}）`}
                  </span>
                )}
              </div>
              <div className="jwt-segment jwt-header">
                <h4>Header</h4>
                <pre className="json-view">{renderJson(result.decoded.header)}</pre>
              </div>
              <div className="jwt-segment jwt-payload">
                <h4>Payload</h4>
                <pre className="json-view">{renderJson(result.decoded.payload)}</pre>
              </div>
              <div className="jwt-segment jwt-signature">
                <h4>Signature</h4>
                <code className="mono">{result.decoded.signature || '(空)'}</code>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JwtDecoder;

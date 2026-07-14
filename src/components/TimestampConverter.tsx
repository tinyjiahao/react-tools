import { useState, useEffect } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface TsState {
  timestampInput: string;
}

const DEFAULT_STATE: TsState = { timestampInput: '' };

// 把时间戳规范化为毫秒数：10 位按秒、13 位按毫秒
const toMillis = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!isFinite(num)) return null;
  return trimmed.length <= 10 ? num * 1000 : num;
};

const formatDate = (date: Date): string => {
  return date.toLocaleString('zh-CN', { hour12: false });
};

const TimestampConverter = () => {
  const [timestampInput, setTimestampInput] = useState<string>(() =>
    safeGetJSON<TsState>(STORAGE_KEYS.timestampConverter, DEFAULT_STATE).timestampInput
  );
  const [dateInput, setDateInput] = useState<string>('');
  const [now, setNow] = useState<number>(Date.now());
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.timestampConverter, JSON.stringify({ timestampInput }));
  }, [timestampInput]);

  // 当前时间戳每秒刷新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 时间戳 → 日期结果
  const tsResult = (() => {
    if (!timestampInput.trim()) return null;
    const millis = toMillis(timestampInput);
    if (millis === null) return { error: '请输入纯数字时间戳' };
    const date = new Date(millis);
    if (isNaN(date.getTime())) return { error: '时间戳超出有效范围' };
    return {
      local: formatDate(date),
      utc: date.toISOString(),
      seconds: Math.floor(millis / 1000),
      millis,
    };
  })();

  // 日期 → 时间戳结果
  const dateResult = (() => {
    if (!dateInput) return null;
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return { error: '无效日期' };
    return {
      seconds: Math.floor(date.getTime() / 1000),
      millis: date.getTime(),
      local: formatDate(date),
    };
  })();

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制: ${text}`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  const useNow = () => {
    const ms = Date.now();
    setTimestampInput(String(ms));
  };

  return (
    <div className="tool-container">
      <h2>时间戳转换器</h2>
      <div className="tool-content timestamp-converter">
        <div className="ts-now-bar">
          <span className="ts-now-label">当前时间戳</span>
          <span className="ts-now-value mono">{now}</span>
          <button className="btn btn-secondary btn-small" onClick={useNow}>填入</button>
          <button className="btn btn-secondary btn-small" onClick={() => copyText(String(now))}>
            <Icon name="copy" size={14} /> 复制
          </button>
        </div>

        <div className="ts-columns">
          <div className="ts-col">
            <h3>时间戳 → 日期</h3>
            <input
              type="text"
              className="ts-input mono"
              value={timestampInput}
              onChange={(e) => setTimestampInput(e.target.value)}
              placeholder="输入 Unix 时间戳（秒或毫秒）"
            />
            <p className="ts-hint">10 位按秒、13 位按毫秒，自动识别</p>
            {tsResult && 'error' in tsResult && <div className="ts-error">{tsResult.error}</div>}
            {tsResult && !('error' in tsResult) && (
              <div className="ts-result-card">
                <div className="ts-row"><label>本地时间</label><span>{tsResult.local}</span></div>
                <div className="ts-row"><label>UTC (ISO)</label><span className="mono">{tsResult.utc}</span></div>
                <div className="ts-row">
                  <label>秒级</label>
                  <span className="mono">{tsResult.seconds}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(tsResult.seconds))}><Icon name="copy" size={12} /></button>
                </div>
                <div className="ts-row">
                  <label>毫秒级</label>
                  <span className="mono">{tsResult.millis}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(tsResult.millis))}><Icon name="copy" size={12} /></button>
                </div>
              </div>
            )}
          </div>

          <div className="ts-col">
            <h3>日期 → 时间戳</h3>
            <input
              type="datetime-local"
              className="ts-input"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
            />
            <p className="ts-hint">选择本地日期时间</p>
            {dateResult && 'error' in dateResult && <div className="ts-error">{dateResult.error}</div>}
            {dateResult && !('error' in dateResult) && (
              <div className="ts-result-card">
                <div className="ts-row"><label>本地时间</label><span>{dateResult.local}</span></div>
                <div className="ts-row">
                  <label>秒级</label>
                  <span className="mono">{dateResult.seconds}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(dateResult.seconds))}><Icon name="copy" size={12} /></button>
                </div>
                <div className="ts-row">
                  <label>毫秒级</label>
                  <span className="mono">{dateResult.millis}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyText(String(dateResult.millis))}><Icon name="copy" size={12} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <MessageToast show={showCopyToast} message={copiedText} />
    </div>
  );
};

export default TimestampConverter;

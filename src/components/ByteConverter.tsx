import React, { useState } from 'react';
import MessageToast from './MessageToast';
import Icon from './Icon';

type ByteUnit = 'bit' | 'byte' | 'kb' | 'mb' | 'gb' | 'tb';

interface UnitInfo {
  name: string;
  multiplier: number;
}

const unitInfo: Record<ByteUnit, UnitInfo> = {
  'bit': { name: 'bit (b)', multiplier: 1 },
  'byte': { name: 'byte (B)', multiplier: 8 },
  'kb': { name: 'kilobyte (KB)', multiplier: 8 * 1024 },
  'mb': { name: 'megabyte (MB)', multiplier: 8 * 1024 * 1024 },
  'gb': { name: 'gigabyte (GB)', multiplier: 8 * 1024 * 1024 * 1024 },
  'tb': { name: 'terabyte (TB)', multiplier: 8 * 1024 * 1024 * 1024 * 1024 }
};

interface TsField {
  label: string;
  value: string;
  wide?: boolean;
  color?: string;
}

const formatTimestamp = (ts: number): TsField[] | null => {
  // 自动判断秒级还是毫秒级
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return [
    { label: '本地时间', value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, wide: true, color: '#3b82f6' },
    { label: '年', value: String(d.getFullYear()), color: '#10b981' },
    { label: '月', value: String(d.getMonth() + 1), color: '#f59e0b' },
    { label: '日', value: String(d.getDate()), color: '#8b5cf6' },
    { label: '时', value: String(d.getHours()), color: '#ef4444' },
    { label: '分', value: String(d.getMinutes()), color: '#ec4899' },
    { label: '秒', value: String(d.getSeconds()), color: '#14b8a6' },
    { label: '星期', value: weekDays[d.getDay()], color: '#f97316' },
    { label: '毫秒', value: String(d.getMilliseconds()), color: '#06b6d4' },
    { label: 'UTC 时间', value: d.toUTCString(), wide: true, color: '#6366f1' },
    { label: 'ISO 8601', value: d.toISOString(), wide: true, color: '#84cc16' },
  ];
};

const ByteConverter = () => {
  const [baseBits, setBaseBits] = useState<number | null>(null);
  const [lastEditedUnit, setLastEditedUnit] = useState<ByteUnit | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);
  const [tsInput, setTsInput] = useState<string>('');
  const [tsResult, setTsResult] = useState<TsField[] | null>(null);
  const [tsError, setTsError] = useState<string>('');

  // 1 TB in bits for example
  const exampleBits = 8 * 1024 * 1024 * 1024 * 1024;

  const formatNumber = (num: number): string => {
    if (num === 0) return '0';
    if (Math.abs(num) < 0.0001) {
      return num.toExponential(4);
    }
    if (Math.abs(num) >= 1000000000000000) { // 非常大的数用科学计数法
      return num.toExponential(4);
    }
    // 移除末尾的0
    return parseFloat(num.toFixed(10)).toString();
  };

  const handleInputChange = (unit: ByteUnit, value: string) => {
    setLastEditedUnit(unit);
    setInputValue(value);

    if (!value.trim()) {
      setBaseBits(null);
      return;
    }

    const num = parseFloat(value);
    if (!isNaN(num)) {
      setBaseBits(num * unitInfo[unit].multiplier);
    }
  };

  const getDisplayValue = (unit: ByteUnit) => {
    if (unit === lastEditedUnit) {
      return inputValue;
    }
    if (baseBits === null) return '';
    const val = baseBits / unitInfo[unit].multiplier;
    return formatNumber(val);
  };

  const getExampleValue = (unit: ByteUnit) => {
    const val = exampleBits / unitInfo[unit].multiplier;
    return Math.floor(val);
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    setShowCopyToast(true);
  };

  const handleTsConvert = () => {
    const raw = tsInput.trim();
    if (!raw) { setTsError('请输入时间戳'); setTsResult(null); return; }
    const num = Number(raw);
    if (isNaN(num) || !isFinite(num)) { setTsError('请输入有效的数字时间戳'); setTsResult(null); return; }
    const result = formatTimestamp(num);
    if (!result) { setTsError('时间戳超出有效范围'); setTsResult(null); return; }
    setTsError('');
    setTsResult(result);
  };

  const handleTsNow = () => {
    const now = Date.now();
    setTsInput(String(now));
    setTsError('');
    setTsResult(formatTimestamp(now));
  };

  return (
    <div className="tool-container">
      <h2>字节转换工具</h2>
      <div className="tool-content">
        <div className="converter-list">
          {(Object.keys(unitInfo) as ByteUnit[]).map((key) => {
            const unit = key as ByteUnit;
            const displayValue = getDisplayValue(unit);
            
            return (
              <div key={unit} className="converter-row">
                <label className="unit-label">{unitInfo[unit].name}:</label>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="unit-input"
                    value={displayValue}
                    onChange={(e) => handleInputChange(unit, e.target.value)}
                    placeholder="0"
                  />
                  {displayValue && (
                    <button
                      className="row-copy-btn"
                      onClick={() => copyToClipboard(displayValue)}
                      title="复制"
                    >
                      <Icon name="copy" size={14} />
                    </button>
                  )}
                </div>
                <span className="unit-example">例如: {getExampleValue(unit)}</span>
              </div>
            );
          })}
        </div>

        <div className="ts-converter-section">
          <h3>时间戳转换</h3>
          <div className="ts-input-row">
            <input
              type="text"
              className="ts-input"
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTsConvert()}
              placeholder="输入时间戳（秒或毫秒）"
            />
            <button className="btn-ts-convert" onClick={handleTsConvert}>转换</button>
            <button className="btn-ts-now" onClick={handleTsNow}>当前时间</button>
          </div>
          {tsError && <div className="ts-error">{tsError}</div>}
          {tsResult && (
            <div className="ts-cards-grid">
              {tsResult.map((field) => (
                <div
                  key={field.label}
                  className={`ts-card${field.wide ? ' ts-card--wide' : ''}`}
                  style={{ borderLeftColor: field.color }}
                >
                  <div className="ts-card-label">{field.label}</div>
                  <div className="ts-card-value">{field.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="info-section">
          <h3>单位说明：</h3>
          <ul>
            <li><strong>bit (b)</strong>：比特，最小的数据单位，表示二进制位</li>
            <li><strong>byte (B)</strong>：字节，1 byte = 8 bits，计算机存储的基本单位</li>
            <li><strong>kilobyte (KB)</strong>：千字节，1 KB = 1024 bytes</li>
            <li><strong>megabyte (MB)</strong>：兆字节，1 MB = 1024 KB</li>
            <li><strong>gigabyte (GB)</strong>：吉字节，1 GB = 1024 MB</li>
            <li><strong>terabyte (TB)</strong>：太字节，1 TB = 1024 GB</li>
          </ul>
        </div>

        <MessageToast show={showCopyToast} message="复制成功！" />
      </div>
    </div>
  );
};

export default ByteConverter;
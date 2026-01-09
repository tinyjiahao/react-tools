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

const ByteConverter = () => {
  const [baseBits, setBaseBits] = useState<number | null>(null);
  const [lastEditedUnit, setLastEditedUnit] = useState<ByteUnit | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);

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
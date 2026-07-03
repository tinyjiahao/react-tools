import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { ulid } from 'ulid';
import Icon from './Icon';
import MessageToast from './MessageToast';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

type IdVersion = 'uuid-v4' | 'uuid-v7' | 'ulid';

interface UuidState {
  version: IdVersion;
  count: number;
  hyphenated: boolean;
}

const DEFAULT_STATE: UuidState = { version: 'uuid-v4', count: 1, hyphenated: true };

const generateOne = (version: IdVersion, hyphenated: boolean): string => {
  let id: string;
  switch (version) {
    case 'uuid-v4': id = uuidv4(); break;
    case 'uuid-v7': id = uuidv7(); break;
    case 'ulid': id = ulid(); break;
  }
  // ULID 本身无连字符；UUID 在 hyphenated=false 时去掉
  if (!hyphenated && version !== 'ulid') {
    id = id.replace(/-/g, '');
  }
  return id;
};

const UuidGenerator = () => {
  const [state, setState] = useState<UuidState>(() =>
    safeGetJSON<UuidState>(STORAGE_KEYS.uuidGenerator, DEFAULT_STATE)
  );
  const [results, setResults] = useState<string[]>([]);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.uuidGenerator, JSON.stringify(state));
  }, [state]);

  const generate = useCallback(() => {
    const { version, count, hyphenated } = state;
    const n = Math.max(1, Math.min(100, count));
    setResults(Array.from({ length: n }, () => generateOne(version, hyphenated)));
  }, [state]);

  // 首次挂载生成一次，让用户立刻看到结果
  useEffect(() => {
    generate();
    // 故意只跑一次：依赖 generate 会在每次 state 变化时重新生成，
    // 但那是期望行为（用户改了版本/数量/连字符后想看新结果）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate]);

  const copyOne = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制: ${text}`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  const copyAll = () => {
    const text = results.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedText(`已复制 ${results.length} 个`);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  return (
    <div className="tool-container">
      <h2>UUID / ULID 生成器</h2>
      <div className="tool-content uuid-generator">
        <div className="uuid-config">
          <div className="uuid-field">
            <label>版本</label>
            <div className="uuid-version-options">
              {(['uuid-v4', 'uuid-v7', 'ulid'] as IdVersion[]).map((v) => (
                <label key={v} className={`uuid-version-chip ${state.version === v ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="id-version"
                    checked={state.version === v}
                    onChange={() => setState((s) => ({ ...s, version: v }))}
                  />
                  {v === 'uuid-v4' ? 'UUID v4' : v === 'uuid-v7' ? 'UUID v7' : 'ULID'}
                </label>
              ))}
            </div>
          </div>

          <div className="uuid-field">
            <label>数量 (1-100)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={state.count}
              onChange={(e) => setState((s) => ({ ...s, count: Number(e.target.value) || 1 }))}
              className="uuid-count-input"
            />
          </div>

          <div className="uuid-field">
            <label>连字符</label>
            <label className={`uuid-version-chip ${state.hyphenated ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={state.hyphenated}
                onChange={(e) => setState((s) => ({ ...s, hyphenated: e.target.checked }))}
                disabled={state.version === 'ulid'}
              />
              {state.hyphenated ? '保留 (-)' : '去除'}
            </label>
            {state.version === 'ulid' && <span className="uuid-hint">ULID 无连字符</span>}
          </div>

          <button className="btn btn-primary" onClick={generate}>
            <Icon name="refresh" size={14} /> 重新生成
          </button>
        </div>

        {results.length > 0 && (
          <div className="uuid-results">
            <div className="uuid-results-header">
              <span>共 {results.length} 个</span>
              <button className="btn btn-secondary btn-small" onClick={copyAll}>
                <Icon name="copy" size={14} /> 复制全部
              </button>
            </div>
            <div className="uuid-list">
              {results.map((id, i) => (
                <div key={i} className="uuid-item">
                  <span className="mono">{id}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => copyOne(id)}>
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <MessageToast show={showCopyToast} message={copiedText} />
    </div>
  );
};

export default UuidGenerator;

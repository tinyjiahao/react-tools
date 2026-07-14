import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';
import MessageToast from './MessageToast';
import { STORAGE_KEYS, safeGetJSON, safeSetItem } from '../lib/storage';

interface RegexState {
  pattern: string;
  flags: string;
  testText: string;
}

const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u', 'y'] as const;

const DEFAULT_STATE: RegexState = { pattern: '', flags: 'g', testText: '' };

const RegexTester = () => {
  const [state, setState] = useState<RegexState>(() =>
    safeGetJSON<RegexState>(STORAGE_KEYS.regexTester, DEFAULT_STATE)
  );
  const [showCopyToast, setShowCopyToast] = useState(false);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.regexTester, JSON.stringify(state));
  }, [state]);

  // 解析正则 + 匹配结果，统一在 useMemo 中计算，错误也作为结果返回
  const result = useMemo(() => {
    const { pattern, flags, testText } = state;
    if (!pattern) return { kind: 'empty' as const };
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return { kind: 'error' as const, message: (e as Error).message };
    }
    if (!testText) return { kind: 'noinput' as const };

    // 收集所有匹配 + 各匹配的捕获组
    const matches: Array<{ index: number; text: string; groups: string[] }> = [];
    if (flags.includes('g')) {
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = regex.exec(testText)) !== null && guard++ < 10000) {
        matches.push({ index: m.index, text: m[0], groups: Array.from(m).slice(1) });
        if (m.index === regex.lastIndex) regex.lastIndex++; // 防止零宽匹配死循环
      }
    } else {
      const m = regex.exec(testText);
      if (m) matches.push({ index: m.index, text: m[0], groups: Array.from(m).slice(1) });
    }
    return { kind: 'ok' as const, matches };
  }, [state]);

  // 渲染带高亮的原文：把匹配区间用 <mark> 包裹
  const highlighted = useMemo(() => {
    if (result.kind !== 'ok') return null;
    const { matches } = result;
    const text = state.testText;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.index > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, m.index)}</span>);
      nodes.push(<mark key={`m${i}`} className="regex-match">{m.text}</mark>);
      cursor = m.index + m.text.length;
    });
    if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
    return nodes;
  }, [result, state.testText]);

  const toggleFlag = (flag: string) => {
    setState((s) => ({
      ...s,
      flags: s.flags.includes(flag) ? s.flags.replace(flag, '') : s.flags + flag,
    }));
  };

  const copyResult = () => {
    if (result.kind !== 'ok') return;
    const text = result.matches.map((m) => m.text).join('\n');
    navigator.clipboard.writeText(text);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 1500);
  };

  return (
    <div className="tool-container">
      <h2>正则表达式测试器</h2>
      <div className="tool-content regex-tester">
        <div className="regex-config">
          <div className="regex-pattern-row">
            <span className="regex-slash">/</span>
            <input
              type="text"
              className="regex-pattern-input"
              value={state.pattern}
              onChange={(e) => setState((s) => ({ ...s, pattern: e.target.value }))}
              placeholder="输入正则表达式"
              spellCheck={false}
            />
            <span className="regex-slash">/{state.flags}</span>
          </div>
          <div className="regex-flags">
            {FLAG_OPTIONS.map((f) => (
              <label key={f} className={`flag-chip ${state.flags.includes(f) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={state.flags.includes(f)}
                  onChange={() => toggleFlag(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <textarea
          className="regex-text-input"
          value={state.testText}
          onChange={(e) => setState((s) => ({ ...s, testText: e.target.value }))}
          placeholder="输入待匹配文本"
          spellCheck={false}
        />

        <div className="regex-result">
          {result.kind === 'empty' && <p className="regex-hint">输入正则开始匹配</p>}
          {result.kind === 'noinput' && <p className="regex-hint">输入待匹配文本</p>}
          {result.kind === 'error' && (
            <div className="regex-error"><Icon name="warning" size={16} /> {result.message}</div>
          )}
          {result.kind === 'ok' && (
            <>
              <div className="regex-highlighted">
                {highlighted}
              </div>
              <div className="regex-stats">
                共 {result.matches.length} 个匹配
                <button className="btn btn-secondary btn-small" onClick={copyResult}>
                  <Icon name="copy" size={14} /> 复制匹配
                </button>
              </div>
              {result.matches.length > 0 && (
                <table className="regex-groups-table">
                  <thead><tr><th>#</th><th>匹配</th>{result.matches[0].groups.length > 0 && <th>捕获组</th>}</tr></thead>
                  <tbody>
                    {result.matches.slice(0, 500).map((m, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="mono">{m.text || '(空匹配)'}</td>
                        {m.groups.length > 0 && (
                          <td className="mono">{m.groups.map((g) => g || '(空)').join(' | ')}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
      <MessageToast show={showCopyToast} message="复制成功！" />
    </div>
  );
};

export default RegexTester;

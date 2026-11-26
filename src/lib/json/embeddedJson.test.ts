import { describe, expect, it } from 'vitest';
import { embeddedCandidates, applyEmbedded, formatEmbedded, validateEmbeddedDraft } from './embeddedJson';
describe('内嵌 JSON 无损编辑', () => {
  it('只替换指定的重复字段 token，保留大整数及排版', () => {
    const text = '{ "big":900719925474099312345, "content":"{\\"a\\":1}", "content":"{\\"a\\":2}" }';
    const candidates = embeddedCandidates(text);
    expect(candidates).toHaveLength(2);
    const output = applyEmbedded(text, candidates[1], '{"a":3}');
    expect(output).toBe(text.replace('2}', '3}'));
  });
  it('保留内层数字字面量、重复键及转义字符', () => {
    const text = '{"n":90071992547409931234,"n":1e999,"s":"a \\n \\t \\\\ 中文"}';
    expect(formatEmbedded(formatEmbedded(text), true)).toBe(text);
  });
  it('排除普通字符串与不完整 JSON，支持数组和特殊键', () => {
    const text = JSON.stringify({ 'a.b/"': ['{"x":1}', '123', '{bad'], content: '[1,2]' });
    const candidates = embeddedCandidates(text);
    expect(candidates).toHaveLength(2); expect(candidates[0].path).toEqual(['a.b/"', 0]);
    expect(() => embeddedCandidates('{bad')).toThrow();
  });
  it('拒绝无效子层和过期目标', () => {
    const text = '{"c":"{}"}'; const target = embeddedCandidates(text)[0];
    expect(() => applyEmbedded(text, target, '{bad')).toThrow();
    expect(() => applyEmbedded('{"c":"[]"}', target, '{}')).toThrow();
  });
  it('精确往返反斜杠、Unicode和换行', () => {
    const inner = '{"path":"C:\\\\test","s":"\\u4e2d\\n\\\""}';
    const text = JSON.stringify({ content: inner }); const target = embeddedCandidates(text)[0];
    expect(JSON.parse(applyEmbedded(text, target, formatEmbedded(inner))).content).toBe(inner);
  });
  it('草稿恢复拒绝层级不匹配', () => {
    const baseline = '{"c":"{}"}'; const target = embeddedCandidates(baseline)[0];
    expect(() => validateEmbeddedDraft({ nodeId: 'a', baseline, updatedAt: 1, layers: [{ id: '1', parent: '{}', target, initial: '{}', text: '{}' }] })).toThrow();
  });
});

it('回写去除排版空白，保留字符串值内的空格和换行', () => {
  const inner = JSON.stringify({ label: 'a  b', lines: 'first\nsecond' }, null, 2);
  const parent = JSON.stringify({ content: '{}' });
  const output = JSON.parse(applyEmbedded(parent, embeddedCandidates(parent)[0], inner)).content;
  expect(output).toBe(JSON.stringify({ label: 'a  b', lines: 'first\nsecond' }));
  expect(JSON.parse(output).lines).toBe('first\nsecond');
});
it('多层逐层回写不累积格式化换行', () => {
  const inner = '{"value":"b1"}';
  const middle = JSON.stringify({ a: inner }, null, 2);
  const updated = applyEmbedded(middle, embeddedCandidates(middle)[0], formatEmbedded(inner));
  const root = JSON.stringify({ content: middle });
  const output = JSON.parse(applyEmbedded(root, embeddedCandidates(root)[0], updated)).content;
  expect(output).toBe(JSON.stringify({ a: inner }));
});

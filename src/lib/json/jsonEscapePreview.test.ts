import { describe, expect, it } from 'vitest';
import { buildEscapePreview, jsonEscapePreview } from './jsonEscapePreview';
describe('保留转义展示开关', () => {
  it('只去掉一层转义，不把内嵌字符串变成对象', () => {
    const inner = JSON.stringify({ a: '{"b":1}' });
    const root = JSON.stringify({ content: inner });
    expect(jsonEscapePreview(root)).toBe('{"content":"' + inner + '"}');
  });
  it('解码换行、反斜杠和 Unicode，保留数字和重复键原文', () => {
    const source = '{"n":900719925474099312345,"n":1e99,"s":"a\\nb\\t\\u4e2d\\\\c"}';
    expect(jsonEscapePreview(source)).toBe('{"n":900719925474099312345,"n":1e99,"s":"a\nb\t中\\c"}');
  });
  it('无效 JSON 拒绝生成预览', () => { expect(() => jsonEscapePreview('{bad')).toThrow(); });
});

it('高亮范围基于原文，内嵌引号及换行不会拆散字符串类型', () => {
  const source = JSON.stringify({ content: '{"a":"b"}\nnext', n: 123, yes: true, empty: null });
  const preview = buildEscapePreview(source);
  expect(preview.spans.map(s => [s.kind, preview.text.slice(s.start, s.end)])).toEqual([
    ['key', '"content"'], ['string', '"{"a":"b"}\nnext"'],
    ['key', '"n"'], ['number', '123'], ['key', '"yes"'], ['boolean', 'true'], ['key', '"empty"'], ['null', 'null'],
  ]);
});

import { describe, expect, it } from 'vitest';
import { parseJsonStructure, structurePath } from './jsonStructure';
describe('JSON 面包屑结构', () => {
  it('对象与数组路径按光标位置定位，含属性名范围', () => {
    const text = '{"events":[{"details":{"name":"任务"}}]}';
    const { nodes, incomplete } = parseJsonStructure(text);
    expect(incomplete).toBe(false);
    expect(structurePath(nodes, text.indexOf('任务')).map(id => nodes[id].label)).toEqual(['$', 'events', '0', 'details', 'name']);
    expect(structurePath(nodes, text.indexOf('details')).map(id => nodes[id].label)).toEqual(['$', 'events', '0', 'details']);
  });
  it('容错解析未闭合对象，仍保留有效层级', () => {
    const text = '{"events":[{"details":{"name":"任务"';
    const tree = parseJsonStructure(text); expect(tree.incomplete).toBe(true);
    expect(structurePath(tree.nodes, text.indexOf('任务')).map(id => tree.nodes[id].label)).toContain('details');
  });
  it('UTF-16 位置与 Monaco 一致，特殊属性名和重复键不混淆', () => {
    const text = '{"😀":0,"a.b":[false,null],"x":1,"x":2}'; const { nodes } = parseJsonStructure(text);
    expect(structurePath(nodes, text.indexOf('null')).map(id => nodes[id].label)).toEqual(['$', 'a.b', '1']);
    const last = nodes[structurePath(nodes, text.lastIndexOf('2')).slice(-1)[0]]; expect(last.preview).toBe('2');
  });
  it('空内容不制造结构，原始值和空属性均可导航', () => {
    expect(parseJsonStructure('').nodes).toEqual([]);
    expect(parseJsonStructure('false').nodes[0].kind).toBe('boolean');
    expect(parseJsonStructure('{"":[]}').nodes[1].label).toBe('');
  });
  it('节点范围可以准确选中原文，兄弟分隔符归属容器', () => {
    const text = '{"a":1, "b":2}'; const { nodes } = parseJsonStructure(text);
    expect(text.slice(nodes[1].start, nodes[1].end)).toBe('"a":1');
    expect(structurePath(nodes, text.indexOf(','))).toEqual([0]);
  });
});

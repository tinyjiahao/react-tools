import { strictTree } from './embeddedJson';
import type { Node } from 'jsonc-parser';
export interface EscapePreviewSpan { start: number; end: number; kind: 'key' | 'string' | 'number' | 'boolean' | 'null' }
export interface EscapePreview { text: string; spans: EscapePreviewSpan[] }

// 按合法原文的语法节点映射高亮，避免解码后的引号被错误识别为 JSON 边界。
export function buildEscapePreview(text: string): EscapePreview {
  const root = strictTree(text); const leaves: Node[] = []; const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (['string', 'number', 'boolean', 'null'].includes(node.type)) leaves.push(node);
    else if (node.children) stack.push(...node.children);
  }
  leaves.sort((a, b) => a.offset - b.offset);
  let result = ''; let cursor = 0; const spans: EscapePreviewSpan[] = [];
  for (const node of leaves) {
    result += text.slice(cursor, node.offset);
    const start = result.length;
    result += node.type === 'string' ? '"' + node.value + '"' : text.slice(node.offset, node.offset + node.length);
    const key = node.parent?.type === 'property' && node.parent.children?.[0] === node;
    spans.push({ start, end: result.length, kind: key ? 'key' : node.type as EscapePreviewSpan['kind'] });
    cursor = node.offset + node.length;
  }
  return { text: result + text.slice(cursor), spans };
}
// 只解码一层，预览可能不是合法 JSON，不能写回正文。
export function jsonEscapePreview(text: string): string { return buildEscapePreview(text).text; }

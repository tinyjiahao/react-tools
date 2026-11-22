import { parseTree } from 'jsonc-parser';
import type { Node, ParseError } from 'jsonc-parser';
export interface JsonStructureNode { id: number; parent: number | null; label: string; kind: string; start: number; end: number; preview: string; children: number[] }
export interface JsonStructure { nodes: JsonStructureNode[]; incomplete: boolean }
export function parseJsonStructure(text: string): JsonStructure {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true });
  if (!root) return { nodes: [], incomplete: text.trim().length > 0 };
  const nodes: JsonStructureNode[] = [];
  const stack: { node: Node; parent: number | null; label: string }[] = [{ node: root, parent: null, label: '$' }];
  while (stack.length) {
    const item = stack.pop()!;
    const value = item.node.type === 'property' ? item.node.children?.[1] : item.node;
    const id = nodes.length;
    const primitive = value && value.type !== 'array' && value.type !== 'object';
    const preview = primitive ? JSON.stringify(value.value) ?? '' : '';
    nodes.push({ id, parent: item.parent, label: item.label, kind: value?.type || 'unknown', start: item.node.offset, end: item.node.offset + item.node.length, preview: preview.length > 80 ? preview.slice(0, 80) + '…' : preview, children: [] });
    if (item.parent !== null) nodes[item.parent].children.push(id);
    if (value?.type === 'object' || value?.type === 'array') {
      const children = value.children || [];
      for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: id, label: value.type === 'array' ? String(i) : String(children[i].children?.[0]?.value ?? '') });
    }
  }
  return { nodes, incomplete: errors.length > 0 };
}
export function structurePath(nodes: JsonStructureNode[], offset: number): number[] {
  if (!nodes.length) return [];
  const path = [0]; let current = nodes[0];
  while (current.children.length) {
    // 子节点按源码位置排列，光标移动只二分查找，不重新解析正文。
    let lo = 0; let hi = current.children.length - 1; let candidate = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (nodes[current.children[mid]].start <= offset) { candidate = mid; lo = mid + 1; } else hi = mid - 1; }
    if (candidate < 0) break;
    const child = nodes[current.children[candidate]];
    if (offset >= child.end) break;
    path.push(child.id); current = child;
  }
  return path;
}

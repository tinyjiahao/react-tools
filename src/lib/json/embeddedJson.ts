import { parseTree, format, applyEdits, createScanner } from 'jsonc-parser';
import type { Node, ParseError } from 'jsonc-parser';
export interface EmbeddedCandidate { start: number; propertyStart?: number; length: number; token: string; text: string; path: (string | number)[]; label: string }
export interface EmbeddedLayer { target: EmbeddedCandidate; parent: string; text: string; initial: string; id: string }
export interface EmbeddedDraft { nodeId: string; baseline: string; layers: EmbeddedLayer[]; updatedAt: number }
export function strictTree(text: string): Node {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!tree || errors.length) throw new Error(`JSON 格式无效${errors.length ? `，位置 ${errors[0].offset + 1}` : ''}`);
  return tree;
}
export function formatEmbedded(text: string, compact = false): string {
  strictTree(text);
  if (!compact) return applyEdits(text, format(text, undefined, { tabSize: 2, insertSpaces: true, eol: '\n' }));
  // jsonc-parser const enum 在 isolatedModules 下不可导入：EOF=17、空白=15、换行=14。
  const scanner = createScanner(text, false); let result = ''; let kind;
  while ((kind = scanner.scan()) !== 17) {
    if (kind !== 15 && kind !== 14) result += text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
  }
  return result;
}
export function embeddedCandidates(text: string): EmbeddedCandidate[] {
  const root = strictTree(text); const result: EmbeddedCandidate[] = [];
  const stack: { node: Node; path: (string | number)[] }[] = [{ node: root, path: [] }];
  while (stack.length) {
    const { node, path } = stack.pop()!;
    if (node.type === 'string' && /^[\s]*[\[{]/.test(node.value)) {
      try { const inner = strictTree(node.value); if (inner.type === 'object' || inner.type === 'array') result.push({ start: node.offset, propertyStart: node.parent?.type === 'property' ? node.parent.offset : node.offset, length: node.length, token: text.slice(node.offset, node.offset + node.length), text: node.value, path, label: '$' + path.map(p => `[${JSON.stringify(p)}]`).join('') }); } catch { /* 普通字符串不作为候选 */ }
    }
    if (node.type === 'object') for (const p of [...(node.children || [])].reverse()) stack.push({ node: p.children![1], path: [...path, p.children![0].value] });
    if (node.type === 'array') for (let i = (node.children?.length || 0) - 1; i >= 0; i--) stack.push({ node: node.children![i], path: [...path, i] });
  }
  return result;
}
export function applyEmbedded(parent: string, target: EmbeddedCandidate, text: string): string {
  strictTree(parent); strictTree(text);
  if (parent.slice(target.start, target.start + target.length) !== target.token) throw new Error('父层内容已变化，请重新打开内嵌 JSON');
  const next = parent.slice(0, target.start) + JSON.stringify(formatEmbedded(text, true)) + parent.slice(target.start + target.length);
  strictTree(next); return next;
}
export function validateEmbeddedDraft(value: EmbeddedDraft) {
  if (!value || typeof value.nodeId !== 'string' || typeof value.baseline !== 'string' || !Array.isArray(value.layers) || !value.layers.length || value.layers.length > 8) throw new Error('内层草稿格式无效');
  if (new TextEncoder().encode(JSON.stringify(value)).length > 5 * 1024 * 1024) throw new Error('内层草稿超过 5 MiB，请下载备份');
  let parent = value.baseline;
  for (const layer of value.layers) {
    if (typeof layer.text === 'string' && new TextEncoder().encode(layer.text).length > 1024 * 1024) throw new Error('单层内容超过 1 MiB，请下载草稿');
    if (typeof layer.text !== 'string' || typeof layer.initial !== 'string' || typeof layer.id !== 'string' || layer.parent !== parent) throw new Error('内层草稿层级无效');
    const candidate = embeddedCandidates(parent).find(c => c.start === layer.target.start && c.token === layer.target.token);
    if (!candidate) throw new Error('内层草稿目标无效');
    parent = layer.text;
  }
}

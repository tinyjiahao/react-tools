import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./jsonWorkspaceDb', () => ({ readEmbeddedDraft: vi.fn(async () => undefined), writeEmbeddedDraft: vi.fn(async () => {}), downloadJson: vi.fn() }));
import { useEmbeddedJsonSession } from './useEmbeddedJsonSession';
import { embeddedCandidates } from './embeddedJson';
import { writeEmbeddedDraft } from './jsonWorkspaceDb';
describe('内层会话', () => {
  it('逐层应用，根正文只在最终确认时修改', async () => {
    const root = JSON.stringify({ content: JSON.stringify({ content: '{"n":1}' }) }); const applyRoot = vi.fn();
    const { result } = renderHook(() => useEmbeddedJsonSession({ nodeId: 'test', root, applyRoot, flushRoot: async () => true }));
    await act(async () => {});
    act(() => result.current.open(embeddedCandidates(root)[0]));
    act(() => result.current.open(embeddedCandidates(result.current.layers[0].text)[0]));
    act(() => result.current.edit('{"n":2}'));
    await act(async () => { expect(await result.current.apply()).toBe(true); });
    expect(applyRoot).not.toHaveBeenCalled(); expect(result.current.layers).toHaveLength(1);
    await act(async () => { await result.current.apply(); });
    expect(JSON.parse(JSON.parse(JSON.parse(applyRoot.mock.calls[0][0]).content).content).n).toBe(2);
    expect(result.current.layers).toHaveLength(0);
  });
  it('根正文变化后拒绝应用，保留草稿', async () => {
    const root = '{"content":"{}"}'; const applyRoot = vi.fn();
    const { result, rerender } = renderHook(({ text }) => useEmbeddedJsonSession({ nodeId: 'test', root: text, applyRoot, flushRoot: async () => true }), { initialProps: { text: root } });
    await act(async () => {}); act(() => result.current.open(embeddedCandidates(root)[0])); act(() => result.current.edit('{"a":1}'));
    rerender({ text: '{"content":"[]"}' });
    await act(async () => { expect(await result.current.apply()).toBe(false); });
    expect(applyRoot).not.toHaveBeenCalled(); expect(result.current.layers).toHaveLength(1);
  });
  it('无效内层也保存为草稿，不能覆盖原文', async () => {
    const root = '{"content":"{}"}'; const applyRoot = vi.fn();
    const { result } = renderHook(() => useEmbeddedJsonSession({ nodeId: 'bad', root, applyRoot, flushRoot: async () => true }));
    await act(async () => {}); act(() => result.current.open(embeddedCandidates(root)[0])); act(() => result.current.edit('{bad'));
    await waitFor(() => expect(writeEmbeddedDraft).toHaveBeenCalledWith('bad', expect.objectContaining({ layers: expect.arrayContaining([expect.objectContaining({ text: '{bad' })]) })));
    await act(async () => { expect(await result.current.apply()).toBe(false); }); expect(applyRoot).not.toHaveBeenCalled();
  });
});

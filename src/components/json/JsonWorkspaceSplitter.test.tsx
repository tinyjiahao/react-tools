import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import JsonWorkspaceSplitter from './JsonWorkspaceSplitter';
it('键盘调整限制在容器允许范围，双击恢复默认宽度', () => {
  const commit = vi.fn(); render(<JsonWorkspaceSplitter width={240} max={300} onChange={() => {}} onCommit={commit} />);
  const splitter = screen.getByRole('separator');
  fireEvent.keyDown(splitter, { key: 'End' }); expect(commit).toHaveBeenLastCalledWith(300);
  fireEvent.keyDown(splitter, { key: 'Home' }); expect(commit).toHaveBeenLastCalledWith(200);
  fireEvent.doubleClick(splitter); expect(commit).toHaveBeenLastCalledWith(240);
});

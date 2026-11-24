import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import JsonFileTree from './JsonFileTree';
it('节点操作使用独立菜单且不触发选择，Esc 恢复触发按钮焦点', () => {
  const onSelect = vi.fn(); const onAction = vi.fn();
  render(<JsonFileTree nodes={[{ id: 'a', parentId: 'root', kind: 'json', name: 'a.json', createdAt: 1, updatedAt: 1 }]} selected="" expanded={[]} onExpand={() => {}} onSelect={onSelect} onAction={onAction} />);
  const trigger = screen.getByRole('button', { name: 'a.json 操作' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu'); expect(screen.getByRole('treeitem').contains(menu)).toBe(false); expect(onSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(menu, { key: 'Escape' }); expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitem', { name: '重命名' })); expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'rename');
});

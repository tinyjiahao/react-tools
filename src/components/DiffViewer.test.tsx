import { fireEvent, render, screen, within } from '@testing-library/react';
import DiffViewer from './DiffViewer';

describe('DiffViewer', () => {
  it('支持切换到按单词比较并高亮新增内容', () => {
    const { container } = render(<DiffViewer />);

    fireEvent.change(screen.getByPlaceholderText('请输入原始文本...'), {
      target: { value: 'hello world' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入新文本...'), {
      target: { value: 'hello brave world' },
    });
    fireEvent.click(screen.getByRole('button', { name: '按单词' }));

    expect(screen.getByRole('button', { name: '按单词' })).toHaveAttribute('aria-pressed', 'true');
    const oldPane = screen.getByRole('region', { name: '原始文本差异' });
    const newPane = screen.getByRole('region', { name: '新文本差异' });

    expect(within(oldPane).queryByText('brave')).not.toBeInTheDocument();
    expect(newPane.querySelector('.diff-segment-added')?.textContent).toContain('brave');
    expect(container.querySelector('.diff-inline-panes')).toBeInTheDocument();
  });

  it('支持仅展示发生变化的行', () => {
    const { container } = render(<DiffViewer />);

    fireEvent.change(screen.getByPlaceholderText('请输入原始文本...'), {
      target: { value: 'same line\nold value\nsame footer' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入新文本...'), {
      target: { value: 'same line\nnew value\nsame footer' },
    });
    fireEvent.click(screen.getByRole('button', { name: '仅看差异' }));

    expect(screen.getByRole('button', { name: '仅看差异' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.diff-output')?.textContent).toContain('old value');
    expect(container.querySelector('.diff-output')?.textContent).toContain('new value');
    expect(container.querySelector('.diff-output')?.textContent).not.toContain('same line');
    expect(container.querySelector('.diff-output')?.textContent).not.toContain('same footer');
  });
});

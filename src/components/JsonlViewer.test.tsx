import { render, screen } from '@testing-library/react';
import JsonlViewer from './JsonlViewer';

describe('JsonlViewer', () => {
  it('渲染初始上传入口', () => {
    render(<JsonlViewer />);

    expect(screen.getByRole('heading', { name: 'JSONL 查看器' })).toBeInTheDocument();
    expect(screen.getByText('拖放 JSONL 文件到这里')).toBeInTheDocument();
    expect(screen.getByText('或点击选择文件（.jsonl, .txt）')).toBeInTheDocument();
  });
});

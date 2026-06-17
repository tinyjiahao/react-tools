import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// CRA 模板默认断言 "learn react" 文案，但本项目品牌名是 "Tools"，
// 之前测试因此一直失败。更新为真实文案。
test('renders the app brand', () => {
  render(<App />);
  const brand = screen.getByText(/Tools/i);
  expect(brand).toBeInTheDocument();
});

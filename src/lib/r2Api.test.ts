import { createPdfPreviewBlob } from './r2Api';

describe('createPdfPreviewBlob', () => {
  it('为 PDF 预览强制使用正确的 MIME 类型', () => {
    const blob = createPdfPreviewBlob(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(4);
  });
});

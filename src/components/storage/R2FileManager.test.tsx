import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import R2FileManager from './R2FileManager';

describe('R2FileManager PDF preview', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.setItem('r2_config', JSON.stringify({
      workerUrl: 'https://r2-worker.example.com',
      apiToken: 'test-token',
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  });

  it('使用 application/pdf Blob 在 iframe 中预览 PDF', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:pdf-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('?action=list')) {
        return {
          ok: true,
          json: async () => ({
            files: [{ Key: 'demo.pdf', Size: 4, LastModified: '2026-08-06T00:00:00.000Z' }],
          }),
        } as Response;
      }

      if (init?.method === 'HEAD') {
        return {
          ok: true,
          headers: { get: (name: string) => name.toLowerCase() === 'content-length' ? '4' : null },
        } as Response;
      }

      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<R2FileManager />);

    expect(await screen.findByText('demo.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('预览'));

    await waitFor(() => {
      expect(container.querySelector('iframe.preview-pdf')).toHaveAttribute('src', 'blob:pdf-preview#view=FitH');
    });

    const pdfBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(pdfBlob.type).toBe('application/pdf');
  });
});

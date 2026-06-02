/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock html-to-image since it requires real DOM rendering
vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}));

describe('renderToImage', () => {
  let originalFonts;
  let mockCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFonts = document.fonts;
    document.fonts = { load: vi.fn().mockResolvedValue(undefined) };

    // Mock canvas 2d context
    mockCtx = {
      scale: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      // Simulate producing a valid PNG blob
      cb(new Blob(['png-data'], { type: 'image/png' }));
    };
  });

  afterEach(() => {
    document.fonts = originalFonts;
    vi.restoreAllMocks();
  });

  it('throws if ref is null', async () => {
    const { renderToImage } = await import('../renderToImage');
    await expect(renderToImage({ current: null }, 320, 320)).rejects.toThrow(
      'renderToImage: ref is null',
    );
  });

  it('returns blob from html-to-image when blob.size > 5000', async () => {
    const { toBlob } = await import('html-to-image');
    const { renderToImage } = await import('../renderToImage');

    const fakeBlob = { size: 15000 };
    toBlob.mockResolvedValue(fakeBlob);

    const el = document.createElement('div');
    const result = await renderToImage({ current: el }, 320, 320);

    expect(result).toBe(fakeBlob);
    expect(toBlob).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ pixelRatio: 2 }),
    );
  });

  it('falls back to canvas when html-to-image blob is too small', async () => {
    const { toBlob } = await import('html-to-image');
    const { renderToImage } = await import('../renderToImage');

    const smallBlob = { size: 100 };
    toBlob.mockResolvedValue(smallBlob);

    const el = document.createElement('div');
    el.innerHTML = '<span data-share-text>Test</span>';

    const result = await renderToImage({ current: el }, 320, 320);

    // Should be a Blob from canvas fallback
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/png');
    // Verify canvas was used
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
  });

  it('falls back to canvas when html-to-image throws', async () => {
    const { toBlob } = await import('html-to-image');
    const { renderToImage } = await import('../renderToImage');

    toBlob.mockRejectedValue(new Error('CORS failure'));

    const el = document.createElement('div');
    el.innerHTML = '<span data-share-text>Fallback</span>';

    const result = await renderToImage({ current: el }, 320, 320);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/png');
  });
});

describe('shareBlob', () => {
  let originalCanShare;
  let originalShare;
  let originalCreateObjectURL;

  beforeEach(() => {
    originalCanShare = navigator.canShare;
    originalShare = navigator.share;
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
  });

  afterEach(() => {
    navigator.canShare = originalCanShare;
    navigator.share = originalShare;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.restoreAllMocks();
  });

  it('uses download fallback when Web Share API is not available', async () => {
    const { shareBlob } = await import('../renderToImage');

    const blob = new Blob(['test'], { type: 'image/png' });

    // Remove Web Share API
    delete navigator.canShare;

    // Mock createElement to track download click
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((el) => el);
    vi.spyOn(document.body, 'removeChild').mockImplementation((el) => el);

    await shareBlob(blob, 'test.png', 'Test');

    expect(clickSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('uses Web Share API when available and supported', async () => {
    const { shareBlob } = await import('../renderToImage');

    const blob = new Blob(['test'], { type: 'image/png' });
    const shareSpy = vi.fn().mockResolvedValue(undefined);

    navigator.canShare = vi.fn().mockReturnValue(true);
    navigator.share = shareSpy;

    await shareBlob(blob, 'test.png', 'Test');

    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test' }),
    );
  });

  it('falls back to download when user aborts Web Share', async () => {
    const { shareBlob } = await import('../renderToImage');

    const blob = new Blob(['test'], { type: 'image/png' });
    const abortError = new DOMException('User cancelled', 'AbortError');

    navigator.canShare = vi.fn().mockReturnValue(true);
    navigator.share = vi.fn().mockRejectedValue(abortError);

    // Should not throw, just silently return
    await expect(shareBlob(blob, 'test.png', 'Test')).resolves.toBeUndefined();
  });
});

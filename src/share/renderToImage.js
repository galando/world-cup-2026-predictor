import { toBlob } from 'html-to-image';

/**
 * Fetch a remote image URL as an inline data URL.
 * Bypasses cross-origin restrictions for html-to-image rendering.
 * Returns the original URL as fallback on failure.
 *
 * @param {string} url
 * @returns {Promise<string>} data URL or original URL
 */
export async function fetchAsDataUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

/**
 * Preload Rubik font so html-to-image can render it.
 * Resolves when the font is ready or after a 2s timeout.
 */
async function preloadFonts() {
  try {
    await document.fonts.load('700 24px Rubik');
    await document.fonts.load('400 14px Rubik');
  } catch {
    // Font may already be loaded or unavailable; proceed anyway
  }
}

/**
 * Manual canvas-based fallback when html-to-image fails.
 * Draws a simplified version of the share card using Canvas 2D API.
 */
function renderToCanvas(el, width, height) {
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0d1f14');
  grad.addColorStop(1, '#091509');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Read text content from the DOM element for fallback rendering
  const texts = el.querySelectorAll('[data-share-text]');
  let y = 40;
  ctx.fillStyle = '#f3f7f4';
  ctx.font = '700 18px Rubik, sans-serif';
  ctx.textAlign = 'center';

  for (const t of texts) {
    ctx.fillText(t.textContent, width / 2, y);
    y += 30;
  }

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}

/**
 * Render a DOM element to a PNG blob.
 * Uses html-to-image as primary, Canvas 2D as fallback.
 *
 * @param {React.RefObject} ref - ref to the DOM element to render
 * @param {number} width - logical width in CSS pixels
 * @param {number} height - logical height in CSS pixels
 * @returns {Promise<Blob>} PNG blob
 */
export async function renderToImage(ref, width, height) {
  if (!ref?.current) {
    throw new Error('renderToImage: ref is null');
  }

  // Attempt 1: html-to-image (primary)
  try {
    await preloadFonts();
    const blob = await toBlob(ref.current, {
      pixelRatio: 2,
      skipFonts: false,
      fetchRequestInit: { mode: 'cors' },
      width,
      height,
    });
    if (blob && blob.size > 5000) return blob;
    console.warn('renderToImage: html-to-image blob too small, falling back');
  } catch (e) {
    console.warn('renderToImage: html-to-image failed, falling back to canvas', e);
  }

  // Attempt 2: manual canvas render
  return renderToCanvas(ref.current, width, height);
}

/**
 * Share a blob using Web Share API, or download as fallback.
 *
 * @param {Blob} blob - PNG blob to share
 * @param {string} filename - filename for download fallback
 * @param {string} title - share title
 * @param {string} [shareUrl] - page URL to include in the share
 */
export async function shareBlob(blob, filename = 'mundial-prediction.png', title = 'Mundial Predictor', shareUrl = '') {
  const file = new File([blob], filename, { type: 'image/png' });

  // Build share payload — include URL when provided
  const shareData = { files: [file], title };
  if (shareUrl) shareData.url = shareUrl;

  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
      console.warn('shareBlob: Web Share API failed, using download fallback', err);
    }
  }

  // Desktop fallback: download the image
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

/** Flagcdn supported widths: 20, 40, 80, 160, 320 */
const FLAG_WIDTHS = [20, 40, 80, 160, 320];

function nearestWidth(size) {
  const s = Number(size);
  return FLAG_WIDTHS.reduce((best, w) =>
    Math.abs(w - s) < Math.abs(best - s) ? w : best
  );
}

export default function Flag({ code, size = 40, alt = '', className = '' }) {
  if (!code) return null;
  const px = Number(size) <= 40 ? 32 : Number(size) <= 80 ? 48 : 80;
  const cdnWidth = nearestWidth(size);
  return (
    <img
      src={`https://flagcdn.com/w${cdnWidth}/${code}.png`}
      alt={alt}
      className={className}
      loading="lazy"
      style={{
        width: `${px}px`,
        height: `${px}px`,
        objectFit: 'contain',
        borderRadius: '4px',
        flexShrink: 0,
      }}
    />
  );
}

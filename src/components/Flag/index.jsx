export default function Flag({ code, size = 40, alt = '', className = '' }) {
  if (!code) return null;
  const px = Number(size) <= 40 ? 32 : Number(size) <= 80 ? 48 : 80;
  return (
    <img
      src={`https://flagcdn.com/w${size}/${code}.png`}
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

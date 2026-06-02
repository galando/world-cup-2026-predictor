export default function Flag({ code, size = 40, alt = '', className = '' }) {
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w${size}/${code}.png`}
      alt={alt}
      crossOrigin="anonymous"
      className={className}
      loading="lazy"
    />
  );
}

import styles from './styles.module.css';

export default function Pitch({ className = '' }) {
  return (
    <div className={`${styles.pitch} ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.svg} aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="100" />
        <circle cx="50" cy="50" r="12" />
        <rect x="0" y="18" width="18" height="64" />
        <rect x="82" y="18" width="18" height="64" />
        <rect x="0" y="32" width="7" height="36" />
        <rect x="93" y="32" width="7" height="36" />
      </svg>
    </div>
  );
}

import styles from './styles.module.css';

export default function Skeleton({ width, height = '1em', radius = '8px', className = '' }) {
  return (
    <span
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

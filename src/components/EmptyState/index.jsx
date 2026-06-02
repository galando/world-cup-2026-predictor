import styles from './styles.module.css';

export default function EmptyState({ message }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.text}>{message}</div>
    </div>
  );
}

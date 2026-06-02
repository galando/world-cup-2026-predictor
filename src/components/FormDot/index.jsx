import styles from './styles.module.css';

export default function FormDot({ result }) {
  const cls = result === 'W' ? styles.win
    : result === 'D' ? styles.draw
    : styles.loss;
  return <span className={`${styles.dot} ${cls}`} />;
}

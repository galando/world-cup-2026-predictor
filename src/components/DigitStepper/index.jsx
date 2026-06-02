import Ico from '../Ico';
import styles from './styles.module.css';

export default function DigitStepper({ value, onChange, max = 9 }) {
  return (
    <div className={styles.wrap}>
      <button
        className={styles.btn}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease"
      >
        <Ico name="minus" size={18} />
      </button>
      <span className={styles.value}>{value}</span>
      <button
        className={styles.btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
      >
        <Ico name="plus" size={18} />
      </button>
    </div>
  );
}

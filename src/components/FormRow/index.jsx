import FormDot from '../FormDot';
import styles from './styles.module.css';

export default function FormRow({ form }) {
  if (!form || form.length === 0) return null;
  return (
    <div className={styles.row}>
      {form.map((r, i) => <FormDot key={i} result={r} />)}
    </div>
  );
}

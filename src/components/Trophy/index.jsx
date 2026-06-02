import Ico from '../Ico';
import Flag from '../Flag';
import styles from './styles.module.css';

export default function Trophy({ teamCode, teamsMeta, isUserPick }) {
  const meta = teamsMeta?.[teamCode];
  if (!teamCode || !meta) {
    return (
      <div className={styles.wrap}>
        <Ico name="trophy" size={48} className={styles.icon} />
        <div className={styles.label}>???</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Ico name="trophy" size={48} className={styles.icon} />
      <Flag code={meta.flagIso} size={60} />
      <div className={styles.name}>
        {isUserPick ? '★ ' : ''}{meta.nameEN}
      </div>
    </div>
  );
}

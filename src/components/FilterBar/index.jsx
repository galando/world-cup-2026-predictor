import { useTranslation } from 'react-i18next';
import styles from './styles.module.css';

export default function FilterBar({ active, onChange, groups }) {
  const { t } = useTranslation();

  const chips = [
    { key: 'all', label: t('home.filterAll') },
    { key: 'myTeam', label: t('home.filterMyTeam') },
    { key: 'group', label: t('home.filterGroup') },
    { key: 'stage', label: t('home.filterStage') },
  ];

  return (
    <div className={styles.wrap}>
      {chips.map(c => (
        <button
          key={c.key}
          className={`${styles.chip} ${active === c.key ? styles.active : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import styles from './styles.module.css';

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const STAGES = [
  { key: 'group', labelKey: 'stage.group' },
  { key: 'r32', labelKey: 'stage.r32' },
  { key: 'r16', labelKey: 'stage.r16' },
  { key: 'qf', labelKey: 'stage.qf' },
  { key: 'sf', labelKey: 'stage.sf' },
  { key: 'final', labelKey: 'stage.final' },
];

export default function FilterBar({ active, onChange, subFilter, onSubFilter }) {
  const { t } = useTranslation();

  const mainChips = [
    { key: 'all', label: t('home.filterAll') },
    { key: 'myTeam', label: t('home.filterMyTeam') },
    { key: 'group', label: t('home.filterGroup') },
    { key: 'stage', label: t('home.filterStage') },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.wrap}>
        {mainChips.map(c => (
          <button
            key={c.key}
            className={`${styles.chip} ${active === c.key ? styles.active : ''}`}
            onClick={() => onChange(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {active === 'group' && (
        <div className={styles.subRow}>
          {GROUPS.map(g => (
            <button
              key={g}
              className={`${styles.subChip} ${subFilter === g ? styles.subActive : ''}`}
              onClick={() => onSubFilter?.(subFilter === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {active === 'stage' && (
        <div className={styles.subRow}>
          {STAGES.map(s => (
            <button
              key={s.key}
              className={`${styles.subChip} ${subFilter === s.key ? styles.subActive : ''}`}
              onClick={() => onSubFilter?.(subFilter === s.key ? null : s.key)}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

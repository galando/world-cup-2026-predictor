import { useTranslation } from 'react-i18next';
import styles from './styles.module.css';

const stageKeys = {
  group: 'stage.group',
  r32: 'stage.r32',
  r16: 'stage.r16',
  qf: 'stage.qf',
  sf: 'stage.sf',
  final: 'stage.final',
  third: 'stage.thirdPlace',
};

export default function StageChip({ stage, className = '' }) {
  const { t } = useTranslation();
  const label = t(stageKeys[stage] || stage);
  return <span className={`${styles.chip} ${className}`}>{label}</span>;
}

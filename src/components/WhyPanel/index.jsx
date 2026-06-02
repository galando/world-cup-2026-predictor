import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Ico from '../Ico';
import styles from './styles.module.css';

function FactorDot({ mult }) {
  const color = mult > 1.03 ? 'var(--win)' : mult < 0.97 ? 'var(--loss)' : 'var(--ink-dim)';
  return <span className={styles.dot} style={{ backgroundColor: color }} />;
}

export default function WhyPanel({ factors, lambdaHome, lambdaAway, homeName, awayName }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const factorLabel = (key) => t(`factor.${key}`, key);

  function renderChain(chain) {
    return chain.map((item, i) => (
      <span key={i} className={styles.chainItem}>
        {i > 0 && <span className={styles.multiply}>x</span>}
        <span className={styles.chainLabel}>{factorLabel(item.key)}</span>
        <span className={styles.chainMult}>x{item.mult.toFixed(2)}</span>
        <FactorDot mult={item.mult} />
      </span>
    ));
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen(!open)}>
        <span>{t('prediction.whyPanel')}</span>
        <Ico name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      {open && (
        <div className={styles.body}>
          <div className={styles.teamBlock}>
            <div className={styles.teamHeader}>
              {homeName} {'->'} {lambdaHome.toFixed(2)} {t('prediction.expectedGoals')}
            </div>
            <div className={styles.chain}>{renderChain(factors.home.chain)}</div>
          </div>
          <div className={styles.teamBlock}>
            <div className={styles.teamHeader}>
              {awayName} {'->'} {lambdaAway.toFixed(2)} {t('prediction.expectedGoals')}
            </div>
            <div className={styles.chain}>{renderChain(factors.away.chain)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Ico from '../Ico';
import styles from './styles.module.css';

function FactorDot({ mult }) {
  const color = mult > 1.03 ? 'var(--win)' : mult < 0.97 ? 'var(--loss)' : 'var(--ink-dim)';
  return <span className={styles.dot} style={{ backgroundColor: color }} />;
}

export default function WhyPanel({ factors, lambdaHome, lambdaAway, homeName, awayName, market }) {
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
          {market && (
            <div className={styles.teamBlock}>
              <div className={styles.teamHeader}>
                {t('market.title')}
              </div>
              <div className={styles.chain}>
                <span className={styles.chainItem}>
                  <span className={styles.chainLabel}>{t('market.blendWeight')}</span>
                  <span className={styles.chainMult}>{Math.round(market.wMarket * 100)}%</span>
                </span>
                <span className={styles.chainItem}>
                  <span className={styles.chainLabel}>{homeName}</span>
                  <span className={styles.chainMult}>{Math.round(market.impliedHome * 100)}%</span>
                </span>
                <span className={styles.chainItem}>
                  <span className={styles.chainLabel}>{t('prediction.draw')}</span>
                  <span className={styles.chainMult}>{Math.round(market.impliedDraw * 100)}%</span>
                </span>
                <span className={styles.chainItem}>
                  <span className={styles.chainLabel}>{awayName}</span>
                  <span className={styles.chainMult}>{Math.round(market.impliedAway * 100)}%</span>
                </span>
              </div>
              <div className={styles.marketMeta}>
                {t('market.bookmakers')}: {market.bookmakers}
              </div>
            </div>
          )}

          {/* Methodology explanation */}
          <div className={styles.methodology}>
            <div className={styles.methodTitle}>{t('methodology.title')}</div>

            <div className={styles.methodStep}>
              <span className={styles.stepNum}>1</span>
              <div>
                <strong>{t('methodology.step1Title')}</strong>
                <p>{t('methodology.step1Desc')}</p>
              </div>
            </div>

            <div className={styles.methodStep}>
              <span className={styles.stepNum}>2</span>
              <div>
                <strong>{t('methodology.step2Title')}</strong>
                <p>{t('methodology.step2Desc')}</p>
              </div>
            </div>

            <div className={styles.methodStep}>
              <span className={styles.stepNum}>3</span>
              <div>
                <strong>{t('methodology.step3Title')}</strong>
                <p>{t('methodology.step3Desc')}</p>
              </div>
            </div>

            <div className={styles.methodStep}>
              <span className={styles.stepNum}>4</span>
              <div>
                <strong>{t('methodology.step4Title')}</strong>
                <p>{t('methodology.step4Desc')}</p>
              </div>
            </div>

            <div className={styles.methodStep}>
              <span className={styles.stepNum}>5</span>
              <div>
                <strong>{t('methodology.step5Title')}</strong>
                <p>{t('methodology.step5Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

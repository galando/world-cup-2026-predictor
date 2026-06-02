import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Flag from '../Flag';
import DigitStepper from '../DigitStepper';
import Btn from '../Btn';
import styles from './styles.module.css';

export default function GuessArea({
  homeCode,
  awayCode,
  teamsMeta,
  onSubmit,
  savedGuess,
}) {
  const { t } = useTranslation();
  const [home, setHome] = useState(savedGuess?.home ?? 0);
  const [away, setAway] = useState(savedGuess?.away ?? 0);

  const homeIso = teamsMeta?.[homeCode]?.flagIso;
  const awayIso = teamsMeta?.[awayCode]?.flagIso;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>{t('guess.title')}</div>
      <div className={styles.steppers}>
        <div className={styles.teamStepper}>
          <Flag code={homeIso} size={40} />
          <DigitStepper value={home} onChange={setHome} />
        </div>
        <span className={styles.separator}>:</span>
        <div className={styles.teamStepper}>
          <DigitStepper value={away} onChange={setAway} />
          <Flag code={awayIso} size={40} />
        </div>
      </div>
      <Btn variant="primary" onClick={() => onSubmit(home, away)} className={styles.submitBtn}>
        {t('guess.submit')}
      </Btn>
    </div>
  );
}

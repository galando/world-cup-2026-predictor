import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { useTheme } from '../../hooks/useTheme';
import { useLang } from '../../hooks/useLang';
import Flag from '../../components/Flag';
import Card from '../../components/Card';
import Btn from '../../components/Btn';
import Ico from '../../components/Ico';
import styles from './styles.module.css';

export default function TeamPickerScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { teamCode, setTeam } = useTheme();
  const { lang, setLang } = useLang();
  const { data: teamsMeta } = useData('teams-meta');

  const teams = teamsMeta ? Object.entries(teamsMeta) : [];

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Ico name="back" size={22} />
        </button>
        <span className={styles.topTitle}>{t('settings.title')}</span>
        <span style={{ width: 44 }} />
      </div>

      {/* Language section */}
      <Card>
        <div className={styles.sectionTitle}>{t('settings.languageSection')}</div>
        <div className={styles.langRow}>
          <button
            className={`${styles.langBtn} ${lang === 'he' ? styles.langActive : ''}`}
            onClick={() => setLang('he')}
          >
            {t('settings.languageHe')}
          </button>
          <button
            className={`${styles.langBtn} ${lang === 'en' ? styles.langActive : ''}`}
            onClick={() => setLang('en')}
          >
            {t('settings.languageEn')}
          </button>
          <button
            className={`${styles.langBtn} ${lang === 'nl' ? styles.langActive : ''}`}
            onClick={() => setLang('nl')}
          >
            {t('settings.languageNl')}
          </button>
        </div>
      </Card>

      {/* Theme section */}
      <Card>
        <div className={styles.sectionTitle}>{t('settings.themeSection')}</div>
        <button
          className={`${styles.themeOption} ${!teamCode ? styles.themeActive : ''}`}
          onClick={() => setTeam(null)}
        >
          <span className={styles.themeSwatch} style={{ background: 'linear-gradient(135deg, #0d1f14, #46c98a)' }} />
          {t('settings.themeDefault')}
        </button>
      </Card>

      {/* Favorite team section */}
      <Card>
        <div className={styles.sectionTitle}>{t('settings.favTeamSection')}</div>
        <div className={styles.grid}>
          {teams.map(([code, meta]) => {
            const isSelected = teamCode === code;

            return (
              <button
                key={code}
                className={`${styles.teamItem} ${isSelected ? styles.selected : ''}`}
                onClick={() => setTeam(isSelected ? null : code)}
              >
                <div className={styles.teamFlagWrap}>
                  <Flag code={meta.flagIso} size={40} />
                  {isSelected && (
                    <span className={styles.checkRing}>
                      <Ico name="check" size={12} />
                    </span>
                  )}
                </div>
                <span className={styles.teamLabel}>
                  {i18n.language === 'he' ? meta.nameHE : meta.nameEN}
                </span>
              </button>
            );
          })}
        </div>

        {teamCode && (
          <Btn variant="ghost" className={styles.clearBtn} onClick={() => setTeam(null)}>
            {t('settings.clearTeam')}
          </Btn>
        )}
      </Card>
    </div>
  );
}

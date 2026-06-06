import { useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { useGuess } from '../../hooks/useGuess';
import Card from '../../components/Card';
import StageChip from '../../components/StageChip';
import Ico from '../../components/Ico';
import TeamCompare from '../../components/TeamCompare';
import PredictionBars from '../../components/PredictionBars';
import PredictionDonut from '../../components/PredictionDonut';
import CalibrationBadge from '../../components/CalibrationBadge';
import WhyPanel from '../../components/WhyPanel';
import ScorelineGrid from '../../components/ScorelineGrid';
import LikelyScores from '../../components/LikelyScores';
import GuessArea from '../../components/GuessArea';
import FeedbackCard from '../../components/FeedbackCard';
import ResultCard from '../../components/ResultCard';
import Skeleton from '../../components/Skeleton';
import ShareCardSquare from '../../share/ShareCardSquare';
import { renderToImage, shareBlob, fetchAsDataUrl } from '../../share/renderToImage';
import styles from './styles.module.css';

export default function PreMatchScreen() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: matches, loading: matchesLoading } = useData('matches');
  const { data: predictions } = useData('predictions');
  const { data: teams } = useData('teams');
  const { data: teamsMeta } = useData('teams-meta');

  const match = useMemo(
    () => matches?.find(m => m.matchId === matchId),
    [matches, matchId],
  );
  const pred = predictions?.find(p => p.matchId === matchId);
  const { guess, save } = useGuess(matchId);

  const [showDonut, setShowDonut] = useState(false);
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [scoreMatrixOpen, setScoreMatrixOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [shareFlags, setShareFlags] = useState({ home: null, away: null });
  const shareRef = useRef(null);

  const nameOf = (code) => {
    const meta = teamsMeta?.[code];
    if (!meta) return code;
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

  // Derive team names and codes before early returns so useCallback stays stable.
  // These are null-safe: nameOf handles undefined codes.
  const homeTeamCode = match?.homeTeam ?? '';
  const awayTeamCode = match?.awayTeam ?? '';
  const homeName = match ? nameOf(homeTeamCode) : '';
  const awayName = match ? nameOf(awayTeamCode) : '';

  const handleShare = useCallback(async () => {
    if (!guess || !pred) return;

    // Pre-fetch flag images as data URLs so html-to-image never makes cross-origin requests
    const [homeFlagSrc, awayFlagSrc] = await Promise.all([
      fetchAsDataUrl(`https://flagcdn.com/w80/${homeTeamCode}.png`),
      fetchAsDataUrl(`https://flagcdn.com/w80/${awayTeamCode}.png`),
    ]);

    setShareFlags({ home: homeFlagSrc, away: awayFlagSrc });
    setShareVisible(true);

    // Two frames: first to commit the state update, second to paint
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      const blob = await renderToImage(shareRef, 320, 320);
      await shareBlob(blob, `mundial-${matchId}.png`, `${homeName} vs ${awayName}`, window.location.href);
    } catch (err) {
      console.error('Share failed:', err);
    }
    setShareVisible(false);
    setShareFlags({ home: null, away: null });
  }, [guess, pred, matchId, homeName, awayName, homeTeamCode, awayTeamCode]);

  if (matchesLoading) {
    return (
      <div className={styles.page}>
        <Skeleton width="100%" height="40px" radius="12px" />
        <Skeleton width="80%" height="20px" radius="8px" />
        <Skeleton width="100%" height="200px" radius="20px" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>{t('error.matchNotFound')}</div>
      </div>
    );
  }

  const homeMeta = teamsMeta?.[match.homeTeam];
  const awayMeta = teamsMeta?.[match.awayTeam];
  const homeTeam = teams?.[match.homeTeam];
  const awayTeam = teams?.[match.awayTeam];

  const isKnockout = match.stage !== 'group';
  const isFinished = match.status === 'FINISHED';

  const handleGuessSubmit = (home, away) => {
    save(home, away);
    setFeedback({ home, away });
  };

  const handleGridSelect = (h, a) => {
    save(h, a);
    setFeedback({ home: h, away: a });
  };

  const formatDateTime = (dateStr, timeStr) => {
    if (!dateStr) return '';
    try {
      const locale = i18n.language === 'he' ? 'he-IL' : i18n.language === 'nl' ? 'nl-NL' : 'en-US';
      if (timeStr) {
        const d = new Date(`${dateStr}T${timeStr}:00Z`);
        return d.toLocaleString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      const d = new Date(dateStr + 'T12:00:00Z');
      return d.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.page}>
      {/* Sticky top bar */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Ico name="back" size={22} />
        </button>
        <span className={styles.topTitle}>{homeName} – {awayName}</span>
        <button className={styles.shareBtn} onClick={handleShare} disabled={!guess}>
          <Ico name="share" size={20} />
        </button>
      </div>

      {/* Stage + date info */}
      <div className={styles.meta}>
        <StageChip stage={match.stage} />
        {match.date && (
          <span className={styles.dateText}>
            {formatDateTime(match.date, match.time)}
            {match.venue ? ` · ${match.venue}` : ''}
          </span>
        )}
      </div>

      {/* TeamCompare */}
      <Card>
        <TeamCompare
          homeCode={match.homeTeam}
          awayCode={match.awayTeam}
          teamsMeta={teamsMeta}
          teams={teams}
          homeForm={homeTeam?.form}
          awayForm={awayTeam?.form}
        />
      </Card>

      {/* Prediction block */}
      {pred && (
        <Card>
          <div className={styles.predHeader}>
            <span className={styles.predTitle}>{t('prediction.title')}</span>
            <CalibrationBadge />
            <button
              className={styles.donutToggle}
              onClick={() => setShowDonut(!showDonut)}
            >
              <PredictionDonut probs={pred.probs} />
            </button>
          </div>

          <PredictionBars
            probs={pred.probs}
            homeName={homeName}
            awayName={awayName}
          />

          <WhyPanel
            factors={pred.factors}
            lambdaHome={pred.lambdaHome}
            lambdaAway={pred.lambdaAway}
            homeName={homeName}
            awayName={awayName}
            market={pred.market}
          />
        </Card>
      )}

      {/* QualifyBlock for knockout */}
      {isKnockout && pred?.qualify && (
        <Card>
          <button className={styles.qualifyToggle} onClick={() => setQualifyOpen(!qualifyOpen)}>
            <span>{t('prediction.qualifyTitle')}</span>
            <Ico name={qualifyOpen ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>
          {qualifyOpen && (
            <div className={styles.qualifyBody}>
              <div className={styles.qualifyBars}>
                <div className={styles.qualifyRow}>
                  <div className={styles.qualifyTrack}>
                    <div
                      className={styles.qualifyFill}
                      style={{ width: `${Math.round(pred.qualify.home * 100)}%` }}
                    />
                  </div>
                  <span className={styles.qualifyPct}>
                    {Math.round(pred.qualify.home * 100)}%
                  </span>
                  <span className={styles.qualifyLabel}>{homeName}</span>
                </div>
                <div className={styles.qualifyRow}>
                  <div className={styles.qualifyTrack}>
                    <div
                      className={styles.qualifyFillLoss}
                      style={{ width: `${Math.round(pred.qualify.away * 100)}%` }}
                    />
                  </div>
                  <span className={styles.qualifyPct}>
                    {Math.round(pred.qualify.away * 100)}%
                  </span>
                  <span className={styles.qualifyLabel}>{awayName}</span>
                </div>
              </div>
              <div className={styles.qualifyNote}>{t('prediction.includingPenalties')}</div>
            </div>
          )}
        </Card>
      )}

      {/* ScorelineGrid */}
      {pred?.scoreMatrix && (
        <Card>
          <button className={styles.qualifyToggle} onClick={() => setScoreMatrixOpen(!scoreMatrixOpen)}>
            <span>{t('prediction.scoreMatrix')}</span>
            <Ico name={scoreMatrixOpen ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>
          {scoreMatrixOpen && (
            <div className={styles.qualifyBody}>
              <ScorelineGrid
                matrix={pred.scoreMatrix}
                onSelect={handleGridSelect}
              />
            </div>
          )}
        </Card>
      )}

      {/* LikelyScores */}
      {pred?.topScores && (
        <Card>
          <div className={styles.sectionTitle}>{t('prediction.topScores')}</div>
          <LikelyScores topScores={pred.topScores} />
        </Card>
      )}

      {/* GuessArea */}
      {!isFinished && (
        <Card>
          <GuessArea
            homeCode={match.homeTeam}
            awayCode={match.awayTeam}
            teamsMeta={teamsMeta}
            onSubmit={handleGuessSubmit}
            savedGuess={guess}
          />
        </Card>
      )}

      {/* FeedbackCard */}
      {feedback && pred && (
        <FeedbackCard
          homeGuess={feedback.home}
          awayGuess={feedback.away}
          probs={pred.probs}
          topScores={pred.topScores}
          scoreMatrix={pred.scoreMatrix}
        />
      )}

      {/* ResultCard */}
      {isFinished && match.score && (
        <ResultCard score={match.score} guess={guess} />
      )}

      {/* Hidden share card for image capture */}
      {shareVisible && guess && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0 }} aria-hidden="true">
          <div ref={shareRef}>
            <ShareCardSquare
              homeCode={match.homeTeam}
              awayCode={match.awayTeam}
              homeName={homeName}
              awayName={awayName}
              homeScore={guess.home}
              awayScore={guess.away}
              homeFlagSrc={shareFlags.home}
              awayFlagSrc={shareFlags.away}
              feedbackText={
                (() => {
                  const ts = pred?.topScores?.find(s => s.h === guess.home && s.a === guess.away);
                  const p = ts ? ts.p : pred?.scoreMatrix?.[guess.home]?.[guess.away] ?? 0;
                  return p > 0 ? t('guess.feedback', { pct: Math.round(p * 100) }) : null;
                })()
              }
              probs={pred?.probs}
            />
          </div>
        </div>
      )}
    </div>
  );
}

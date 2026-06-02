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
import { renderToImage, shareBlob } from '../../share/renderToImage';
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
  const [feedback, setFeedback] = useState(null);
  const [shareVisible, setShareVisible] = useState(false);
  const shareRef = useRef(null);

  const nameOf = (code) => {
    const meta = teamsMeta?.[code];
    if (!meta) return code;
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

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

  const homeName = nameOf(match.homeTeam);
  const awayName = nameOf(match.awayTeam);

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

  const handleShare = useCallback(async () => {
    if (!guess || !pred) return;
    setShareVisible(true);
    // Wait for render, then capture
    requestAnimationFrame(async () => {
      try {
        const blob = await renderToImage(shareRef, 320, 320);
        await shareBlob(blob, `mundial-${matchId}.png`, `${homeName} vs ${awayName}`);
      } catch (err) {
        console.error('Share failed:', err);
      }
      setShareVisible(false);
    });
  }, [guess, pred, matchId, homeName, awayName]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
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
        <span className={styles.topTitle}>{homeName} - {awayName}</span>
        <button className={styles.shareBtn} onClick={handleShare} disabled={!guess}>
          <Ico name="share" size={20} />
        </button>
      </div>

      {/* Stage + date info */}
      <div className={styles.meta}>
        <StageChip stage={match.stage} />
        {match.date && (
          <span className={styles.dateText}>
            {formatDate(match.date)}
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
          />
        </Card>
      )}

      {/* QualifyBlock for knockout */}
      {isKnockout && pred?.qualify && (
        <Card>
          <div className={styles.qualifyTitle}>{t('prediction.qualifyTitle')}</div>
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
        </Card>
      )}

      {/* ScorelineGrid */}
      {pred?.scoreMatrix && (
        <Card>
          <div className={styles.sectionTitle}>{t('prediction.scoreMatrix')}</div>
          <ScorelineGrid
            matrix={pred.scoreMatrix}
            onSelect={handleGridSelect}
          />
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
              feedbackText={
                pred?.topScores?.find(
                  s => s.h === guess.home && s.a === guess.away
                )
                  ? t('guess.feedback', { pct: Math.round(
                      pred.topScores.find(s => s.h === guess.home && s.a === guess.away).p * 100
                    ) })
                  : null
              }
              probs={pred?.probs}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @vitest-environment jsdom
 *
 * Regression test for Bug #1 (React Error #310):
 * PreMatchScreen must call all hooks in the same order regardless of
 * whether the component renders the loading skeleton or the match content.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

// Mock react-router-dom useParams to return a matchId
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ matchId: 'test-match-1' }),
    useNavigate: () => vi.fn(),
  };
});

// Mock useData to simulate loading state
const mockUseData = vi.fn();
vi.mock('../../../hooks/useData', () => ({
  useData: (...args) => mockUseData(...args),
}));

// Mock useGuess
vi.mock('../../../hooks/useGuess', () => ({
  useGuess: () => ({ guess: null, save: vi.fn(), clear: vi.fn() }),
}));

// Mock renderToImage to avoid DOM rendering issues
vi.mock('../../../share/renderToImage', () => ({
  renderToImage: vi.fn(),
  shareBlob: vi.fn(),
}));

// Mock CSS modules
vi.mock('../styles.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// Mock components that may have complex dependencies
vi.mock('../../../components/Skeleton', () => ({
  default: (props) => createElement('div', { 'data-testid': 'skeleton', ...props }),
}));
vi.mock('../../../components/Card', () => ({
  default: ({ children }) => createElement('div', null, children),
}));
vi.mock('../../../components/StageChip', () => ({
  default: () => createElement('span'),
}));
vi.mock('../../../components/Ico', () => ({
  default: () => createElement('span'),
}));
vi.mock('../../../components/TeamCompare', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/PredictionBars', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/PredictionDonut', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/CalibrationBadge', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/WhyPanel', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/ScorelineGrid', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/LikelyScores', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/GuessArea', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/FeedbackCard', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../components/ResultCard', () => ({
  default: () => createElement('div'),
}));
vi.mock('../../../share/ShareCardSquare', () => ({
  default: () => createElement('div'),
}));

import PreMatchScreen from '../index.jsx';
import { BrowserRouter } from 'react-router-dom';

function wrap(ui) {
  return createElement(BrowserRouter, null, ui);
}

describe('PreMatchScreen — Rules of Hooks regression (Bug #1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state without React hook violations', () => {
    // Simulate loading: matchesLoading=true, all data null
    mockUseData.mockImplementation((key) => {
      if (key === 'matches') return { data: null, loading: true, error: null };
      return { data: null, loading: false, error: null };
    });

    // renderToString exercises the component fully.
    // Before the fix, this would throw because useCallback was called
    // after the early return, causing a Rules of Hooks violation.
    expect(() => renderToString(wrap(createElement(PreMatchScreen)))).not.toThrow();
  });

  it('renders not-found state without React hook violations', () => {
    // Data loaded but match not found
    mockUseData.mockImplementation((key) => {
      if (key === 'matches') {
        return {
          data: [{ matchId: 'other-match', homeTeam: 'BRA', awayTeam: 'ARG' }],
          loading: false,
          error: null,
        };
      }
      return { data: null, loading: false, error: null };
    });

    expect(() => renderToString(wrap(createElement(PreMatchScreen)))).not.toThrow();
  });

  it('renders match content without React hook violations', () => {
    const match = {
      matchId: 'test-match-1',
      homeTeam: 'BRA',
      awayTeam: 'ARG',
      stage: 'group',
      status: 'SCHEDULED',
      date: '2026-06-15',
      venue: 'Maracana',
    };

    mockUseData.mockImplementation((key) => {
      if (key === 'matches') return { data: [match], loading: false, error: null };
      if (key === 'teams-meta') {
        return {
          data: {
            BRA: { nameEN: 'Brazil', nameHE: 'ברזיל', flagIso: 'BR' },
            ARG: { nameEN: 'Argentina', nameHE: 'ארגנטינה', flagIso: 'AR' },
          },
          loading: false,
          error: null,
        };
      }
      return { data: null, loading: false, error: null };
    });

    expect(() => renderToString(wrap(createElement(PreMatchScreen)))).not.toThrow();
  });
});

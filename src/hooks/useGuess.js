import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'guess_';

function loadGuess(matchId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + matchId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGuess(matchId, guess) {
  localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(guess));
}

function removeGuess(matchId) {
  localStorage.removeItem(STORAGE_PREFIX + matchId);
}

export function useGuess(matchId) {
  const [guess, setGuess] = useState(() => loadGuess(matchId));

  const save = useCallback((home, away) => {
    const g = { home, away };
    setGuess(g);
    saveGuess(matchId, g);
  }, [matchId]);

  const clear = useCallback(() => {
    setGuess(null);
    removeGuess(matchId);
  }, [matchId]);

  return { guess, save, clear };
}

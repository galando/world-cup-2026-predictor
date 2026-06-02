import { useState, useEffect, useCallback } from 'react';
import { useData } from './useData.js';

const STORAGE_KEY = 'theme_team';

const defaultTheme = {
  field: '#0d1f14',
  field2: '#091509',
  card: '#132819',
  line: 'rgba(255, 255, 255, 0.05)',
  accent: '#46c98a',
  'accent-ink': '#07140c',
  glow: 'rgba(70, 201, 138, 0.40)',
};

function applyTheme(vars) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
}

export function useTheme() {
  const [teamCode, setTeamCode] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? null,
  );
  const { data: teamsMeta } = useData('teams-meta');

  useEffect(() => {
    if (!teamCode || !teamsMeta) {
      applyTheme(defaultTheme);
      return;
    }
    const teamTheme = teamsMeta[teamCode]?.theme;
    if (teamTheme) {
      applyTheme(teamTheme);
    } else {
      applyTheme(defaultTheme);
    }
  }, [teamCode, teamsMeta]);

  const setTeam = useCallback((code) => {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setTeamCode(code);
  }, []);

  return { teamCode, setTeam };
}

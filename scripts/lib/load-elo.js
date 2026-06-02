/**
 * Load Elo ratings from committed CSV snapshot.
 * Returns Map<teamCode, elo>
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELO_FILE = join(__dirname, '..', 'data', 'elo-snapshot.csv');

/**
 * Parse Elo CSV file into a Map.
 * Expected format: team,elo,updated
 */
export function loadElo(filePath = ELO_FILE) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const eloMap = new Map();

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [team, elo, updated] = line.split(',');
    if (team && elo) {
      eloMap.set(team.trim(), parseFloat(elo.trim()));
    }
  }

  return eloMap;
}

export default loadElo;

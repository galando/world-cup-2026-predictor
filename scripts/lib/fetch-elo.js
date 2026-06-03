/**
 * Fetch and update Elo ratings from eloratings.net/World.tsv.
 *
 * Skips the network call if CSV is <STALE_HOURS old so the 30-min cron
 * does not hammer the site. Falls back to existing CSV on any failure.
 *
 * Source: https://www.eloratings.net/World.tsv  col[2]=code col[3]=Elo
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELO_FILE    = join(__dirname, '..', 'data', 'elo-snapshot.csv');
const ELO_URL     = 'https://www.eloratings.net/World.tsv';
const STALE_HOURS = 23;

// Verified: SQ=Scotland, CZ=Czech Republic, EN=England (not GB)
const CODE_MAP = {
  ES:'ESP', AR:'ARG', FR:'FRA', EN:'ENG', BR:'BRA', PT:'POR',
  CO:'COL', NL:'NED', EC:'ECU', DE:'GER', NO:'NOR', HR:'CRO',
  TR:'TUR', JP:'JPN', CH:'SUI', UY:'URU', BE:'BEL', MX:'MEX',
  SN:'SEN', IR:'IRN', KR:'KOR', AT:'AUT', CA:'CAN', AU:'AUS',
  MA:'MAR', EG:'EGY', TN:'TUN', DZ:'ALG', CD:'COD', UZ:'UZB',
  QA:'QAT', SA:'KSA', ZA:'RSA', JO:'JOR', CV:'CPV', GH:'GHA',
  CW:'CUW', HT:'HAI', NZ:'NZL', PY:'PAR', PA:'PAN', BA:'BIH',
  SQ:'SCO', US:'USA', CI:'CIV', IQ:'IRQ', SE:'SWE', CZ:'CZE',
};

function csvAgeHours() {
  if (!existsSync(ELO_FILE)) return Infinity;
  const lines = readFileSync(ELO_FILE, 'utf8').trim().split('\n');
  let latest = null;
  for (const line of lines.slice(1)) {
    const date = line.split(',')[2]?.replace(/-estimated$/, '');
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest ? (Date.now() - new Date(latest).getTime()) / 36e5 : Infinity;
}

function parseTsv(tsv) {
  const ratings = new Map();
  for (const line of tsv.trim().split('\n')) {
    const cols = line.split('\t');
    const code2 = cols[2];
    const elo   = parseInt(cols[3], 10);
    if (!code2 || isNaN(elo)) continue;
    const code3 = CODE_MAP[code2];
    if (code3) ratings.set(code3, elo);
  }
  return ratings;
}

function writeCsv(ratings, date) {
  const lines = ['team,elo,updated'];
  [...ratings.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, elo]) => lines.push(code + ',' + elo + ',' + date));
  writeFileSync(ELO_FILE, lines.join('\n') + '\n');
}

export async function fetchAndUpdateElo() {
  const ageH = csvAgeHours();
  if (ageH < STALE_HOURS) {
    console.log('  Elo CSV is ' + ageH.toFixed(1) + 'h old — skipping (threshold: ' + STALE_HOURS + 'h)');
    return false;
  }
  const label = ageH === Infinity ? 'missing' : ageH.toFixed(1) + 'h old';
  console.log('  Elo CSV ' + label + ' — fetching from eloratings.net...');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(ELO_URL, { signal: controller.signal, headers: { 'User-Agent': 'mundial-predictor/1.0' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const tsv = await res.text();
    const ratings = parseTsv(tsv);
    if (ratings.size < 40) throw new Error('Only ' + ratings.size + ' teams — malformed response');
    const date = new Date().toISOString().slice(0, 10);
    writeCsv(ratings, date);
    console.log('  Fetched ' + ratings.size + ' Elo ratings from eloratings.net (' + date + ')');
    return true;
  } catch (err) {
    console.warn('  [fetch-elo] Failed: ' + err.message + ' — keeping existing CSV');
    return false;
  }
}

export default fetchAndUpdateElo;

/**
 * Verify both external APIs before the tournament starts.
 * Usage: FD_API_KEY=your_key node scripts/verify-apis.js
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(readFileSync(join(__dirname, 'data/teams-meta.json'), 'utf8'));
const metaCodes = new Set(Object.keys(meta));
const FD_KEY = process.env.FD_API_KEY;

let allOk = true;
const pass = (m) => console.log("  PASS", m);
const fail = (m) => { console.error("  FAIL", m); allOk = false; };
const warn = (m) => console.warn("  WARN", m);

async function checkFD() {
  console.log('\n=== Football-Data.org (WC results feed) ===');
  if (!FD_KEY) {
    fail('FD_API_KEY not set -- run: FD_API_KEY=your_key node scripts/verify-apis.js');
    return;
  }
  const headers = { 'X-Auth-Token': FD_KEY, 'User-Agent': 'mundial-predictor/1.0' };
  let r;
  try {
    r = await fetch('https://api.football-data.org/v4/competitions/WC/matches', { headers });
  } catch (err) {
    fail('Network error: ' + err.message);
    return;
  }
  if (!r.ok) {
    const msg = await r.json().catch(() => ({ message: 'unknown' }));
    fail('WC endpoint HTTP ' + r.status + ' -- ' + msg.message);
    return;
  }
  const data = await r.json();
  const matches = data.matches || [];
  pass('Key valid -- WC endpoint accessible (' + matches.length + ' matches)');

  const unknown = new Set();
  for (const m of matches) {
    if (m.homeTeam && m.homeTeam.tla && !metaCodes.has(m.homeTeam.tla)) unknown.add(m.homeTeam.tla);
    if (m.awayTeam && m.awayTeam.tla && !metaCodes.has(m.awayTeam.tla)) unknown.add(m.awayTeam.tla);
  }
  if (unknown.size === 0) {
    pass('All ' + matches.length + ' match tla codes exist in teams-meta.json');
  } else {
    fail('Unknown tla codes not in teams-meta: ' + [...unknown].join(', '));
  }

  const upcoming = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED').slice(0, 5);
  if (upcoming.length) {
    console.log('  Next ' + upcoming.length + ' scheduled:');
    upcoming.forEach(m => console.log('    ' + m.utcDate.slice(0, 10) + '  ' + (m.homeTeam && m.homeTeam.tla || '?') + ' vs ' + (m.awayTeam && m.awayTeam.tla || '?')));
  }

  const finished = matches.filter(m => m.status === 'FINISHED');
  if (finished.length > 0) {
    const s = finished[0].score && finished[0].score.fullTime;
    if (s && s.home !== undefined && s.away !== undefined) {
      pass('score.fullTime schema OK on finished match');
    } else {
      fail('score.fullTime missing or wrong shape on FINISHED match');
    }
  } else {
    warn('No FINISHED matches yet -- score schema will be checked after June 11');
  }
}

async function checkElo() {
  console.log('\n=== eloratings.net (Elo strength ratings) ===');
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
  let r;
  try {
    r = await fetch('https://www.eloratings.net/World.tsv', { headers: { 'User-Agent': 'mundial-predictor/1.0' } });
  } catch (err) {
    fail('Network error: ' + err.message);
    return;
  }
  if (!r.ok) { fail('World.tsv HTTP ' + r.status); return; }
  const ratings = new Map();
  for (const line of (await r.text()).trim().split('\n')) {
    const cols = line.split('\t');
    const code3 = CODE_MAP[cols[2]];
    const elo = parseInt(cols[3], 10);
    if (code3 && !isNaN(elo)) ratings.set(code3, elo);
  }
  pass('Fetched ' + ratings.size + ' team ratings from World.tsv');
  const missing = [...metaCodes].filter(c => !ratings.has(c));
  if (missing.length === 0) {
    pass('All 48 WC teams resolved to Elo values');
  } else {
    fail('Missing Elo for: ' + missing.join(', ') + ' -- update CODE_MAP in fetch-elo.js');
  }
  const top5 = [...ratings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  Top 5: ' + top5.map(([c, e]) => c + '=' + e).join('  '));
}

async function main() {
  console.log('=== Mundial 2026 API Verification ===');
  console.log('Date:', new Date().toISOString().slice(0, 10));
  await checkFD();
  await checkElo();
  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED -- see FAIL lines above');
  process.exit(allOk ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

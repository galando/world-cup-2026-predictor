#!/usr/bin/env node
/**
 * Verify both external APIs work before the tournament starts.
 *
 * Usage:
 *   FD_API_KEY=your_key node scripts/verify-apis.js
 *
 * What it checks:
 *   1. Football-Data.org: key is valid, WC endpoint accessible,
 *      all scheduled matches have recognisable team codes.
 *   2. eloratings.net: World.tsv reachable, all 48 teams resolved.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(readFileSync(join(__dirname, "data/teams-meta.json"), "utf8"));
const metaCodes = new Set(Object.keys(meta));
const FD_KEY = process.env.FD_API_KEY;

let ok = true;
function pass(msg) { console.log("  PASS", msg); }
function fail(msg) { console.error("  FAIL", msg); ok = false; }
function warn(msg) { console.warn("  WARN", msg); }

async function checkFD() {
  console.log("
=== Football-Data.org (WC results feed) ===");
  if (!FD_KEY) {
    fail("FD_API_KEY not set — run: FD_API_KEY=your_key node scripts/verify-apis.js");
    return;
  }

  const headers = { "X-Auth-Token": FD_KEY, "User-Agent": "mundial-predictor/1.0" };
  const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", { headers });
  if (!r.ok) {
    fail("WC endpoint returned HTTP " + r.status + " — check your API key");
    return;
  }
  const data = await r.json();
  const matches = data.matches || [];
  pass("Key valid — WC endpoint accessible ("+matches.length+" matches)");

  // Check that tla codes match our canonical codes
  const unknown = new Set();
  for (const m of matches) {
    const ht = m.homeTeam?.tla;
    const at = m.awayTeam?.tla;
    if (ht && !metaCodes.has(ht)) unknown.add(ht);
    if (at && !metaCodes.has(at)) unknown.add(at);
  }
  if (unknown.size === 0) {
    pass("All "+matches.length+" match team codes exist in teams-meta.json");
  } else {
    fail("Unknown tla codes from FD (not in teams-meta): " + [...unknown].join(", ") + " — add them or map them");
  }

  // Show upcoming matches
  const upcoming = matches
    .filter(m => m.status === "SCHEDULED" || m.status === "TIMED")
    .slice(0, 5);
  if (upcoming.length) {
    console.log("  Next " + upcoming.length + " scheduled:");
    upcoming.forEach(m => console.log("    "+m.utcDate.slice(0,10)+" "+m.homeTeam?.tla+" vs "+m.awayTeam?.tla+" ["+m.status+"]"));
  }

  // Check finished matches (post-tournament-start only)
  const finished = matches.filter(m => m.status === "FINISHED");
  if (finished.length > 0) {
    const sample = finished[0];
    const scoreOk = sample.score?.fullTime?.home !== undefined && sample.score?.fullTime?.away !== undefined;
    scoreOk ? pass("score.fullTime schema OK on finished match") : fail("score.fullTime missing on FINISHED match");
  } else {
    warn("No finished matches yet — score schema will be verified after June 11");
  }
}

async function checkElo() {
  console.log("
=== eloratings.net (Elo strength ratings) ===");
  const CODE_MAP = {
    ES:"ESP",AR:"ARG",FR:"FRA",EN:"ENG",BR:"BRA",PT:"POR",
    CO:"COL",NL:"NED",EC:"ECU",DE:"GER",NO:"NOR",HR:"CRO",
    TR:"TUR",JP:"JPN",CH:"SUI",UY:"URU",BE:"BEL",MX:"MEX",
    SN:"SEN",IR:"IRN",KR:"KOR",AT:"AUT",CA:"CAN",AU:"AUS",
    MA:"MAR",EG:"EGY",TN:"TUN",DZ:"ALG",CD:"COD",UZ:"UZB",
    QA:"QAT",SA:"KSA",ZA:"RSA",JO:"JOR",CV:"CPV",GH:"GHA",
    CW:"CUW",HT:"HAI",NZ:"NZL",PY:"PAR",PA:"PAN",BA:"BIH",
    SQ:"SCO",US:"USA",CI:"CIV",IQ:"IRQ",SE:"SWE",CZ:"CZE",
  };

  const r = await fetch("https://www.eloratings.net/World.tsv", { headers: { "User-Agent": "mundial-predictor/1.0" } });
  if (!r.ok) {
    fail("World.tsv returned HTTP " + r.status);
    return;
  }
  const tsv = await r.text();
  const ratings = new Map();
  for (const line of tsv.trim().split("
")) {
    const cols = line.split("	");
    const code3 = CODE_MAP[cols[2]];
    const elo   = parseInt(cols[3], 10);
    if (code3 && !isNaN(elo)) ratings.set(code3, elo);
  }
  pass("Fetched " + ratings.size + " team ratings");

  const missing = [...metaCodes].filter(c => !ratings.has(c));
  if (missing.length === 0) {
    pass("All 48 WC teams resolved to Elo values");
  } else {
    fail("Missing Elo for: " + missing.join(", ") + " — update CODE_MAP in fetch-elo.js");
  }

  // Show top 5 for sanity check
  const top5 = [...ratings.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  console.log("  Top 5: " + top5.map(([c,e])=>c+"="+e).join("  "));
}

async function main() {
  console.log("=== Mundial 2026 API Verification ===");
  console.log("Date:", new Date().toISOString().slice(0,10));
  await checkFD();
  await checkElo();
  console.log(ok ? "
ALL CHECKS PASSED" : "
SOME CHECKS FAILED — see FAIL lines above");
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

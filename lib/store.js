// Shared data layer for the leaderboard.
//
// Two backends, picked automatically:
//   * Postgres  - when POSTGRES_URL (or DATABASE_URL) is set. This is what
//                 runs on Vercel, whose filesystem is read-only.
//   * CSV files - everywhere else, so `node server.js` keeps working locally
//                 and the data stays readable in ./media.
//
// Both expose the same API, and both use the same ranking rules.

const fs = require('fs');
const path = require('path');

const CONN = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const USE_PG = !!CONN;

// Vercel (and most serverless hosts) have a read-only filesystem, so the CSV
// backend cannot work there. Fail loudly with a fixable message instead of
// silently returning nothing.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (IS_SERVERLESS && !USE_PG) {
  console.error('[leaderboard] No POSTGRES_URL set. Add a Postgres database in ' +
                'Vercel > Storage and connect it to this project, then redeploy.');
}

// ---------- ranking ----------
// 1. higher score
// 2. if tied, the faster run
// 3. if still tied, whoever got there first
// 4. last resort, player id — guarantees a strict total order, so two rows
//    can never share a rank
function compareRuns(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const ad = a.durationMs || Infinity;
  const bd = b.durationMs || Infinity;
  if (ad !== bd) return ad - bd;
  const at = new Date(a.playedAt).getTime() || 0;
  const bt = new Date(b.playedAt).getTime() || 0;
  if (at !== bt) return at - bt;
  return String(a.id).localeCompare(String(b.id));
}

function newId() {
  return 'usr_' + Date.now().toString(36) + '_' +
         Math.random().toString(36).slice(2, 8);
}

function cleanName(n) {
  return String(n || 'PLAYER').trim().toUpperCase().slice(0, 12) || 'PLAYER';
}

// ============================================================
//  Postgres backend
// ============================================================
let sql = null;
async function pg() {
  if (sql) return sql;
  let neon;
  try {
    ({ neon } = require('@neondatabase/serverless'));
  } catch (e) {
    throw new Error('POSTGRES_URL is set but @neondatabase/serverless is not installed. Run: npm install');
  }
  sql = neon(CONN);
  await sql`CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS scores (
    id          BIGSERIAL PRIMARY KEY,
    player_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    duration_ms BIGINT  NOT NULL DEFAULT 0,
    played_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS scores_player_idx ON scores (player_id)`;
  return sql;
}

const pgStore = {
  async nameTaken(name) {
    const db = await pg();
    const [row] = await db`SELECT 1 FROM players WHERE upper(name) = ${cleanName(name)} LIMIT 1`;
    return !!row;
  },

  async createPlayer(name) {
    const db = await pg();
    const id = newId();
    const nm = cleanName(name);
    if (await pgStore.nameTaken(nm)) {
      const err = new Error('That name is already taken. Please pick another.');
      err.code = 'NAME_TAKEN';
      throw err;
    }
    const [row] = await db`
      INSERT INTO players (id, name) VALUES (${id}, ${nm})
      RETURNING id, name, created, last_seen`;
    return { id: row.id, name: row.name,
             created: row.created, lastSeen: row.last_seen };
  },

  async getPlayer(id) {
    const db = await pg();
    const [row] = await db`SELECT id, name, created, last_seen FROM players WHERE id = ${id}`;
    return row ? { id: row.id, name: row.name, created: row.created, lastSeen: row.last_seen } : null;
  },

  async touchPlayer(id) {
    const db = await pg();
    await db`UPDATE players SET last_seen = now() WHERE id = ${id}`;
  },

  async addScore(id, name, score, level, durationMs) {
    const db = await pg();
    await db`INSERT INTO scores (player_id, name, score, level, duration_ms)
             VALUES (${id}, ${cleanName(name)},
                     ${Math.max(0, Math.floor(Number(score) || 0))},
                     ${Math.max(1, Math.floor(Number(level) || 1))},
                     ${Math.max(0, Math.floor(Number(durationMs) || 0))})`;
  },

  async allRuns() {
    const db = await pg();
    const rows = await db`SELECT player_id, name, score, level, duration_ms, played_at FROM scores`;
    return rows.map(r => ({
      id: r.player_id, name: r.name,
      score: Number(r.score) || 0,
      level: Number(r.level) || 1,
      durationMs: Number(r.duration_ms) || 0,
      playedAt: new Date(r.played_at).toISOString(),
    }));
  },

  async runsFor(id) {
    const db = await pg();
    const rows = await db`SELECT score, level, duration_ms, played_at
                          FROM scores WHERE player_id = ${id}
                          ORDER BY played_at DESC LIMIT 50`;
    return rows.map(r => ({
      score: Number(r.score) || 0,
      level: Number(r.level) || 1,
      durationMs: Number(r.duration_ms) || 0,
      playedAt: new Date(r.played_at).toISOString(),
    }));
  },
};

// ============================================================
//  CSV backend (local development)
// ============================================================
const MEDIA = path.join(__dirname, '..', 'media');
const PLAYERS_CSV = path.join(MEDIA, 'players.csv');
const SCORES_CSV = path.join(MEDIA, 'scores.csv');
const PLAYERS_HEADER = 'id,name,created,lastSeen';
const SCORES_HEADER = 'id,name,score,level,durationMs,playedAt';

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvParseLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function ensureFile(file, header) {
  if (!fs.existsSync(MEDIA)) fs.mkdirSync(MEDIA, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, header + '\n', 'utf8');
}

function readCsv(file, header) {
  ensureFile(file, header);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= 1) return [];
  const cols = csvParseLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = csvParseLine(l);
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i] !== undefined ? vals[i] : ''; });
    return row;
  });
}

function appendCsv(file, header, values) {
  ensureFile(file, header);
  fs.appendFileSync(file, values.map(csvEscape).join(',') + '\n', 'utf8');
}

const csvStore = {
  async nameTaken(name) {
    const nm = cleanName(name);
    return readCsv(PLAYERS_CSV, PLAYERS_HEADER)
      .some(p => cleanName(p.name) === nm);
  },

  async createPlayer(name) {
    const nm = cleanName(name);
    if (await csvStore.nameTaken(nm)) {
      const err = new Error('That name is already taken. Please pick another.');
      err.code = 'NAME_TAKEN';
      throw err;
    }
    const now = new Date().toISOString();
    const p = { id: newId(), name: nm, created: now, lastSeen: now };
    appendCsv(PLAYERS_CSV, PLAYERS_HEADER, [p.id, p.name, p.created, p.lastSeen]);
    return p;
  },

  async getPlayer(id) {
    const p = readCsv(PLAYERS_CSV, PLAYERS_HEADER).find(x => x.id === id);
    return p || null;
  },

  async touchPlayer(id) {
    const players = readCsv(PLAYERS_CSV, PLAYERS_HEADER);
    const p = players.find(x => x.id === id);
    if (!p) return;
    p.lastSeen = new Date().toISOString();
    const body = players.map(r =>
      [r.id, r.name, r.created, r.lastSeen].map(csvEscape).join(',')).join('\n');
    fs.writeFileSync(PLAYERS_CSV, PLAYERS_HEADER + '\n' + (body ? body + '\n' : ''), 'utf8');
  },

  async addScore(id, name, score, level, durationMs) {
    appendCsv(SCORES_CSV, SCORES_HEADER, [
      id, cleanName(name),
      Math.max(0, Math.floor(Number(score) || 0)),
      Math.max(1, Math.floor(Number(level) || 1)),
      Math.max(0, Math.floor(Number(durationMs) || 0)),
      new Date().toISOString(),
    ]);
  },

  async allRuns() {
    return readCsv(SCORES_CSV, SCORES_HEADER).map(s => ({
      id: s.id, name: s.name,
      score: Number(s.score) || 0,
      level: Number(s.level) || 1,
      durationMs: Number(s.durationMs) || 0,
      playedAt: s.playedAt,
    }));
  },

  async runsFor(id) {
    return (await csvStore.allRuns())
      .filter(r => r.id === id)
      .map(({ score, level, durationMs, playedAt }) => ({ score, level, durationMs, playedAt }))
      .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  },
};

// A serverless host with no database configured cannot store anything; every
// call reports that clearly rather than pretending to work.
const missingDb = {
  async nameTaken() { return false; },
  async createPlayer() { throw new Error('Leaderboard database not configured. Add Postgres in Vercel > Storage, connect it to this project, then redeploy.'); },
  async getPlayer() { return null; },
  async touchPlayer() {},
  async addScore() { throw new Error('Leaderboard database not configured.'); },
  async allRuns() { return []; },
  async runsFor() { return []; },
};

const backend = USE_PG ? pgStore : (IS_SERVERLESS ? missingDb : csvStore);

// ============================================================
//  Shared queries built on top of whichever backend is active
// ============================================================

// Best run per player, ranked, using the tie-break rules above.
async function buildLeaderboard() {
  const best = new Map();
  for (const run of await backend.allRuns()) {
    const cur = best.get(run.id);
    if (!cur || compareRuns(run, cur) < 0) best.set(run.id, run);
  }
  const rows = [...best.values()].sort(compareRuns);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

async function playerProfile(id) {
  const player = await backend.getPlayer(id);
  if (!player) return null;
  const mine = await backend.runsFor(id);
  const board = await buildLeaderboard();
  const entry = board.find(r => r.id === id);
  return {
    id: player.id,
    name: player.name,
    created: player.created,
    lastSeen: player.lastSeen,
    gamesPlayed: mine.length,
    bestScore: mine.reduce((m, r) => Math.max(m, r.score), 0),
    bestLevel: mine.reduce((m, r) => Math.max(m, r.level), 1),
    bestTimeMs: entry ? entry.durationMs : 0,
    rank: entry ? entry.rank : null,
    totalPlayers: board.length,
    history: mine.slice(0, 20),
  };
}

module.exports = {
  backend,
  usingPostgres: USE_PG,
  compareRuns,
  cleanName,
  buildLeaderboard,
  playerProfile,
};

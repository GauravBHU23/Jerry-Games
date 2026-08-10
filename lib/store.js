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
const crypto = require('crypto');

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

// Only the three known difficulty ids are stored; anything else is 'normal'.
const MODES = ['easy', 'normal', 'hard'];
function cleanMode(m) {
  const v = String(m || '').toLowerCase();
  return MODES.includes(v) ? v : 'normal';
}

// ---------- accounts ----------
function cleanEmail(e) {
  return String(e || '').trim().toLowerCase().slice(0, 120);
}

function validEmail(e) {
  // deliberately loose - enough to catch typos, not to police addresses
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(cleanEmail(e));
}

// Passwords are stored as a scrypt hash with a per-user salt, never as the
// text the player typed. People reuse passwords, so a leaked file (or anyone
// who can read media/accounts.csv) must not hand over their real one.
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(password), s, 32).toString('hex');
  return s + ':' + h;
}

function checkPassword(password, stored) {
  const [salt, want] = String(stored || '').split(':');
  if (!salt || !want) return false;
  const got = crypto.scryptSync(String(password), salt, 32).toString('hex');
  // constant-time compare so a wrong guess cannot be timed character by character
  const a = Buffer.from(got, 'hex'), b = Buffer.from(want, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Turns the name someone signed up with into a leaderboard username. Names
// collide, so a number is added until it is free: GAURAV, GAURAV2, GAURAV3...
async function makeUsername(name, isTaken) {
  const base = cleanName(name).replace(/[^A-Z0-9]/g, '') || 'PLAYER';
  if (!(await isTaken(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = (base.slice(0, 12 - String(i).length) + i);
    if (!(await isTaken(cand))) return cand;
  }
  return base.slice(0, 6) + Date.now().toString(36).slice(-4).toUpperCase();
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
    mode        TEXT    NOT NULL DEFAULT 'normal',
    played_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS scores_player_idx ON scores (player_id)`;

  // Accounts: one row per signup. `username` is what the leaderboard shows and
  // is generated from the name, so two people can share a name but never a
  // username. The password is only ever stored hashed.
  await sql`CREATE TABLE IF NOT EXISTS accounts (
    id        TEXT PRIMARY KEY,
    email     TEXT NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    username  TEXT NOT NULL UNIQUE,
    pass      TEXT NOT NULL,
    created   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON accounts (lower(email))`;

  // Migrations for databases created before a column existed. CREATE TABLE
  // IF NOT EXISTS does nothing to an existing table, so new columns have to be
  // added explicitly or every query naming them fails.
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS duration_ms BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'normal'`;

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

  async addScore(id, name, score, level, durationMs, mode) {
    const db = await pg();
    await db`INSERT INTO scores (player_id, name, score, level, duration_ms, mode)
             VALUES (${id}, ${cleanName(name)},
                     ${Math.max(0, Math.floor(Number(score) || 0))},
                     ${Math.max(1, Math.floor(Number(level) || 1))},
                     ${Math.max(0, Math.floor(Number(durationMs) || 0))},
                     ${cleanMode(mode)})`;
  },

  async allRuns() {
    const db = await pg();
    const rows = await db`SELECT player_id, name, score, level, duration_ms, mode, played_at FROM scores`;
    return rows.map(r => ({
      id: r.player_id, name: r.name,
      score: Number(r.score) || 0,
      level: Number(r.level) || 1,
      durationMs: Number(r.duration_ms) || 0,
      mode: r.mode || 'normal',
      playedAt: new Date(r.played_at).toISOString(),
    }));
  },

  async runsFor(id) {
    const db = await pg();
    const rows = await db`SELECT score, level, duration_ms, mode, played_at
                          FROM scores WHERE player_id = ${id}
                          ORDER BY played_at DESC LIMIT 50`;
    return rows.map(r => ({
      score: Number(r.score) || 0,
      level: Number(r.level) || 1,
      durationMs: Number(r.duration_ms) || 0,
      mode: r.mode || 'normal',
      playedAt: new Date(r.played_at).toISOString(),
    }));
  },

  // ---- accounts ----
  async usernameTaken(u) {
    const db = await pg();
    const [row] = await db`SELECT 1 FROM accounts WHERE upper(username) = ${String(u).toUpperCase()} LIMIT 1`;
    return !!row;
  },

  async findAccountByEmail(email) {
    const db = await pg();
    const [row] = await db`SELECT * FROM accounts WHERE lower(email) = ${cleanEmail(email)} LIMIT 1`;
    return row || null;
  },

  async createAccount(acc) {
    const db = await pg();
    await db`INSERT INTO accounts (id, email, name, username, pass)
             VALUES (${acc.id}, ${acc.email}, ${acc.name}, ${acc.username}, ${acc.pass})`;
    // the leaderboard reads players, so mirror the account into it
    await db`INSERT INTO players (id, name) VALUES (${acc.id}, ${acc.username})
             ON CONFLICT (id) DO UPDATE SET name = ${acc.username}`;
    return acc;
  },

  async setPassword(id, pass) {
    const db = await pg();
    await db`UPDATE accounts SET pass = ${pass} WHERE id = ${id}`;
  },
};

// ============================================================
//  CSV backend (local development)
// ============================================================
const MEDIA = path.join(__dirname, '..', 'media');
const PLAYERS_CSV = path.join(MEDIA, 'players.csv');
const SCORES_CSV = path.join(MEDIA, 'scores.csv');
const ACCOUNTS_CSV = path.join(MEDIA, 'accounts.csv');
const PLAYERS_HEADER = 'id,name,created,lastSeen';
const SCORES_HEADER = 'id,name,score,level,durationMs,mode,playedAt';
// `pass` is a scrypt salt:hash, never the password itself
const ACCOUNTS_HEADER = 'id,email,name,username,pass,created';

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
  if (!fs.existsSync(file)) { fs.writeFileSync(file, header + '\n', 'utf8'); return; }

  // A file written before a column was added still has the old header. Appending
  // to it would put new values under the wrong headings, so widen it first and
  // let the existing rows keep their (missing) values as blanks.
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const have = csvParseLine(lines[0] || '');
  const want = csvParseLine(header);
  if (have.join(',') === want.join(',')) return;

  const rows = lines.slice(1).filter(l => l.trim() !== '').map(l => {
    const vals = csvParseLine(l);
    const byName = {};
    have.forEach((c, i) => { byName[c] = vals[i] !== undefined ? vals[i] : ''; });
    return want.map(c => csvEscape(byName[c] !== undefined ? byName[c] : '')).join(',');
  });
  fs.writeFileSync(file, header + '\n' + (rows.length ? rows.join('\n') + '\n' : ''), 'utf8');
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

  async addScore(id, name, score, level, durationMs, mode) {
    appendCsv(SCORES_CSV, SCORES_HEADER, [
      id, cleanName(name),
      Math.max(0, Math.floor(Number(score) || 0)),
      Math.max(1, Math.floor(Number(level) || 1)),
      Math.max(0, Math.floor(Number(durationMs) || 0)),
      cleanMode(mode),
      new Date().toISOString(),
    ]);
  },

  async allRuns() {
    return readCsv(SCORES_CSV, SCORES_HEADER).map(s => ({
      id: s.id, name: s.name,
      score: Number(s.score) || 0,
      level: Number(s.level) || 1,
      durationMs: Number(s.durationMs) || 0,
      mode: cleanMode(s.mode),
      playedAt: s.playedAt,
    }));
  },

  async runsFor(id) {
    return (await csvStore.allRuns())
      .filter(r => r.id === id)
      .map(({ score, level, durationMs, mode, playedAt }) =>
             ({ score, level, durationMs, mode, playedAt }))
      .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  },

  // ---- accounts ----
  async usernameTaken(u) {
    const up = String(u).toUpperCase();
    return readCsv(ACCOUNTS_CSV, ACCOUNTS_HEADER)
      .some(a => String(a.username || '').toUpperCase() === up);
  },

  async findAccountByEmail(email) {
    const em = cleanEmail(email);
    return readCsv(ACCOUNTS_CSV, ACCOUNTS_HEADER)
      .find(a => cleanEmail(a.email) === em) || null;
  },

  async createAccount(acc) {
    appendCsv(ACCOUNTS_CSV, ACCOUNTS_HEADER,
      [acc.id, acc.email, acc.name, acc.username, acc.pass, acc.created]);
    // mirror into players so the leaderboard and profile lookups find them
    const players = readCsv(PLAYERS_CSV, PLAYERS_HEADER);
    if (!players.some(p => p.id === acc.id)) {
      appendCsv(PLAYERS_CSV, PLAYERS_HEADER,
        [acc.id, acc.username, acc.created, acc.created]);
    }
    return acc;
  },

  async setPassword(id, pass) {
    const rows = readCsv(ACCOUNTS_CSV, ACCOUNTS_HEADER);
    const a = rows.find(r => r.id === id);
    if (!a) return;
    a.pass = pass;
    const body = rows.map(r =>
      [r.id, r.email, r.name, r.username, r.pass, r.created].map(csvEscape).join(',')).join('\n');
    fs.writeFileSync(ACCOUNTS_CSV, ACCOUNTS_HEADER + '\n' + (body ? body + '\n' : ''), 'utf8');
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
  async usernameTaken() { return false; },
  async findAccountByEmail() { return null; },
  async createAccount() { throw new Error('Accounts database not configured. Add Postgres in Vercel > Storage, connect it to this project, then redeploy.'); },
  async setPassword() { throw new Error('Accounts database not configured.'); },
};

const backend = USE_PG ? pgStore : (IS_SERVERLESS ? missingDb : csvStore);

// ============================================================
//  Shared queries built on top of whichever backend is active
// ============================================================

// Best run per player, ranked, using the tie-break rules above.
async function buildLeaderboard() {
  const best = new Map();
  const totals = new Map();       // id -> ms played across every run
  const counts = new Map();       // id -> number of runs
  for (const run of await backend.allRuns()) {
    const cur = best.get(run.id);
    if (!cur || compareRuns(run, cur) < 0) best.set(run.id, run);
    totals.set(run.id, (totals.get(run.id) || 0) + (run.durationMs || 0));
    counts.set(run.id, (counts.get(run.id) || 0) + 1);
  }
  const rows = [...best.values()].sort(compareRuns);
  rows.forEach((r, i) => {
    r.rank = i + 1;
    // ranking still uses the best run's time; these are for display only
    r.totalTimeMs = totals.get(r.id) || 0;
    r.games = counts.get(r.id) || 1;
  });
  return rows;
}

async function playerProfile(id) {
  const player = await backend.getPlayer(id);
  if (!player) return null;
  const mine = await backend.runsFor(id);
  const board = await buildLeaderboard();
  const entry = board.find(r => r.id === id);

  // Totals come from every run, not just the page of recent ones runsFor()
  // returns, so they stay right once a player has more than 50 games.
  const all = (await backend.allRuns()).filter(r => r.id === id);

  return {
    id: player.id,
    name: player.name,
    created: player.created,
    lastSeen: player.lastSeen,
    gamesPlayed: all.length,
    bestScore: all.reduce((m, r) => Math.max(m, r.score), 0),
    bestLevel: all.reduce((m, r) => Math.max(m, r.level), 1),
    bestTimeMs: entry ? entry.durationMs : 0,
    // every second this player has spent in the game, across all runs
    totalTimeMs: all.reduce((s, r) => s + (r.durationMs || 0), 0),
    rank: entry ? entry.rank : null,
    totalPlayers: board.length,
    history: mine.slice(0, 20),
  };
}

// ============================================================
//  Accounts: sign up, log in, reset
// ============================================================
// Errors carry a `status` so the routes can answer 400/401/409 without every
// caller re-deciding what each failure means.
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// The public shape of an account - never includes the password hash.
function publicAccount(a) {
  return { id: a.id, email: a.email, name: a.name, username: a.username, created: a.created };
}

async function signup({ name, email, password }) {
  const nm = String(name || '').trim().slice(0, 24);
  const em = cleanEmail(email);
  const pw = String(password || '');

  if (!nm) throw fail(400, 'Please enter your name.');
  if (!validEmail(em)) throw fail(400, 'Please enter a valid email address.');
  if (pw.length < 4) throw fail(400, 'Password must be at least 4 characters.');

  if (await backend.findAccountByEmail(em)) {
    throw fail(409, 'An account with that email already exists. Try logging in.');
  }

  const username = await makeUsername(nm, u => backend.usernameTaken(u));
  const acc = {
    id: newId(),
    email: em,
    name: nm,
    username,
    pass: hashPassword(pw),
    created: new Date().toISOString(),
  };
  await backend.createAccount(acc);
  return publicAccount(acc);
}

async function login({ email, password }) {
  const em = cleanEmail(email);
  const acc = await backend.findAccountByEmail(em);
  // Same message either way, so this cannot be used to discover which emails
  // have accounts.
  if (!acc || !checkPassword(password, acc.pass)) {
    throw fail(401, 'Wrong email or password.');
  }
  await backend.touchPlayer(acc.id);
  return publicAccount(acc);
}

// "Forgot password": prove you know the email, then set a new one. The old
// password is never shown - it is not stored in a readable form, and showing
// passwords would leak the ones people reuse elsewhere.
async function resetPassword({ email, password }) {
  const em = cleanEmail(email);
  const pw = String(password || '');
  if (!validEmail(em)) throw fail(400, 'Please enter a valid email address.');
  if (pw.length < 4) throw fail(400, 'Password must be at least 4 characters.');

  const acc = await backend.findAccountByEmail(em);
  if (!acc) throw fail(404, 'No account found with that email.');

  await backend.setPassword(acc.id, hashPassword(pw));
  return publicAccount(acc);
}

module.exports = {
  backend,
  usingPostgres: USE_PG,
  compareRuns,
  cleanName,
  cleanEmail,
  validEmail,
  hashPassword,
  checkPassword,
  makeUsername,
  buildLeaderboard,
  playerProfile,
  signup,
  login,
  resetPassword,
};

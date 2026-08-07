// Jerry the Water Saviour - game server + score API
//
// Stores everything as CSV inside ./media so the data stays readable and can be
// opened in Excel. No dependencies: plain Node.js.
//
//   node server.js          then open http://localhost:3000
//
// API
//   GET  /api/player/:id          -> that player's profile + their past games
//   GET  /api/leaderboard         -> best score per player, ranked
//   POST /api/player              -> { name }        creates a player, returns id
//   POST /api/score               -> { id, score, level }  records one game

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MEDIA = path.join(ROOT, 'media');
const PLAYERS_CSV = path.join(MEDIA, 'players.csv');
const SCORES_CSV = path.join(MEDIA, 'scores.csv');

const PLAYERS_HEADER = 'id,name,created,lastSeen';
const SCORES_HEADER = 'id,name,score,level,durationMs,playedAt';

// ---------- CSV helpers ----------
// Fields are quoted only when needed; quotes inside are doubled, like Excel.
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvParseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file, header) {
  ensureFile(file, header);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= 1) return [];
  const cols = csvParseLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = csvParseLine(l);
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i] !== undefined ? vals[i] : ''; });
    return row;
  });
}

function ensureFile(file, header) {
  if (!fs.existsSync(MEDIA)) fs.mkdirSync(MEDIA, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, header + '\n', 'utf8');
}

function appendCsv(file, header, values) {
  ensureFile(file, header);
  fs.appendFileSync(file, values.map(csvEscape).join(',') + '\n', 'utf8');
}

function rewriteCsv(file, header, rows, cols) {
  const body = rows.map(r => cols.map(c => csvEscape(r[c])).join(',')).join('\n');
  fs.writeFileSync(file, header + '\n' + (body ? body + '\n' : ''), 'utf8');
}

// ---------- data ----------
function newId() {
  return 'usr_' + Date.now().toString(36) + '_' +
         Math.random().toString(36).slice(2, 8);
}

function getPlayers() { return readCsv(PLAYERS_CSV, PLAYERS_HEADER); }
function getScores()  { return readCsv(SCORES_CSV, SCORES_HEADER); }

function createPlayer(name) {
  const clean = String(name || 'PLAYER').trim().toUpperCase().slice(0, 12) || 'PLAYER';
  const now = new Date().toISOString();
  const player = { id: newId(), name: clean, created: now, lastSeen: now };
  appendCsv(PLAYERS_CSV, PLAYERS_HEADER, [player.id, player.name, player.created, player.lastSeen]);
  return player;
}

function touchPlayer(id) {
  const players = getPlayers();
  const p = players.find(x => x.id === id);
  if (!p) return null;
  p.lastSeen = new Date().toISOString();
  rewriteCsv(PLAYERS_CSV, PLAYERS_HEADER, players, ['id', 'name', 'created', 'lastSeen']);
  return p;
}

function addScore(id, name, score, level, durationMs) {
  const row = {
    id,
    name: String(name || 'PLAYER').toUpperCase().slice(0, 12),
    score: Math.max(0, Math.floor(Number(score) || 0)),
    level: Math.max(1, Math.floor(Number(level) || 1)),
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
    playedAt: new Date().toISOString(),
  };
  appendCsv(SCORES_CSV, SCORES_HEADER,
    [row.id, row.name, row.score, row.level, row.durationMs, row.playedAt]);
  return row;
}

// Ranking order, applied everywhere so the board is never ambiguous:
//   1. higher score
//   2. if tied, the faster run (shorter durationMs)
//   3. if still tied, whoever set it first
//   4. last resort, player id - guarantees a total order, so two rows can
//      never share a rank no matter what the data looks like
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

// Best run per player, ranked. This is what the leaderboard shows.
function buildLeaderboard() {
  const best = new Map();
  for (const s of getScores()) {
    const run = {
      id: s.id,
      name: s.name,
      score: Number(s.score) || 0,
      level: Number(s.level) || 1,
      durationMs: Number(s.durationMs) || 0,
      playedAt: s.playedAt,
    };
    const cur = best.get(s.id);
    // a player's own best run is picked with the same tie-break rules
    if (!cur || compareRuns(run, cur) < 0) best.set(s.id, run);
  }
  const rows = [...best.values()].sort(compareRuns);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

function playerProfile(id) {
  const player = getPlayers().find(p => p.id === id);
  if (!player) return null;
  const mine = getScores()
    .filter(s => s.id === id)
    .map(s => ({ score: Number(s.score) || 0, level: Number(s.level) || 1,
                 durationMs: Number(s.durationMs) || 0, playedAt: s.playedAt }))
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));

  const board = buildLeaderboard();
  const entry = board.find(r => r.id === id);

  return {
    id: player.id,
    name: player.name,
    created: player.created,
    lastSeen: player.lastSeen,
    gamesPlayed: mine.length,
    bestScore: mine.reduce((m, r) => Math.max(m, r.score), 0),
    bestLevel: mine.reduce((m, r) => Math.max(m, r.level), 1),
    // the time of the run that actually earned their board place
    bestTimeMs: entry ? entry.durationMs : 0,
    rank: entry ? entry.rank : null,
    totalPlayers: board.length,
    history: mine.slice(0, 20),
  };
}

// ---------- http ----------
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e6) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // --- API ---
    if (pathname === '/api/leaderboard' && req.method === 'GET') {
      const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
      return sendJson(res, 200, { rows: buildLeaderboard().slice(0, limit) });
    }

    if (pathname.startsWith('/api/player/') && req.method === 'GET') {
      const id = pathname.slice('/api/player/'.length);
      const profile = playerProfile(id);
      if (!profile) return sendJson(res, 404, { error: 'player not found' });
      touchPlayer(id);
      return sendJson(res, 200, profile);
    }

    if (pathname === '/api/player' && req.method === 'POST') {
      const body = await readBody(req);
      const player = createPlayer(body.name);
      return sendJson(res, 201, { ...player, gamesPlayed: 0, bestScore: 0, bestLevel: 1, history: [] });
    }

    if (pathname === '/api/score' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.id) return sendJson(res, 400, { error: 'id required' });
      const player = getPlayers().find(p => p.id === body.id);
      if (!player) return sendJson(res, 404, { error: 'player not found' });
      addScore(player.id, player.name, body.score, body.level, body.durationMs);
      touchPlayer(player.id);
      return sendJson(res, 201, playerProfile(player.id));
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'unknown endpoint' });
    }

    // --- static files ---
    // The CSVs live under media/ next to the icons; serve the icons but never
    // hand out the raw player data - that is what the API is for.
    if (/\.csv$/i.test(pathname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    let rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(ROOT, rel);
    // never serve anything outside the project folder
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

ensureFile(PLAYERS_CSV, PLAYERS_HEADER);
ensureFile(SCORES_CSV, SCORES_HEADER);

server.listen(PORT, () => {
  console.log('');
  console.log('  Jerry the Water Saviour');
  console.log('  ------------------------------------');
  console.log('  Play:   http://localhost:' + PORT);
  console.log('  Data:   ' + MEDIA);
  console.log('            players.csv, scores.csv');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

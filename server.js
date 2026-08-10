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

// Load .env for local runs. Vercel injects real environment variables, so
// this only matters on a developer machine - hence no dependency for it.
(function loadDotEnv() {
  try {
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (val && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) { /* a bad .env must not stop the server */ }
})();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MEDIA = path.join(ROOT, 'media');
const PLAYERS_CSV = path.join(MEDIA, 'players.csv');
const SCORES_CSV = path.join(MEDIA, 'scores.csv');

const PLAYERS_HEADER = 'id,name,created,lastSeen';
const SCORES_HEADER = 'id,name,score,level,durationMs,playedAt';

// ---------- data ----------
// All storage and ranking lives in lib/store.js, shared with the Vercel
// serverless functions in api/ so both paths behave identically.
const { backend, buildLeaderboard, playerProfile, usingPostgres,
        signup, login, resetPassword, handlePossibleWin } = require('./lib/store');

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
      const rows = await buildLeaderboard();
      return sendJson(res, 200, { rows: rows.slice(0, limit) });
    }

    // --- accounts: signup / login / forgot-password ---
    if (pathname === '/api/auth' && req.method === 'POST') {
      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const body = await readBody(req);
      try {
        if (action === 'signup') return sendJson(res, 201, await signup(body));
        if (action === 'login')  return sendJson(res, 200, await login(body));
        if (action === 'reset')  return sendJson(res, 200, await resetPassword(body));
        return sendJson(res, 400, { error: 'unknown action' });
      } catch (e) {
        return sendJson(res, e.status || 500, { error: e.message });
      }
    }

    // both shapes work: /api/player?id=x (what Vercel needs) and /api/player/x
    if (pathname === '/api/player' && req.method === 'GET') {
      // ?check=NAME asks whether a name is free, without creating anyone
      const check = url.searchParams.get('check');
      if (check) return sendJson(res, 200, { taken: await backend.nameTaken(check) });
      const id = url.searchParams.get('id') || '';
      if (!id) return sendJson(res, 400, { error: 'id required' });
      const profile = await playerProfile(id);
      if (!profile) return sendJson(res, 404, { error: 'player not found' });
      await backend.touchPlayer(id);
      return sendJson(res, 200, profile);
    }

    if (pathname.startsWith('/api/player/') && req.method === 'GET') {
      const id = pathname.slice('/api/player/'.length);
      const profile = await playerProfile(id);
      if (!profile) return sendJson(res, 404, { error: 'player not found' });
      await backend.touchPlayer(id);
      return sendJson(res, 200, profile);
    }

    if (pathname === '/api/player' && req.method === 'POST') {
      const body = await readBody(req);
      const player = await backend.createPlayer(body.name);
      return sendJson(res, 201, {
        ...player, gamesPlayed: 0, bestScore: 0, bestLevel: 1,
        bestTimeMs: 0, rank: null, totalPlayers: 0, history: [],
      });
    }

    if (pathname === '/api/score' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.id) return sendJson(res, 400, { error: 'id required' });
      const player = await backend.getPlayer(body.id);
      if (!player) return sendJson(res, 404, { error: 'player not found' });
      await backend.addScore(player.id, player.name, body.score, body.level, body.durationMs, body.mode);
      await backend.touchPlayer(player.id);
      // clearing level 8 earns the winner email, sent once per account
      const mail = await handlePossibleWin(player.id, body);
      return sendJson(res, 201, { ...(await playerProfile(player.id)), winnerMail: mail });
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
    // 409 so the client can tell "name taken" apart from a real failure
    const code = err.code === 'NAME_TAKEN' ? 409 : 500;
    sendJson(res, code, { error: err.message, code: err.code });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Jerry the Water Saviour');
  console.log('  ------------------------------------');
  console.log('  Play:   http://localhost:' + PORT);
  console.log('  Data:   ' + (usingPostgres ? 'Postgres (POSTGRES_URL)' : MEDIA + '  (players.csv, scores.csv)'));
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

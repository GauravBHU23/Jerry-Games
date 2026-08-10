// POST /api/auth?action=signup   { name, email, password } -> new account
// POST /api/auth?action=login    { email, password }       -> that account
// POST /api/auth?action=reset    { email, password }       -> sets a new password
//
// No tokens and no sessions: the game keeps the returned account in
// localStorage, which is all a leaderboard needs. Passwords are only ever
// stored as a scrypt hash, so nobody - including whoever can read the
// database - can recover the text a player typed.
const { signup, login, resetPassword } = require('../lib/store');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const action = String((req.query && req.query.action) || '').toLowerCase();

  try {
    const body = await readBody(req);
    if (action === 'signup') return res.status(201).json(await signup(body));
    if (action === 'login')  return res.status(200).json(await login(body));
    if (action === 'reset')  return res.status(200).json(await resetPassword(body));
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

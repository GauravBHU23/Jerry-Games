// POST /api/admin?action=delete-player   { key, id }
//   Removes one player: their scores, their account, and their leaderboard row.
//
// Guarded by ADMIN_KEY, an environment variable known only to the organisers.
// Without it set the route refuses everything, so an unconfigured deployment
// cannot have its leaderboard wiped by whoever finds the URL.
const { backend } = require('../lib/store');

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

  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'ADMIN_KEY is not set on this deployment' });
  }

  try {
    const body = await readBody(req);
    if (String(body.key || '') !== expected) {
      return res.status(401).json({ error: 'wrong admin key' });
    }

    const action = String((req.query && req.query.action) || '').toLowerCase();
    if (action !== 'delete-player') {
      return res.status(400).json({ error: 'unknown action' });
    }
    if (!body.id) return res.status(400).json({ error: 'id required' });

    const removed = await backend.deletePlayer(body.id);
    return res.status(200).json({ deleted: body.id, ...removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

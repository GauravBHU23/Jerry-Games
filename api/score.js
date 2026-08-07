// POST /api/score  { id, score, level, durationMs } -> records one game
const { backend, playerProfile } = require('../lib/store');

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

  try {
    const body = await readBody(req);
    if (!body.id) return res.status(400).json({ error: 'id required' });

    const player = await backend.getPlayer(body.id);
    if (!player) return res.status(404).json({ error: 'player not found' });

    await backend.addScore(player.id, player.name, body.score, body.level, body.durationMs, body.mode);
    await backend.touchPlayer(player.id);
    res.status(201).json(await playerProfile(player.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

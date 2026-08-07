// POST /api/player          -> create a player, returns their new id
// GET  /api/player?id=usr_x  -> that player's profile and past games
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      // ?check=NAME asks whether a name is still free, without creating anyone
      const check = req.query && req.query.check;
      if (check) {
        return res.status(200).json({ taken: await backend.nameTaken(check) });
      }
      const id = (req.query && req.query.id) || '';
      if (!id) return res.status(400).json({ error: 'id required' });
      const profile = await playerProfile(id);
      if (!profile) return res.status(404).json({ error: 'player not found' });
      await backend.touchPlayer(id);
      return res.status(200).json(profile);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const player = await backend.createPlayer(body.name);
      return res.status(201).json({
        ...player, gamesPlayed: 0, bestScore: 0, bestLevel: 1,
        bestTimeMs: 0, rank: null, totalPlayers: 0, history: [],
      });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    // 409 so the client can tell "name taken" apart from a real failure
    const code = e.code === 'NAME_TAKEN' ? 409 : 500;
    res.status(code).json({ error: e.message, code: e.code });
  }
};

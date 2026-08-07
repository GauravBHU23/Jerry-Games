const { buildLeaderboard } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    const limit = Math.min(200, Number(req.query && req.query.limit) || 50);
    const rows = await buildLeaderboard();
    res.status(200).json({ rows: rows.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

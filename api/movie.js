const fetch = require('node-fetch');

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbGet(path, params, key) {
  const url = new URL(TMDB_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    timeout: 10000,
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.TMDB_KEY;
  if (!key) return res.status(500).json({ error: 'TMDB_KEY not configured in Vercel environment variables.' });

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    if (type === 'collection') {
      const data = await tmdbGet(`/collection/${id}`, {}, key);
      return res.json(data);
    }

    const [details, releases] = await Promise.all([
      tmdbGet(`/movie/${id}`, { append_to_response: 'credits' }, key),
      tmdbGet(`/movie/${id}/release_dates`, {}, key),
    ]);

    let collection = null;
    if (details.belongs_to_collection) {
      collection = await tmdbGet(`/collection/${details.belongs_to_collection.id}`, {}, key).catch(() => null);
    }

    return res.json({ details, releases, collection });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};

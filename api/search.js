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

// Simple fuzzy: strip punctuation, try individual words if full query fails
async function searchWithFuzzy(query, key) {
  // 1. Try exact query
  let data = await tmdbGet('/search/movie', { query, page: 1, include_adult: false }, key);
  if (data.results.length) return data.results;

  // 2. Try without special characters
  const cleaned = query.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  if (cleaned !== query) {
    data = await tmdbGet('/search/movie', { query: cleaned, page: 1, include_adult: false }, key);
    if (data.results.length) return data.results;
  }

  // 3. Try dropping short words (articles, typos in small words)
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 1 && words.length < query.split(/\s+/).length) {
    data = await tmdbGet('/search/movie', { query: words.join(' '), page: 1, include_adult: false }, key);
    if (data.results.length) return data.results;
  }

  // 4. Try each meaningful word individually, merge by popularity
  if (words.length > 1) {
    const sets = await Promise.all(
      words.map(w => tmdbGet('/search/movie', { query: w, page: 1 }, key).then(d => d.results).catch(() => []))
    );
    // Find movies that appear in multiple word searches (likely the right one)
    const counts = new Map();
    for (const results of sets) {
      for (const m of results.slice(0, 5)) {
        const prev = counts.get(m.id) || { movie: m, count: 0 };
        counts.set(m.id, { movie: m, count: prev.count + 1 });
      }
    }
    const multi = [...counts.values()]
      .sort((a, b) => b.count - a.count || b.movie.popularity - a.movie.popularity)
      .map(x => x.movie);
    if (multi.length) return multi;
  }

  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.TMDB_KEY;
  if (!key) return res.status(500).json({ error: 'TMDB_KEY not configured in Vercel environment variables.' });

  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    if (type === 'suggest') {
      // Fast, no fuzzy — just top 6 for autocomplete
      const data = await tmdbGet('/search/movie', { query: q, page: 1, include_adult: false }, key);
      return res.json({ results: data.results.slice(0, 6) });
    }

    const results = await searchWithFuzzy(q, key);
    return res.json({ results: results.slice(0, 10) });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};

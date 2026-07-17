const { gql, locale, JW_IMG } = require('./_jw');

const SEARCH_QUERY = `
query Search($q: String!, $country: Country!, $lang: Language!, $first: Int!) {
  popularTitles(
    country: $country
    filter: { searchQuery: $q, objectTypes: [MOVIE] }
    first: $first
  ) {
    edges {
      node {
        id
        ... on Movie {
          content(country: $country, language: $lang) {
            title
            originalReleaseYear
            posterUrl
            shortDescription
          }
        }
      }
    }
  }
}`;

async function search(q, country, language, first = 8) {
  const data = await gql(SEARCH_QUERY, { q, country, lang: language, first });
  return (data?.popularTitles?.edges || []).map(e => ({
    id:       e.node.id,
    title:    e.node.content?.title || '',
    year:     e.node.content?.originalReleaseYear || null,
    poster:   e.node.content?.posterUrl || null,
    overview: e.node.content?.shortDescription || '',
  }));
}

async function fuzzySearch(query, country, language) {
  // 1. Try exact query
  let results = await search(query, country, language, 8);
  if (results.length) return results;

  // 2. Strip punctuation / special chars
  const stripped = query.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped !== query) {
    results = await search(stripped, country, language, 8);
    if (results.length) return results;
  }

  // 3. Drop words under 3 chars (common typo words like "thw" "teh")
  const words = stripped.split(' ').filter(w => w.length >= 3);
  if (words.length > 0 && words.join(' ') !== stripped) {
    results = await search(words.join(' '), country, language, 8);
    if (results.length) return results;
  }

  // 4. Try each significant word, merge by frequency (finds movies appearing in multiple word searches)
  if (words.length > 1) {
    const sets = await Promise.all(
      words.map(w => search(w, country, language, 6).catch(() => []))
    );
    const score = new Map();
    for (const set of sets) {
      for (const m of set) {
        const prev = score.get(m.id) || { m, n: 0 };
        score.set(m.id, { m, n: prev.n + 1 });
      }
    }
    return [...score.values()]
      .sort((a, b) => b.n - a.n)
      .map(x => x.m);
  }

  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q, region = 'US', type } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  const { country, language } = require('./_jw').locale(region);

  try {
    // Suggestions — fast, no fuzzy
    if (type === 'suggest') {
      const results = await search(q, country, language, 6);
      return res.json({ results });
    }

    const results = await fuzzySearch(q, country, language);
    return res.json({ results });
  } catch (err) {
    console.error('[search]', err.message);
    return res.status(502).json({ error: err.message });
  }
};

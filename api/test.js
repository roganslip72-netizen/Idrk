const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin':          'https://www.justwatch.com',
        'Referer':         'https://www.justwatch.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({
        query: `
          query Search($q: String!, $country: Country!, $lang: Language!, $first: Int!) {
            popularTitles(country: $country, filter: { searchQuery: $q, objectTypes: [MOVIE] }, first: $first) {
              edges { node { id ... on Movie { content(country: $country, language: $lang) { title } } } }
            }
          }
        `,
        variables: { q: 'inception', country: 'US', lang: 'en', first: 1 },
      }),
      timeout: 10000,
    });
    const text = await r.text();
    return res.json({ status: r.status, ok: r.ok, body: text.slice(0, 1000) });
  } catch (e) {
    return res.json({ error: e.message });
  }
};

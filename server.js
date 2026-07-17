require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const PROXY_URL = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

// Serve the frontend
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// CORS for local dev (frontend on file:// or different port)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ─── JustWatch locale map ────────────────────────────────────────────────────
const LOCALE_MAP = {
  US: 'en_US', GB: 'en_GB', CA: 'en_CA', AU: 'en_AU',
  DE: 'de_DE', FR: 'fr_FR', IN: 'en_IN', JP: 'ja_JP',
  BR: 'pt_BR', MX: 'es_MX', ES: 'es_ES', IT: 'it_IT',
  NL: 'nl_NL', SE: 'sv_SE',
};

// ─── Monetization type labels ─────────────────────────────────────────────────
const MONO_LABELS = {
  FLATRATE: 'Subscription',
  FREE:     'Free',
  ADS:      'Free with Ads',
  RENT:     'Rent',
  BUY:      'Buy',
};

// ─── Step 1: Search JustWatch for a movie node ID ────────────────────────────
async function jwSearch(title, locale) {
  const body = {
    query: `query SearchTitles($searchQuery: String!, $country: Country!, $language: Language!, $first: Int!) {
      popularTitles(
        country: $country
        filter: { searchQuery: $searchQuery, objectTypes: [MOVIE] }
        first: $first
      ) {
        edges {
          node {
            id
            __typename
            ... on Movie {
              content(country: $country, language: $language) {
                title
                originalReleaseYear
              }
            }
          }
        }
      }
    }`,
    variables: {
      searchQuery: title,
      country: locale.split('_')[1],
      language: locale.split('_')[0].toUpperCase(),
      first: 5,
    },
  };

  const res = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin':       'https://www.justwatch.com',
      'Referer':      'https://www.justwatch.com/',
    },
    body: JSON.stringify(body),
    agent: proxyAgent,
  });

  if (!res.ok) throw new Error(`JustWatch search failed: HTTP ${res.status}`);
  const json = await res.json();
  const edges = json?.data?.popularTitles?.edges || [];
  return edges.map(e => ({ id: e.node.id, title: e.node.content?.title, year: e.node.content?.originalReleaseYear }));
}

// ─── Step 2: Get streaming offers for a node ─────────────────────────────────
async function jwOffers(nodeId, locale) {
  const country  = locale.split('_')[1];
  const language = locale.split('_')[0].toUpperCase();

  const body = {
    query: `query GetTitleOffers($nodeId: ID!, $country: Country!, $language: Language!) {
      node(id: $nodeId) {
        ... on Movie {
          offers(country: $country, platform: WEB) {
            monetizationType
            retailPrice(language: $language)
            package {
              clearName
              packageId
              icon
              shortName
            }
            standardWebURL
          }
        }
      }
    }`,
    variables: { nodeId, country, language },
  };

  const res = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin':       'https://www.justwatch.com',
      'Referer':      'https://www.justwatch.com/',
    },
    body: JSON.stringify(body),
    agent: proxyAgent,
  });

  if (!res.ok) throw new Error(`JustWatch offers failed: HTTP ${res.status}`);
  const json = await res.json();
  return json?.data?.node?.offers || [];
}

// ─── Route: verify streaming via proxy ───────────────────────────────────────
app.get('/api/verify', async (req, res) => {
  const { title, year, region } = req.query;
  if (!title || !region) {
    return res.status(400).json({ error: 'title and region are required' });
  }

  const locale = LOCALE_MAP[region] || 'en_US';

  try {
    // 1. Find the movie on JustWatch
    const results = await jwSearch(title, locale);
    if (!results.length) {
      return res.json({ found: false, message: `"${title}" not found on JustWatch for this region.`, providers: [] });
    }

    // Best match: prefer same year, else first result
    let match = results[0];
    if (year) {
      const exact = results.find(r => String(r.year) === String(year));
      if (exact) match = exact;
    }

    // 2. Get offers
    const offers = await jwOffers(match.id, locale);

    if (!offers.length) {
      return res.json({
        found: true,
        title: match.title,
        year:  match.year,
        providers: [],
        message: `Not available to stream in this region according to JustWatch.`,
      });
    }

    // Deduplicate by service + monetisation type, pick best deal per service
    const seen = new Map();
    for (const o of offers) {
      const key = `${o.package.shortName}::${o.monetizationType}`;
      if (!seen.has(key)) seen.set(key, o);
    }

    const providers = Array.from(seen.values()).map(o => ({
      name:   o.package.clearName,
      short:  o.package.shortName,
      type:   MONO_LABELS[o.monetizationType] || o.monetizationType,
      price:  o.retailPrice || null,
      url:    o.standardWebURL,
    }));

    // Group by type
    const grouped = {};
    for (const p of providers) {
      if (!grouped[p.type]) grouped[p.type] = [];
      grouped[p.type].push(p);
    }

    return res.json({
      found:    true,
      title:    match.title,
      year:     match.year,
      source:   'JustWatch (via residential proxy)',
      region,
      providers,
      grouped,
    });

  } catch (err) {
    console.error('[verify error]', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// ─── Route: proxy health check ────────────────────────────────────────────────
app.get('/api/proxy-status', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { agent: proxyAgent, timeout: 8000 });
    const json = await r.json();
    res.json({ ok: true, ip: json.ip });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`StreamCheck backend running → http://localhost:${PORT}`);
  console.log(`Proxy: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
});

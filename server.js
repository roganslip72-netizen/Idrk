require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const PROXY_URL   = `http://${process.env.PROXY_USER || 'PwWM1JFbPPP3oMOu'}:${process.env.PROXY_PASS || 'mnGUfFPFq21Tj7na'}@${process.env.PROXY_HOST || 'geo.iproyal.com'}:${process.env.PROXY_PORT || '22225'}`;
const proxyAgent  = new HttpsProxyAgent(PROXY_URL);

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const LOCALE_MAP = {
  US: 'en_US', GB: 'en_GB', CA: 'en_CA', AU: 'en_AU',
  DE: 'de_DE', FR: 'fr_FR', IN: 'en_IN', JP: 'ja_JP',
  BR: 'pt_BR', MX: 'es_MX', ES: 'es_ES', IT: 'it_IT',
  NL: 'nl_NL', SE: 'sv_SE',
};

const TYPE_ORDER = ['Subscription', 'Free with Ads', 'Free', 'Rent', 'Buy'];
const MONO_LABELS = { FLATRATE: 'Subscription', FREE: 'Free', ADS: 'Free with Ads', RENT: 'Rent', BUY: 'Buy' };

const JW_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin':       'https://www.justwatch.com',
  'Referer':      'https://www.justwatch.com/',
};

async function jwPost(body) {
  const res = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: JW_HEADERS,
    body: JSON.stringify(body),
    agent: proxyAgent,
    timeout: 12000,
  });
  if (!res.ok) throw new Error(`JustWatch API error: HTTP ${res.status}`);
  return res.json();
}

async function jwSearch(title, country, language) {
  const json = await jwPost({
    query: `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, filter: { searchQuery: $q, objectTypes: [MOVIE] }, first: 6) {
        edges {
          node {
            id
            ... on Movie {
              content(country: $country, language: $lang) {
                title
                originalReleaseYear
              }
            }
          }
        }
      }
    }`,
    variables: { q: title, country, lang: language },
  });
  return (json?.data?.popularTitles?.edges || []).map(e => ({
    id:    e.node.id,
    title: e.node.content?.title,
    year:  e.node.content?.originalReleaseYear,
  }));
}

async function jwOffers(nodeId, country, language) {
  const json = await jwPost({
    query: `query Offers($id: ID!, $country: Country!, $lang: Language!) {
      node(id: $id) {
        ... on Movie {
          offers(country: $country, platform: WEB) {
            monetizationType
            retailPrice(language: $lang)
            package { clearName shortName icon }
            standardWebURL
          }
        }
      }
    }`,
    variables: { id: nodeId, country, lang: language },
  });
  return json?.data?.node?.offers || [];
}

// ─── /api/streaming ──────────────────────────────────────────────────────────
app.get('/api/streaming', async (req, res) => {
  const { title, year, region } = req.query;
  if (!title || !region) return res.status(400).json({ error: 'title and region required' });

  const locale   = LOCALE_MAP[region] || 'en_US';
  const country  = locale.split('_')[1];
  const language = locale.split('_')[0].toUpperCase();

  try {
    const results = await jwSearch(title, country, language);
    if (!results.length) {
      return res.json({ found: false, providers: [], grouped: {} });
    }

    // Prefer year-exact match, fall back to first result
    const match = (year && results.find(r => String(r.year) === String(year))) || results[0];

    const rawOffers = await jwOffers(match.id, country, language);

    // Deduplicate: keep one entry per (service, monetisation type)
    const seen = new Map();
    for (const o of rawOffers) {
      const key = `${o.package.shortName}::${o.monetizationType}`;
      if (!seen.has(key)) seen.set(key, o);
    }

    const providers = Array.from(seen.values()).map(o => ({
      name:  o.package.clearName,
      short: o.package.shortName,
      type:  MONO_LABELS[o.monetizationType] || o.monetizationType,
      price: o.retailPrice || null,
      url:   o.standardWebURL || null,
    }));

    const grouped = {};
    for (const p of providers) {
      if (!grouped[p.type]) grouped[p.type] = [];
      grouped[p.type].push(p);
    }

    // Sort groups by preferred order
    const sortedGrouped = {};
    for (const t of TYPE_ORDER) {
      if (grouped[t]) sortedGrouped[t] = grouped[t];
    }
    for (const t of Object.keys(grouped)) {
      if (!sortedGrouped[t]) sortedGrouped[t] = grouped[t];
    }

    return res.json({
      found:    true,
      title:    match.title,
      year:     match.year,
      region,
      providers,
      grouped:  sortedGrouped,
    });

  } catch (err) {
    console.error('[streaming]', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// ─── /api/proxy-status ───────────────────────────────────────────────────────
app.get('/api/proxy-status', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { agent: proxyAgent, timeout: 8000 });
    res.json({ ok: true, ip: (await r.json()).ip });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`StreamCheck → http://localhost:${PORT}`);
  console.log(`Proxy: ${process.env.PROXY_HOST || 'geo.iproyal.com'}:${process.env.PROXY_PORT || '22225'}`);
});

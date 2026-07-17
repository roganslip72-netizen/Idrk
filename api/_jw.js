const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_URL  = `http://${process.env.PROXY_USER||'PwWM1JFbPPP3oMOu'}:${process.env.PROXY_PASS||'mnGUfFPFq21Tj7na'}@${process.env.PROXY_HOST||'geo.iproyal.com'}:${process.env.PROXY_PORT||'22225'}`;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

const HEADERS = {
  'Content-Type':    'application/json',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin':          'https://www.justwatch.com',
  'Referer':         'https://www.justwatch.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

const JW_GQL = 'https://apis.justwatch.com/graphql';

async function _post(agent, timeout) {
  return (body) => fetch(JW_GQL, {
    method: 'POST',
    headers: HEADERS,
    body,
    agent,
    timeout,
  });
}

async function gql(query, variables, timeout = 12000) {
  const body = JSON.stringify({ query, variables });

  // Try direct first (faster, no proxy overhead)
  let res;
  try {
    res = await fetch(JW_GQL, { method: 'POST', headers: HEADERS, body, timeout: 8000 });
  } catch (_) {
    // Direct failed — fall back to residential proxy
    res = await fetch(JW_GQL, { method: 'POST', headers: HEADERS, body, agent: proxyAgent, timeout });
  }

  if (!res.ok) {
    // If direct returned an error status, retry via proxy
    if (res.status >= 400) {
      const r2 = await fetch(JW_GQL, { method: 'POST', headers: HEADERS, body, agent: proxyAgent, timeout });
      if (!r2.ok) throw new Error(`JustWatch ${r2.status}`);
      const j2 = await r2.json();
      if (j2.errors?.length) throw new Error(j2.errors[0].message);
      return j2.data;
    }
    throw new Error(`JustWatch ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const LOCALE_MAP = {
  US:'en_US', GB:'en_GB', CA:'en_CA', AU:'en_AU',
  DE:'de_DE', FR:'fr_FR', IN:'en_IN', JP:'ja_JP',
  BR:'pt_BR', MX:'es_MX', ES:'es_ES', IT:'it_IT',
  NL:'nl_NL', SE:'sv_SE',
};

const MONO_LABELS = { FLATRATE:'Subscription', FREE:'Free', ADS:'Free with Ads', RENT:'Rent', BUY:'Buy' };
const TYPE_ORDER  = ['Subscription','Free with Ads','Free','Rent','Buy'];
const JW_IMG      = 'https://images.justwatch.com';

function locale(region) {
  const l = LOCALE_MAP[region] || 'en_US';
  return { country: l.split('_')[1], language: l.split('_')[0].toUpperCase() };
}

module.exports = { gql, locale, MONO_LABELS, TYPE_ORDER, JW_IMG, LOCALE_MAP };

// Shared JustWatch GraphQL helper used by all route handlers
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_URL  = `http://${process.env.PROXY_USER||'PwWM1JFbPPP3oMOu'}:${process.env.PROXY_PASS||'mnGUfFPFq21Tj7na'}@${process.env.PROXY_HOST||'geo.iproyal.com'}:${process.env.PROXY_PORT||'22225'}`;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin':       'https://www.justwatch.com',
  'Referer':      'https://www.justwatch.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function gql(query, variables, timeout = 14000) {
  const res = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
    agent: proxyAgent,
    timeout,
  });
  if (!res.ok) throw new Error(`JustWatch ${res.status}`);
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

const MONO_LABELS  = { FLATRATE:'Subscription', FREE:'Free', ADS:'Free with Ads', RENT:'Rent', BUY:'Buy' };
const TYPE_ORDER   = ['Subscription','Free with Ads','Free','Rent','Buy'];
const JW_IMG       = 'https://images.justwatch.com';

function locale(region) {
  const l = LOCALE_MAP[region] || 'en_US';
  return { country: l.split('_')[1], language: l.split('_')[0].toUpperCase() };
}

module.exports = { gql, locale, MONO_LABELS, TYPE_ORDER, JW_IMG, LOCALE_MAP };

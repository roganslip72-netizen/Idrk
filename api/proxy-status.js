const fetch  = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_URL  = `http://${process.env.PROXY_USER || 'PwWM1JFbPPP3oMOu'}:${process.env.PROXY_PASS || 'mnGUfFPFq21Tj7na'}@${process.env.PROXY_HOST || 'geo.iproyal.com'}:${process.env.PROXY_PORT || '22225'}`;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://api.ipify.org?format=json', { agent:proxyAgent, timeout:8000 });
    res.json({ ok:true, ip:(await r.json()).ip });
  } catch(e) {
    res.status(502).json({ ok:false, error:e.message });
  }
};

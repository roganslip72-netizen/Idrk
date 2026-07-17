const { gql, locale, MONO_LABELS, TYPE_ORDER } = require('./_jw');

const MOVIE_QUERY = `
query MovieDetails($id: ID!, $country: Country!, $lang: Language!) {
  node(id: $id) {
    ... on Movie {
      id
      objectId
      content(country: $country, language: $lang) {
        title
        originalTitle
        originalReleaseYear
        originalReleaseDate
        runtime
        shortDescription
        ageCertification
        genres { translation }
        posterUrl
        backdrops(profile: S1440, format: JPG) { backdropUrl }
        scoring {
          imdbScore
          imdbVotes
          tomatoMeter
        }
        credits {
          role {
            ... on Cast { name character }
            ... on Director { name }
          }
          crType
        }
      }
      offers(country: $country, platform: WEB) {
        monetizationType
        retailPrice(language: $lang)
        package { clearName shortName }
        standardWebURL
      }
    }
  }
}`;

// Search for related movies in the same series
const SERIES_QUERY = `
query Series($id: ID!, $country: Country!, $lang: Language!) {
  node(id: $id) {
    ... on Movie {
      content(country: $country, language: $lang) {
        title
      }
      similarTitlesV2(
        country: $country
        allowSponsoredRecommendations: { sponsoredLevel: NON_SPONSORED }
      ) {
        edges {
          node {
            id
            ... on Movie {
              content(country: $country, language: $lang) {
                title
                originalReleaseYear
                posterUrl
              }
            }
          }
        }
      }
    }
  }
}`;

function groupOffers(rawOffers) {
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
  const sorted = {};
  for (const t of TYPE_ORDER)           if (grouped[t]) sorted[t] = grouped[t];
  for (const t of Object.keys(grouped)) if (!sorted[t])  sorted[t] = grouped[t];
  return { providers, grouped: sorted };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id, region = 'US' } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const { country, language } = locale(region);

  try {
    const data  = await gql(MOVIE_QUERY, { id, country, lang: language });
    const node  = data?.node;
    if (!node) return res.status(404).json({ error: 'Movie not found' });

    const content = node.content || {};

    // Parse cast & directors from credits
    const directors = [], cast = [];
    for (const c of content.credits || []) {
      if (c.crType === 'DIRECTOR' || c.role?.__typename === 'Director') {
        if (c.role?.name) directors.push(c.role.name);
      } else if (c.crType === 'ACTOR' || c.role?.__typename === 'Cast') {
        if (c.role?.name) cast.push({ name: c.role.name, character: c.role.character || '' });
      }
    }

    // Streaming offers
    const { providers, grouped } = groupOffers(node.offers || []);

    // Series: try to find related movies — best-effort, don't fail if unavailable
    let series = null;
    try {
      const sData = await gql(SERIES_QUERY, { id, country, lang: language });
      const edges = sData?.node?.similarTitlesV2?.edges || [];
      // Filter: only include if titles share the base word (rough franchise detection)
      const baseWord = content.title?.split(/[\s:–—]/)[0]?.toLowerCase() || '';
      const related = edges
        .map(e => ({
          id:     e.node.id,
          title:  e.node.content?.title || '',
          year:   e.node.content?.originalReleaseYear || null,
          poster: e.node.content?.posterUrl || null,
        }))
        .filter(m => baseWord && m.title.toLowerCase().includes(baseWord));
      if (related.length > 0) {
        series = [
          {
            id:     node.id,
            title:  content.title,
            year:   content.originalReleaseYear,
            poster: content.posterUrl,
          },
          ...related,
        ].sort((a, b) => (a.year || 9999) - (b.year || 9999));
      }
    } catch (_) {}

    return res.json({
      id:          node.id,
      title:       content.title,
      originalTitle: content.originalTitle || null,
      year:        content.originalReleaseYear,
      releaseDate: content.originalReleaseDate || null,
      runtime:     content.runtime || null,
      overview:    content.shortDescription || '',
      cert:        content.ageCertification || null,
      genres:      (content.genres || []).map(g => g.translation),
      poster:      content.posterUrl || null,
      backdrop:    content.backdrops?.[0]?.backdropUrl || null,
      imdbScore:   content.scoring?.imdbScore || null,
      imdbVotes:   content.scoring?.imdbVotes || null,
      tomatoMeter: content.scoring?.tomatoMeter || null,
      directors,
      cast:        cast.slice(0, 5),
      streaming: {
        found:     providers.length > 0,
        providers,
        grouped,
      },
      series,
    });
  } catch (err) {
    console.error('[movie]', err.message);
    return res.status(502).json({ error: err.message });
  }
};

const UPSTREAM = 'https://trrb.net/.netlify/functions/uscis-asylum-data';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  try {
    const url = new URL(UPSTREAM);
    for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': response.headers.get('cache-control') || 'public, max-age=300, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: await response.text()
    };
  } catch (error) {
    console.error('AsylumJudge USCIS data proxy', error);
    return { statusCode: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'shared_data_unavailable' }) };
  }
};

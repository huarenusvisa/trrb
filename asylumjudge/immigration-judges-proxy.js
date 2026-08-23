const UPSTREAM = 'https://trrb.net/.netlify/functions/immigration-judges';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const url = new URL(UPSTREAM);
    for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(25000)
    });
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': event.queryStringParameters?.mode === 'detail' ? 'no-store' : (response.headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=300'),
        'Access-Control-Allow-Origin': '*'
      },
      body: await response.text()
    };
  } catch (error) {
    console.error('AsylumJudge shared data proxy', error);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'shared_data_unavailable' })
    };
  }
};

const UPSTREAM = 'https://trrb.net/.netlify/functions/immigration-judges';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const params = event.queryStringParameters || {};
  if (params.mode === 'detail' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id || '')) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'invalid_judge_id' }) };
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
    const body = await response.text();
    if (response.ok && ['detail', 'court-detail'].includes(params.mode)) {
      const data = JSON.parse(body);
      const matches = params.mode === 'detail'
        ? String(data.judge?.id || '').toLowerCase() === String(params.id).toLowerCase()
        : data.court?.court_name === params.court && (!params.state || data.court?.court_state === params.state.trim().toUpperCase());
      if (!matches) throw new Error('Upstream profile identity mismatch');
    }
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': event.queryStringParameters?.mode === 'detail' ? 'no-store' : (response.headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=300'),
        'Access-Control-Allow-Origin': '*'
      },
      body
    };
  } catch (error) {
    console.error('AsylumJudge shared data proxy', error);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'shared_data_unavailable' })
    };
  }
};

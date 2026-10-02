const { rest } = require('./_shared/supabase-admin');

const OFFICIAL_APPLY_SOURCE = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;
const PUBLIC_FIELDS = 'id,title,description,category_slug,employment_type,salary_min,salary_max,salary_period,state_code,city,county,borough,neighborhood,status,published_at,updated_at,listing_origin,contact_method,contact_value,contact_public,application_url,source_key';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'X-Content-Type-Options': 'nosniff',
      // Public, read-only feed shared by the main domain and its aliases.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeQuery(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function actionFor(row) {
  if (row.contact_public && row.contact_value) {
    const value = String(row.contact_value).trim();
    if (row.contact_method === 'phone' && value) return { type: 'phone', value };
    if (row.contact_method === 'email' && value) return { type: 'email', value };
  }
  const applicationUrl = OFFICIAL_APPLY_SOURCE.test(String(row.source_key || '')) ? safeHttpUrl(row.application_url) : '';
  return applicationUrl ? { type: 'official_apply', value: applicationUrl } : null;
}

function idsFrom(event) {
  const raw = String(event.queryStringParameters?.ids || '').trim();
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)).slice(0, 60);
}

function safeItem(row, contactRow = row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    category_slug: row.category_slug || null,
    employment_type: row.employment_type || null,
    salary_min: row.salary_min ?? null,
    salary_max: row.salary_max ?? null,
    salary_period: row.salary_period || null,
    state_code: row.state_code || '',
    city: row.city || '',
    county: row.county || null,
    borough: row.borough || null,
    neighborhood: row.neighborhood || null,
    status: row.status || 'open',
    published_at: row.published_at || row.created_at || null,
    updated_at: row.updated_at || row.created_at || null,
    contact: actionFor(contactRow),
  };
}

async function directListingRows(requestedIds, limit) {
  const query = {
    select: PUBLIC_FIELDS,
    status: 'eq.open',
    moderation_hold: 'eq.false',
    order: 'published_at.desc.nullslast,updated_at.desc',
    limit: String(requestedIds.length ? Math.max(requestedIds.length, limit) : limit),
  };
  if (requestedIds.length) query.id = `in.(${requestedIds.join(',')})`;
  return rest('job_listings', { query });
}

async function searchRows(keyword, category, offset, limit) {
  return rest('rpc/search_job_listings', {
    method: 'POST',
    body: {
      p_keyword: keyword || null,
      p_category_slug: category || null,
      p_employment_type: null,
      p_state_code: null,
      p_city: null,
      p_county: null,
      p_borough: null,
      p_neighborhood: null,
      p_postal_code: null,
      p_salary_min: null,
      p_sort: keyword ? 'relevance' : 'latest',
      p_latitude: null,
      p_longitude: null,
      p_radius_miles: null,
      p_limit: limit + 1,
      p_offset: offset,
    },
  });
}

async function locationRows(place, zip, keyword, category, offset, limit) {
  const groups = [['flushing','法拉盛'],['queens','皇后区','皇后'],['new york','new york city','nyc','纽约','纽约市'],['brooklyn','布鲁克林'],['manhattan','曼哈顿'],['bronx','布朗克斯'],['staten island','史泰登岛','斯塔滕岛'],['los angeles','la','洛杉矶'],['boston','波士顿'],['houston','休斯顿','休斯敦']];
  const normalized = place.normalize('NFKC').trim().toLowerCase();
  const terms = groups.find(group => group.includes(normalized)) || [normalized];
  const literal = value => '"' + value.replace(/[\\"]/g, '\\$&') + '"';
  const query = {select:PUBLIC_FIELDS,country_code:'eq.US',status:'eq.open',moderation_hold:'eq.false',order:'published_at.desc.nullslast,id.asc',offset:String(offset),limit:String(limit + 1)};
  const clauses = [`or(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`];
  if (zip) query.postal_code = `like.${zip.slice(0,5)}*`;
  else clauses.push('or(' + terms.flatMap(term => ['city','neighborhood','borough','county','state_code'].map(field => `${field}.ilike.${literal(term.length < 4 && /^[a-z]+$/.test(term) ? term : '*' + term.replace(/[%*]/g,'') + '*')}`)).join(',') + ')');
  if (terms.includes('flushing')) query.state_code = 'eq.NY';
  if (category) query.category_slug = `eq.${category}`;
  if (keyword) clauses.push('or(' + ['title','description'].map(field => `${field}.ilike.${literal('*' + keyword.replace(/[%*]/g,'') + '*')}`).join(',') + ')');
  query.and = '(' + clauses.join(',') + ')';
  return rest('job_listings', {query});
}

async function contactRows(ids) {
  if (!ids.length) return [];
  return rest('job_listings', {
    query: {
      select: PUBLIC_FIELDS,
      id: `in.(${ids.join(',')})`,
      status: 'eq.open',
      moderation_hold: 'eq.false',
      limit: String(ids.length),
    },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const requestedIds = idsFrom(event);
    const limit = boundedInteger(event.queryStringParameters?.limit, 30, 1, 60);
    const offset = boundedInteger(event.queryStringParameters?.offset, 0, 0, 10_000);
    const keyword = safeQuery(event.queryStringParameters?.q);
    const category = safeQuery(event.queryStringParameters?.category);
    const place = safeQuery(event.queryStringParameters?.place);
    const zip = safeQuery(event.queryStringParameters?.zip);
    if (zip && !/^\d{5}(?:-\d{4})?$/.test(zip)) return json(400, {error:'Invalid ZIP Code'});

    if (requestedIds.length) {
      const rows = await directListingRows(requestedIds, limit);
      return json(200, {
        source: 'job_listings',
        country_code: 'US',
        query: null,
        nextOffset: null,
        items: (Array.isArray(rows) ? rows : []).map((row) => safeItem(row)),
      });
    }

    const searched = place || zip ? await locationRows(place, zip, keyword, category, offset, limit) : await searchRows(keyword, category, offset, limit);
    const page = Array.isArray(searched) ? searched : [];
    const hasMore = page.length > limit;
    const visibleRows = page.slice(0, limit);
    const contacts = await contactRows(visibleRows.map((row) => row.id));
    const contactsById = new Map((Array.isArray(contacts) ? contacts : []).map((row) => [row.id, row]));
    const items = visibleRows.map((row) => safeItem(row, contactsById.get(row.id) || {}));

    return json(200, {
      source: 'search_job_listings',
      country_code: 'US',
      query: keyword || null,
      category: category || null,
      nextOffset: hasMore ? offset + items.length : null,
      items,
    });
  } catch (error) {
    console.error('Public jobs feed error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

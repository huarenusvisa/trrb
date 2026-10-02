const { rest } = require('./_shared/supabase-admin');
const regions = require('../../huarengongzuo/regions.json');

const OFFICIAL_APPLY_SOURCE = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;
const PUBLIC_FIELDS = 'id,title,description,category_slug,employment_type,salary_min,salary_max,salary_period,state_code,city,county,borough,neighborhood,latitude,longitude,status,published_at,updated_at,listing_origin,contact_method,contact_value,contact_public,application_url,source_key';

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
    distance_miles: row.distance_miles ?? null,
    distance_approximate: row.distance_approximate || false,
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

const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const literal = value => '"' + value.replace(/[\\"]/g, '\\$&') + '"';
function resolvePlace(value) {
  const key = normalize(value);
  return regions.cities.find(city => [city.id,city.zh,city.en,...city.aliases].some(alias => normalize(alias) === key));
}
function placeClause(value) {
  const city = resolvePlace(value);
  const state = regions.states.find(row => normalize(row.code) === normalize(value) || row.zh === value);
  if (state && !city) return `state_code.eq.${state.code}`;
  const terms = city ? [city.en,city.zh,...city.aliases].filter(term => !/^[a-z]{1,3}$/i.test(term)) : [value];
  const match = 'or(' + terms.flatMap(term => ['city','neighborhood','borough','county'].map(field => `${field}.ilike.${literal(city ? term : '*' + term.replace(/[%*]/g,'') + '*')}`)).join(',') + ')';
  return city ? `and(state_code.eq.${city.state},${match})` : match;
}
function baseLocationQuery(keyword, category) {
  const clauses = [`or(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`,
    'or(and(contact_public.eq.true,contact_value.not.is.null,contact_method.in.(phone,email)),and(or(source_key.like.greenhouse_*,source_key.like.jazzhr_*,source_key.like.lever_*,source_key.like.workday_*,source_key.like.ashby_*),application_url.not.is.null))'];
  if (keyword) clauses.push('or(' + ['title','description'].map(field => `${field}.ilike.${literal('*' + keyword.replace(/[%*]/g,'') + '*')}`).join(',') + ')');
  return {query:{select:PUBLIC_FIELDS,country_code:'eq.US',status:'eq.open',moderation_hold:'eq.false',order:'published_at.desc.nullslast,id.asc',...(category ? {category_slug:`eq.${category}`} : {})},clauses};
}
async function locationRows(places, zip, keyword, category, offset, limit) {
  const {query,clauses} = baseLocationQuery(keyword,category);
  if (zip) query.postal_code = `like.${zip.slice(0,5)}*`;
  else clauses.push('or(' + places.map(placeClause).join(',') + ')');
  query.and = '(' + clauses.join(',') + ')';
  query.offset = String(offset); query.limit = String(limit + 1);
  return rest('job_listings', {query});
}
function miles(a,b) {
  const rad = n => n * Math.PI / 180;
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
async function nearbyRows(origins, keyword, category, radius, offset, limit) {
  const {query,clauses} = baseLocationQuery(keyword,category);
  const candidates = regions.cities.filter(city => origins.some(origin => miles(origin,city) <= radius));
  const boxes = origins.map(origin => {
    const latDelta = radius / 69, lngDelta = radius / (69 * Math.cos(origin.lat * Math.PI / 180));
    return `and(latitude.gte.${origin.lat-latDelta},latitude.lte.${origin.lat+latDelta},longitude.gte.${origin.lng-lngDelta},longitude.lte.${origin.lng+lngDelta})`;
  });
  const names = [...new Set(candidates.flatMap(city => [city.en,city.zh,...city.aliases].filter(term => !/^[a-z]{1,3}$/i.test(term))))].map(literal).join(',');
  const named = names ? ['city','neighborhood','borough','county'].map(field => `${field}.in.(${names})`) : [];
  clauses.push('or(' + [...boxes,...named].join(',') + ')');
  query.state_code = `in.(${[...new Set([...candidates,...origins].map(city => city.state))].join(',')})`;
  query.and = '(' + clauses.join(',') + ')'; query.limit = '1000';
  const rows = [];
  for (let start = 0; start < 10000; start += 1000) {
    const batch = await rest('job_listings', {query:{...query,offset:String(start)}});
    rows.push(...(Array.isArray(batch) ? batch : []));
    if (!Array.isArray(batch) || batch.length < 1000) break;
  }
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const exact = row.latitude != null && row.longitude != null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
    const center = exact ? {lat:Number(row.latitude),lng:Number(row.longitude)} : candidates.find(city => city.state === row.state_code && [row.neighborhood,row.borough,row.city,row.county].some(value => [city.en,city.zh,...city.aliases].some(alias => normalize(alias) === normalize(value))));
    if (!center || !actionFor(row)) return [];
    const distance = Math.min(...origins.map(origin => miles(origin,center)));
    return distance <= radius ? [{...row,distance_miles:Math.round(distance*10)/10,distance_approximate:!exact}] : [];
  }).sort((a,b) => a.distance_miles-b.distance_miles || String(b.published_at || '').localeCompare(String(a.published_at || '')) || a.id.localeCompare(b.id)).slice(offset,offset+limit+1);
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
    const place = String(event.queryStringParameters?.place || '').slice(0,800);
    const places = place.split(';').map(safeQuery).filter(Boolean).slice(0,10);
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

    let recommendation = null;
    let searched;
    const origins = places.map(resolvePlace).filter(Boolean);
    const requestedRadius = boundedInteger(event.queryStringParameters?.nearby,0,0,250);
    if (requestedRadius && origins.length) {
      searched = await nearbyRows(origins,keyword,category,requestedRadius,offset,limit);
      recommendation = {type:'nearby',radius_miles:requestedRadius,places:places};
    } else {
      searched = places.length || zip ? await locationRows(places, zip, keyword, category, offset, limit) : await searchRows(keyword, category, offset, limit);
      // Only expand an empty first page; reaching the end of local results must not change the search.
      if (offset === 0 && !searched?.length && origins.length) {
        for (const radius of [50,100,250]) {
          searched = await nearbyRows(origins,keyword,category,radius,0,limit);
          recommendation = {type:'nearby',radius_miles:radius,places:places};
          if (searched.length) break;
        }
      }
    }
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
      recommendation,
      nextOffset: hasMore ? offset + items.length : null,
      items,
    });
  } catch (error) {
    console.error('Public jobs feed error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

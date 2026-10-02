const { rest } = require('./_shared/supabase-admin');
const geography = require('./_shared/job-geography');

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
    category_slug: row.effective_category || row.category_slug || null,
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
    latitude: row.map_latitude ?? row.latitude ?? null,
    longitude: row.map_longitude ?? row.longitude ?? null,
    location_approximate: row.location_approximate || false,
    distance_miles: row.distance_miles == null ? null : Math.round(Number(row.distance_miles)*10)/10,
    distance_approximate: row.location_approximate || false,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const requestedIds = idsFrom(event);
    const limit = boundedInteger(event.queryStringParameters?.limit, 30, 1, 60);
    const offset = boundedInteger(event.queryStringParameters?.offset, 0, 0, 1_000_000);
    const keyword = safeQuery(event.queryStringParameters?.q);
    const category = safeQuery(event.queryStringParameters?.category);
    const place = String(event.queryStringParameters?.place || '').slice(0,800);
    const places = place.split(';').map(safeQuery).filter(Boolean).slice(0,10);
    const zip = safeQuery(event.queryStringParameters?.zip);
    if (zip && !/^\d{5}(?:-\d{4})?$/.test(zip)) return json(400, {error:'Invalid ZIP Code'});

    const facets = await geography.locations();
    if (event.queryStringParameters?.catalog === '1') {
      const stateCode = safeQuery(event.queryStringParameters?.state).toUpperCase();
      const search = geography.normalize(event.queryStringParameters?.search);
      let cities = facets.cities;
      if (stateCode || search) {
        const live = new Map(cities.map(c=>[c.state+':'+geography.normalize(c.en),c]));
        const extras = geography.catalog.cities.filter(c=>(!stateCode||c.state===stateCode) && (!search || [c.en,c.zh,...c.aliases].some(a=>geography.normalize(a).includes(search))));
        cities = [...cities.filter(c=>(!stateCode||c.state===stateCode)&&(!search||[c.en,c.zh,...c.aliases].some(a=>geography.normalize(a).includes(search)))),...extras.filter(c=>!live.has(c.state+':'+geography.normalize(c.en))).map(c=>({...c,zh:c.zh||c.en,count:0,value:`${c.en}, ${c.state}`,located:true}))];
      }
      return json(200,{states:geography.catalog.states,cities:cities.sort((a,b)=>b.count-a.count||a.en.localeCompare(b.en)),source:geography.catalog.source});
    }
    const hint = safeQuery(event.queryStringParameters?.state).toUpperCase();
    const origins = [];
    const filters = places.map(value=>{
      const city=geography.resolve(value,hint);
      const state=geography.stateFor(value);
      if (city) {origins.push({lat:city.lat,lng:city.lng});return {state:city.state,terms:[city.en,city.zh,...city.aliases].filter(t=>t&&!/^[a-z]{1,3}$/i.test(t))};}
      if(state)return {state:state.code,terms:[]};
      const pieces=value.split(',').map(s=>s.trim());
      return {state:pieces.length>1?geography.stateFor(pieces.at(-1))?.code||hint:hint,terms:[pieces.length>1?pieces.slice(0,-1).join(','):value],fuzzy:pieces.length===1};
    });
    const zipCenter=geography.catalog.zips[zip.slice(0,5)];
    if(zipCenter)origins.push({lat:zipCenter[0],lng:zipCenter[1]});
    const rawLat=event.queryStringParameters?.lat,rawLng=event.queryStringParameters?.lng;
    if(rawLat!=null && rawLng!=null && rawLat!=='' && rawLng!=='' && Number.isFinite(Number(rawLat)) && Number.isFinite(Number(rawLng)) && Math.abs(Number(rawLat))<=90 && Math.abs(Number(rawLng))<=180)origins.push({lat:Number(rawLat),lng:Number(rawLng)});
    const opts={centers:facets.centers,places:filters,origins,state:hint,zip,q:keyword,category,employment:safeQuery(event.queryStringParameters?.employment),salary: /^\d+(?:\.\d+)?$/.test(event.queryStringParameters?.salary||'')?event.queryStringParameters.salary:'',sort:safeQuery(event.queryStringParameters?.sort),limit:limit+1,offset};
    if(requestedIds.length)opts.ids=requestedIds;
    let recommendation=null;
    opts.radius=origins.length?boundedInteger(event.queryStringParameters?.nearby||event.queryStringParameters?.radius,zipCenter?10:0,0,250):0;
    if(opts.radius)recommendation={type:'nearby',radius_miles:opts.radius,places:zip?[`ZIP ${zip}`]:places};
    const queryFeed=()=>rest('rpc/search_public_job_feed',{method:'POST',body:{p_options:opts}});
    const facetMode=safeQuery(event.queryStringParameters?.facets);
    if(['states','categories'].includes(facetMode)){opts.facets=facetMode;return json(200,{counts:await queryFeed()});}
    let page=await queryFeed();
    if(!requestedIds.length && offset===0 && !page?.length && origins.length) {
      for(const radius of (zipCenter?[25,50,100,250]:[50,100,250]).filter(r=>r>opts.radius)) {
        opts.radius=radius;recommendation={type:'nearby',radius_miles:radius,places:zip?[`ZIP ${zip}`]:places};page=await queryFeed();if(page?.length)break;
      }
    }
    const items=(page||[]).slice(0,limit).map(row=>safeItem(row));
    return json(200,{source:'search_public_job_feed',country_code:'US',query:keyword||null,category:category||null,recommendation,nextOffset:!requestedIds.length&&page.length>limit?offset+items.length:null,items});
  } catch (error) {
    console.error('Public jobs feed error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

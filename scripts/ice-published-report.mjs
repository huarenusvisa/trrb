#!/usr/bin/env node
import fs from 'node:fs/promises';

const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
if (!base || !key) throw new Error('Missing Supabase environment');

const now = new Date();
const todayStart = String(process.env.ICE_TODAY_START || '');
if (!todayStart) throw new Error('Missing ICE_TODAY_START');

async function query(path, prefer = '') {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(prefer ? { Prefer: prefer } : {})
    }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}

async function count(filters) {
  const params = new URLSearchParams({ select: 'id', status: 'eq.published', limit: '1', ...filters });
  const response = await query(`articles?${params}`, 'count=exact');
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function latest() {
  const params = new URLSearchParams({
    select: 'id,title,published_at,source_account,source_url',
    status: 'eq.published',
    topic_key: 'eq.ice',
    order: 'published_at.desc',
    limit: '5'
  });
  const response = await query(`articles?${params}`);
  return response.json();
}

async function state() {
  const params = new URLSearchParams({
    select: 'query_key,last_run_at,last_success_at,last_error,updated_at',
    query_key: 'like.pipeline:*',
    order: 'updated_at.desc',
    limit: '20'
  });
  const response = await query(`ice_query_state?${params}`);
  return response.json();
}

const last30h = new Date(now.getTime() - 30 * 3600000).toISOString();
const [todayTopic, todayCategory, recent30h, allTime, latestArticles, pipelineState] = await Promise.all([
  count({ topic_key: 'eq.ice', published_at: `gte.${todayStart}` }),
  count({ category_name: 'eq.ICE执法动态', published_at: `gte.${todayStart}` }),
  count({ topic_key: 'eq.ice', published_at: `gte.${last30h}` }),
  count({ topic_key: 'eq.ice' }),
  latest(),
  state()
]);

const report = {
  checked_at: now.toISOString(),
  timezone: 'America/New_York',
  today_start: todayStart,
  today_published: Math.max(todayTopic, todayCategory),
  today_by_topic_key: todayTopic,
  today_by_category_name: todayCategory,
  recent_30_hours: recent30h,
  all_time: allTime,
  latest_articles: latestArticles,
  pipeline_state: pipelineState
};

await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/ice-published-status.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

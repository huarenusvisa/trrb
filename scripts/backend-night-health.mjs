#!/usr/bin/env node
import process from 'node:process';

const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
if (!base || !key) throw new Error('唐人日报后台健康检查缺少 Supabase 配置');

const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

async function probe(table, query) {
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) throw new Error(`${table} 健康检查失败：HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

const [controls, publishedArticles, categories] = await Promise.all([
  probe('automation_controls', 'select=control_key&limit=100'),
  probe('articles', 'select=id&status=eq.published&limit=1'),
  probe('categories', 'select=id&is_active=eq.true&limit=1')
]);

if (!controls) throw new Error('后台自动化控制表为空');
if (!publishedArticles) throw new Error('正式文章发布队列不可达');
if (!categories) throw new Error('正式栏目配置不可达');

console.log(JSON.stringify({
  stage: 'trrb-backend-night-health-v1',
  automation_controls_reachable: true,
  published_articles_reachable: true,
  active_categories_reachable: true,
  checked_at: new Date().toISOString()
}));

import fs from 'node:fs';
import vm from 'node:vm';

const CLIENT_CONFIG = 'config/immigration-knowledge.js';
const EDGE_ROUTES = 'netlify/edge-functions/_shared/immigration-knowledge-routes.ts';
const SEO_EDGE = 'netlify/edge-functions/seo-route-meta.ts';
const CANONICAL_EDGE = 'netlify/edge-functions/00-immigration-center-canonical.ts';
const DUPLICATE_EDGE = 'netlify/edge-functions/01-immigration-knowledge-canonical.ts';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function clientRoutes() {
  const source = fs.readFileSync(CLIENT_CONFIG, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: CLIENT_CONFIG, timeout: 1000 });
  const categories = sandbox.window.TRRB_IMMIGRATION_KNOWLEDGE?.categories;
  if (!Array.isArray(categories) || !categories.length) throw new Error('client immigration knowledge categories are empty');
  const routes = new Set();
  for (const category of categories) {
    const categorySlug = String(category?.slug || '').trim();
    if (!categorySlug) throw new Error('client category is missing slug');
    routes.add(`/immigrate/center?path=${categorySlug}`);
    for (const topic of Array.isArray(category?.items) ? category.items : []) {
      const topicSlug = String(topic?.slug || '').trim();
      if (!topicSlug) throw new Error(`client topic in ${categorySlug} is missing slug`);
      routes.add(`/immigrate/center?path=${categorySlug}&topic=${topicSlug}`);
    }
  }
  return routes;
}

function edgeRoutes() {
  const source = fs.readFileSync(EDGE_ROUTES, 'utf8');
  const routes = new Set();
  const blockPattern = /\{\s*slug:\s*"([^"]+)"[\s\S]*?topics:\s*\[([\s\S]*?)\]\.map\(\(\[slug, name\]\)/g;
  let match;
  while ((match = blockPattern.exec(source))) {
    const categorySlug = match[1];
    routes.add(`/immigrate/center?path=${categorySlug}`);
    const topicPattern = /\["([^"]+)",\s*"[^"]+"\]/g;
    let topic;
    while ((topic = topicPattern.exec(match[2]))) {
      routes.add(`/immigrate/center?path=${categorySlug}&topic=${topic[1]}`);
    }
  }
  if (!routes.size) throw new Error('edge immigration knowledge routes could not be parsed');
  return routes;
}

const client = clientRoutes();
const edge = edgeRoutes();
const missingFromEdge = [...client].filter((route) => !edge.has(route));
const missingFromClient = [...edge].filter((route) => !client.has(route));

if (missingFromEdge.length) fail(`routes missing from Edge shared table: ${missingFromEdge.join(', ')}`);
if (missingFromClient.length) fail(`routes missing from browser config: ${missingFromClient.join(', ')}`);
if (client.size !== edge.size) fail(`route count differs: client=${client.size}, edge=${edge.size}`);

const seoEdge = fs.readFileSync(SEO_EDGE, 'utf8');
if (!seoEdge.includes('./_shared/immigration-knowledge-routes.ts')) fail('SEO route metadata is not using the shared immigration route table');
if (/IMMIGRATION_PATHS|IMMIGRATION_TOPICS/.test(seoEdge)) fail('SEO route metadata reintroduced a duplicate immigration route table');

const canonical = fs.readFileSync(CANONICAL_EDGE, 'utf8');
if (!canonical.includes('./_shared/immigration-knowledge-routes.ts')) fail('canonical guard is not using the shared immigration route table');
if (!canonical.includes('invalid-topic-to-category-v2')) fail('canonical guard is missing invalid topic normalization');
if (fs.existsSync(DUPLICATE_EDGE)) fail('duplicate immigration canonical Edge guard has reappeared');

if (!process.exitCode) {
  console.log(`PASS: immigration knowledge routes are aligned (${client.size} canonical category/topic URLs)`);
}

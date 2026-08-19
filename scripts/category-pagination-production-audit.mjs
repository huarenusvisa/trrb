const ORIGIN = (process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/$/, '');
const checks = [];
let failures = 0;

function check(ok, label, detail = '') {
  const pass = Boolean(ok);
  checks.push({ ok: pass, label, detail });
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function get(path, { redirect = 'follow', head = false } = {}) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method: head ? 'HEAD' : 'GET',
    redirect,
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'TRRB-Category-Pagination-Audit/1.0'
    }
  });
  return {
    status: response.status,
    headers: response.headers,
    text: head ? '' : await response.text()
  };
}

function canonical(html = '') {
  return (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) ||
    html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i) || [])[1] || '';
}

function articleLinks(html = '') {
  return [...html.matchAll(/<article\b[^>]*class=["'][^"']*archive-card[^"']*["'][^>]*>[\s\S]*?<a\s+href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

const stamp = Date.now();
const p1 = await get(`/important-news?cat-audit=${stamp}`);
const p2 = await get(`/important-news?page=2&cat-audit=${stamp}`);
const p9999 = await get(`/important-news?page=9999&cat-audit=${stamp}`);
const asylum = await get(`/asylum?cat-audit=${stamp}`);
const asylum2 = await get(`/asylum?page=2&cat-audit=${stamp}`);
const ice = await get(`/ice/news?cat-audit=${stamp}`);

const p1Links = articleLinks(p1.text);
const p2Links = articleLinks(p2.text);
const overlap = p1Links.filter((url) => p2Links.includes(url));

check(p1.status === 200, '重要新闻第一页 HTTP 200', `status=${p1.status}`);
check(p2.status === 200, '重要新闻第二页 HTTP 200', `status=${p2.status}`);
check(p1.headers.get('x-trrb-category-pagination') === 'server-v1', '第一页使用服务器分页', p1.headers.get('x-trrb-category-pagination') || 'missing');
check(p2.headers.get('x-trrb-category-pagination') === 'server-v1', '第二页使用服务器分页', p2.headers.get('x-trrb-category-pagination') || 'missing');
check(p1.headers.get('x-trrb-category-page') === '1', '第一页响应页码为1', p1.headers.get('x-trrb-category-page') || 'missing');
check(p2.headers.get('x-trrb-category-page') === '2', '第二页响应页码为2', p2.headers.get('x-trrb-category-page') || 'missing');
check(canonical(p1.text) === `${ORIGIN}/important-news`, '第一页 canonical 正确', canonical(p1.text));
check(canonical(p2.text) === `${ORIGIN}/important-news?page=2`, '第二页 canonical 保留 page=2', canonical(p2.text));
check(p1Links.length >= 12 && p2Links.length >= 12, '前两页均含稳定文章内链', `page1=${p1Links.length}; page2=${p2Links.length}`);
check(overlap.length === 0, '第一页与第二页文章不重复', `overlap=${overlap.length}`);

check(p9999.status === 404, '越界分页返回404', `status=${p9999.status}`);
check(/noindex/i.test(p9999.headers.get('x-robots-tag') || '') && /noindex/i.test(p9999.text), '越界分页双层 noindex');

const asylumLinks = articleLinks(asylum.text);
const asylum2Links = articleLinks(asylum2.text);
check(asylum.status === 200, '庇护百科主题聚合 HTTP 200', `status=${asylum.status}`);
check(Number(asylum.headers.get('x-trrb-category-total') || 0) >= 24, '庇护百科有真实主题聚合数据', `total=${asylum.headers.get('x-trrb-category-total') || 'missing'}`);
check(asylumLinks.length >= 12, '庇护百科首包含真实文章内链', `links=${asylumLinks.length}`);
check(asylum2.status === 200 && asylum2Links.length >= 12, '庇护百科第二页可抓取', `status=${asylum2.status}; links=${asylum2Links.length}`);
check(canonical(asylum.text) === `${ORIGIN}/asylum`, '庇护百科 canonical 正确', canonical(asylum.text));

const iceLinks = articleLinks(ice.text);
check(ice.status === 200, 'ICE新闻列表 HTTP 200', `status=${ice.status}`);
check(ice.headers.get('x-trrb-category-pagination') === 'server-v1', 'ICE新闻使用统一服务器分页', ice.headers.get('x-trrb-category-pagination') || 'missing');
check(iceLinks.length >= 12, 'ICE新闻首包含真实文章内链', `links=${iceLinks.length}`);
check(iceLinks.every((url) => /^\/ice\//.test(url)), 'ICE新闻卡片只指向ICE文章规范路径', `nonIce=${iceLinks.filter((url) => !/^\/ice\//.test(url)).length}`);
check(canonical(ice.text) === `${ORIGIN}/ice/news`, 'ICE新闻 canonical 正确', canonical(ice.text));

const rawCategory = await get(`/listing.html?category=${encodeURIComponent('重要新闻')}`, { redirect: 'manual' });
check(rawCategory.status === 301 && rawCategory.headers.get('location') === `${ORIGIN}/important-news`, 'raw 分类URL 301到漂亮路径', `status=${rawCategory.status}; location=${rawCategory.headers.get('location') || ''}`);

const unknownCategory = await get(`/listing.html?category=${encodeURIComponent('不存在栏目')}&cat-audit=${stamp}`);
check(unknownCategory.status === 200, '未知分类模板仍可安全响应', `status=${unknownCategory.status}`);
check(/noindex/i.test(unknownCategory.headers.get('x-robots-tag') || '') && /noindex/i.test(unknownCategory.text), '未知分类双层 noindex');
check(canonical(unknownCategory.text) === `${ORIGIN}/listing`, '未知分类 canonical 归一到 /listing', canonical(unknownCategory.text));

const uscis = await get(`/uscis?cat-audit=${stamp}`, { redirect: 'manual' });
check(uscis.status === 301 && uscis.headers.get('location') === `${ORIGIN}/immigration`, '停用 USCIS 栏目归并移民现役栏目', `status=${uscis.status}; location=${uscis.headers.get('location') || ''}`);

const centerHtml = await get(`/immigrate/center.html?path=study&topic=f1&cat-audit=${stamp}`, { redirect: 'manual' });
check(centerHtml.status === 301 && centerHtml.headers.get('location') === `${ORIGIN}/immigrate/center?path=study&topic=f1`, '知识中心 .html 301到 clean URL', `status=${centerHtml.status}; location=${centerHtml.headers.get('location') || ''}`);

const invalidPath = await get(`/immigrate/center?path=not-real&cat-audit=${stamp}`, { redirect: 'manual' });
check(invalidPath.status === 301 && invalidPath.headers.get('location') === `${ORIGIN}/immigrate/`, '无效知识 path 301回知识库 hub', `status=${invalidPath.status}; location=${invalidPath.headers.get('location') || ''}`);

const invalidTopic = await get(`/immigrate/center?path=study&topic=not-real&cat-audit=${stamp}`, { redirect: 'manual' });
check(invalidTopic.status === 301 && invalidTopic.headers.get('location') === `${ORIGIN}/immigrate/center?path=study`, '无效知识 topic 301回合法分类', `status=${invalidTopic.status}; location=${invalidTopic.headers.get('location') || ''}`);

const trumpLegacy = await get(`/trump/?cat-audit=${stamp}`, { redirect: 'manual' });
check(trumpLegacy.status === 301 && trumpLegacy.headers.get('location') === `${ORIGIN}/trump`, 'Trump尾斜杠实现URL 301到规范入口', `status=${trumpLegacy.status}; location=${trumpLegacy.headers.get('location') || ''}`);

const people = await get(`/people/?cat-audit=${stamp}`, { redirect: 'manual' });
check(people.status === 410 && /noindex/i.test(people.headers.get('x-robots-tag') || ''), 'People退役入口保持410+noindex', `status=${people.status}`);

const health = await get(`/health.html?cat-audit=${stamp}`);
check(health.status === 200 && /noindex/i.test(health.headers.get('x-robots-tag') || '') && /noindex/i.test(health.text), '部署检测页保持双层noindex', `status=${health.status}`);

console.log(`CATEGORY PAGINATION PRODUCTION AUDIT: ${failures ? 'FAIL' : 'PASS'} (${checks.length - failures}/${checks.length})`);
if (failures) process.exit(1);

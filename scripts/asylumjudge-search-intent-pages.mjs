import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative as relativePath, sep } from 'node:path';

const ORIGIN = 'https://asylumjudge.com';
const KEYWORD_PAGES = [
  {
    locale: 'zh-Hans',
    relative: 'asylum-judge-approval-rate',
    canonical: `${ORIGIN}/asylum-judge-approval-rate/`,
    alternate: `${ORIGIN}/en/asylum-judge-rating/`,
    title: '庇护法官通过率查询｜美国移民法官批准率、拒绝率与案件数据 | AsylumJudge',
    description: '查询美国庇护法官（移民法官）历史通过率、批准率、拒绝率、案件样本量、法院和年度趋势。AsylumJudge依据EOIR公开裁决数据整理。',
    h1: '美国庇护法官通过率查询',
    eyebrow: 'ASYLUMJUDGE · ASYLUM APPROVAL DATA',
    intro: '“庇护法官”是华语申请人常用的搜索说法，正式称呼通常是美国移民法官（Immigration Judge）。AsylumJudge汇总公开EOIR裁决数据，帮助你按法官、法院、州和申请人国籍查看历史庇护批准率、拒绝率与案件样本量。',
    cta: '进入法官数据库',
    home: '/',
    nav: [
      ['查移民法官', '/'], ['法院通过率', '/courts/'], ['各州数据', '/states/'], ['国籍数据', '/nationality/'], ['法官背景', '/judge-backgrounds/']
    ],
    faq: [
      ['庇护法官通过率是什么意思？', '通常指某位美国移民法官在可识别庇护裁决中的历史批准比例。AsylumJudge同时展示拒绝、其他结果与样本量，避免只看一个百分比。'],
      ['通过率怎么计算？', '核心裁决批准率按批准 ÷（批准 + 拒绝）计算；撤回、行政结案等其他程序结果单独展示。页面会同时标明样本量和统计期间。'],
      ['法官通过率能预测我的案件吗？', '不能。历史统计只能说明过去裁决分布，个案结果仍取决于事实、证据、法律标准、程序状态和具体审理情况。'],
      ['数据来自哪里？', '统计基础来自美国司法部移民审查执行办公室（EOIR）公开数据；AsylumJudge对法官、法院、州和国籍结果进行整理和展示。']
    ]
  },
  {
    locale: 'en',
    relative: 'en/asylum-judge-rating',
    canonical: `${ORIGIN}/en/asylum-judge-rating/`,
    alternate: `${ORIGIN}/asylum-judge-approval-rate/`,
    title: 'Asylum Judge Rating & Immigration Judge Approval Rate Lookup | AsylumJudge',
    description: 'Look up U.S. asylum judge ratings, immigration judge approval rates, denial rates, case samples, court assignments, and historical EOIR asylum decision data.',
    h1: 'Asylum Judge Rating and Approval Rate Lookup',
    eyebrow: 'ASYLUMJUDGE · IMMIGRATION JUDGE DATA',
    intro: 'People often search for an “asylum judge rating,” although the official role is U.S. Immigration Judge. AsylumJudge does not score or recommend judges. It organizes historical EOIR asylum decisions so you can compare approval rates, denial rates, sample sizes, court assignments, and trends with the proper context.',
    cta: 'Search immigration judges',
    home: '/en/',
    nav: [
      ['Find judges', '/en/'], ['Court approval rates', '/en/courts/'], ['State data', '/en/states/'], ['Nationality outcomes', '/en/nationality/'], ['Judge backgrounds', '/en/judge-backgrounds/']
    ],
    faq: [
      ['What does “asylum judge rating” mean?', 'It is a common search phrase for historical statistics about an immigration judge. AsylumJudge reports observed decision outcomes rather than assigning a subjective score.'],
      ['How is the asylum approval rate calculated?', 'The core adjudicated approval rate is grants divided by grants plus denials. Other procedural outcomes are shown separately, together with sample size and data period.'],
      ['Can a judge approval rate predict my case?', 'No. Historical statistics describe past outcomes and cannot predict an individual case. Facts, evidence, law, procedure, and the record before the court matter.'],
      ['Where does AsylumJudge get its data?', 'The underlying statistics are compiled from public Executive Office for Immigration Review (EOIR) data and organized by judge, court, state, nationality, and time period.']
    ]
  }
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

function pageHtml(page) {
  const english = page.locale === 'en';
  const faqSchema = page.faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: page.h1, url: page.canonical, description: page.description, isPartOf: { '@type': 'WebSite', name: 'AsylumJudge.com', url: ORIGIN } },
      { '@type': 'FAQPage', mainEntity: faqSchema }
    ]
  };
  const options = '<option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="pt-BR">PT-BR</option><option value="hi">HI</option><option value="zh-Hans">简中</option><option value="zh-Hant">繁中</option><option value="ru">RU</option><option value="ar">AR</option><option value="tr">TR</option>';
  return `<!doctype html>
<html lang="${page.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${page.canonical}">
  <link rel="alternate" hreflang="${page.locale}" href="${page.canonical}">
  <link rel="alternate" hreflang="${english ? 'zh-Hans' : 'en'}" href="${page.alternate}">
  <link rel="alternate" hreflang="x-default" href="${english ? page.canonical : page.alternate}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${page.canonical}">
  <meta property="og:image" content="${ORIGIN}/asylumjudge/og-logo.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/asylumjudge/site.css?v=39">
  <style>
    .keyword-shell{max-width:1040px;margin:0 auto;padding:44px 24px 72px}.keyword-hero{padding:38px 0 28px}.keyword-hero .eyebrow{font-weight:800;letter-spacing:.08em}.keyword-hero h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.08;margin:.5rem 0 1rem}.keyword-hero .lead{font-size:1.08rem;line-height:1.8;max-width:850px}.keyword-cta{display:inline-flex;margin-top:18px;padding:12px 18px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-weight:800}.keyword-nav{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 32px}.keyword-nav a{padding:9px 12px;border:1px solid #d9dde3;border-radius:999px;text-decoration:none;color:inherit}.keyword-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.keyword-card{border:1px solid #e2e5e9;border-radius:16px;padding:20px;background:#fff}.keyword-card h2{margin:.1rem 0 .65rem;font-size:1.1rem}.keyword-card p{margin:0;line-height:1.7;color:#424850}@media(max-width:760px){.keyword-grid{grid-template-columns:1fr}.keyword-shell{padding:28px 18px 54px}}
  </style>
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body data-asylum-locale="${page.locale}">
  <a class="skip-link" href="#main-content">${english ? 'Skip to main content' : '跳到主要内容'}</a>
  <header class="site-header"><div class="shell header-inner">
    <a class="brand" href="${page.home}" aria-label="AsylumJudge.com"><img class="brand-lockup" src="/asylumjudge/logo.svg" alt="AsylumJudge.com"></a>
    <nav class="home-nav" aria-label="${english ? 'Primary navigation' : '主要导航'}">${page.nav.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</nav>
    <label class="home-language-control" for="site-language-select"><span data-language-label>${english ? 'Language' : '语言'}</span><select id="site-language-select" aria-label="${english ? 'Language' : '语言'}">${options}</select></label>
  </div></header>
  <main id="main-content" tabindex="-1" class="keyword-shell">
    <section class="keyword-hero">
      <div class="eyebrow">${escapeHtml(page.eyebrow)}</div>
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="lead">${escapeHtml(page.intro)}</p>
      <a class="keyword-cta" href="${page.home}#judge-search">${escapeHtml(page.cta)} →</a>
      <div class="keyword-nav">${page.nav.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</div>
    </section>
    <section class="keyword-grid" aria-label="${english ? 'Frequently asked questions' : '常见问题'}">
      ${page.faq.map(([q, a]) => `<article class="keyword-card"><h2>${escapeHtml(q)}</h2><p>${escapeHtml(a)}</p></article>`).join('\n      ')}
    </section>
  </main>
  <footer class="judge-footer"><div class="judge-shell"><b>AsylumJudge.com</b><span>${english ? 'Public EOIR immigration court data · continuously updated' : 'EOIR公开移民法院数据 · 持续更新'}</span></div></footer>
  <script src="/asylumjudge/language-route-hardening.js?v=1"></script>
  <script src="/asylumjudge/domain-brand.js?v=13"></script>
</body>
</html>\n`;
}

function insertBeforeMainEnd(html, block) {
  if (!html.includes('</main>') || html.includes('data-search-intent-link="true"')) return html;
  return html.replace('</main>', `${block}\n</main>`);
}

function homeIntentBlock(locale) {
  if (locale === 'en') {
    return `<section class="lookup-section" data-search-intent-link="true"><div class="shell"><div class="content-heading"><span>ASYLUM JUDGE RATING</span><h2>Looking for an asylum judge rating?</h2><p>Use our dedicated guide to understand immigration judge approval rates, denial rates, sample sizes, and what the statistics can—and cannot—tell you.</p><a href="/en/asylum-judge-rating/">Asylum judge rating & approval rate lookup →</a></div></div></section>`;
  }
  return `<section class="lookup-section" data-search-intent-link="true"><div class="shell"><div class="content-heading"><span>庇护法官通过率</span><h2>查询庇护法官通过率</h2><p>查看移民法官历史批准率、拒绝率、案件样本量、法院和年度趋势，并了解统计口径与使用限制。</p><a href="/asylum-judge-approval-rate/">庇护法官通过率查询 →</a></div></div></section>`;
}

function entityIntentBlock(locale) {
  if (locale === 'en') {
    return `<section class="detail-section" data-search-intent-link="true"><h2>Understand immigration judge approval rates</h2><p>Compare this profile with the site-wide explanation of asylum judge ratings, sample sizes, approval rates, and limitations.</p><a href="/en/asylum-judge-rating/">Asylum judge rating & approval rate guide →</a></section>`;
  }
  return `<section class="detail-section" data-search-intent-link="true"><h2>了解庇护法官通过率</h2><p>结合样本量、批准率、拒绝率和统计期间阅读法官数据，不要仅凭单一百分比判断个案。</p><a href="/asylum-judge-approval-rate/">庇护法官通过率说明与查询 →</a></section>`;
}

function brandAsylumJudgeHtml(html) {
  let next = html
    .replace(/TRRB · EOIR JUDGE PROFILE/g, 'ASYLUMJUDGE · IMMIGRATION JUDGE PROFILE')
    .replace(/TRRB · STATE ASYLUM DATA/g, 'ASYLUMJUDGE · STATE ASYLUM DATA')
    .replace(/TRRB · COURT ASYLUM DATA/g, 'ASYLUMJUDGE · COURT ASYLUM DATA')
    .replace(/<a href="\/"><img src="\/trrb-logo-cropped\.webp" alt="[^"]*"><\/a>/g, '<a class="asylumjudge-logo" href="/"><img class="asylumjudge-lockup" src="/asylumjudge/logo.svg" alt="AsylumJudge.com"></a>')
    .replace(/<b>Tang Ren Daily · AsylumJudge<\/b>/g, '<b>AsylumJudge.com</b>');
  if (!next.includes('/asylumjudge/language-route-hardening.js')) {
    next = next.replace('</head>', '  <script src="/asylumjudge/language-route-hardening.js?v=1"></script>\n</head>');
  }
  return next;
}

async function walkHtml(root) {
  const out = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === 'index.html') out.push(path);
    }
  }
  await visit(root);
  return out;
}

async function appendStaticSitemap(output) {
  const path = join(output, 'sitemap-static.xml');
  let xml = await readFile(path, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  for (const page of KEYWORD_PAGES) {
    if (xml.includes(`<loc>${page.canonical}</loc>`)) continue;
    const row = `  <url><loc>${page.canonical}</loc><lastmod>${today}</lastmod></url>`;
    xml = xml.replace('</urlset>', `${row}\n</urlset>`);
  }
  await writeFile(path, xml);
}

export async function applyAsylumJudgeSearchIntent({ output }) {
  for (const page of KEYWORD_PAGES) {
    const path = join(output, ...page.relative.split('/'), 'index.html');
    await ensureParent(path);
    await writeFile(path, pageHtml(page));
  }

  for (const [path, locale] of [[join(output, 'index.html'), 'zh-Hans'], [join(output, 'en', 'index.html'), 'en']]) {
    let html = await readFile(path, 'utf8');
    html = brandAsylumJudgeHtml(html);
    html = insertBeforeMainEnd(html, homeIntentBlock(locale));
    await writeFile(path, html);
  }

  const htmlFiles = await walkHtml(output);
  let branded = 0;
  let linked = 0;
  for (const path of htmlFiles) {
    const rel = relativePath(output, path).split(sep).join('/');
    if (rel === 'index.html' || rel === 'en/index.html' || rel.endsWith('asylum-judge-approval-rate/index.html') || rel.endsWith('asylum-judge-rating/index.html')) continue;
    let html = await readFile(path, 'utf8');
    const before = html;
    html = brandAsylumJudgeHtml(html);
    if (html !== before) branded += 1;
    const isEnglish = rel.startsWith('en/');
    const isChinese = !/^([a-z]{2}|pt-br|zh-hant)\//.test(rel);
    const isEntity = /^(?:en\/)?(?:judges|courts)\/[^/]+\/index\.html$/.test(rel);
    if (isEntity && (isEnglish || isChinese)) {
      const next = insertBeforeMainEnd(html, entityIntentBlock(isEnglish ? 'en' : 'zh-Hans'));
      if (next !== html) linked += 1;
      html = next;
    }
    if (html !== before) await writeFile(path, html);
  }

  await appendStaticSitemap(output);
  console.log(`AsylumJudge search-intent hardening complete: ${KEYWORD_PAGES.length} keyword pages, ${branded} branded pages, ${linked} entity internal links.`);
}

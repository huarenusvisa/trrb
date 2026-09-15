import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative as relativePath, sep } from 'node:path';

const ORIGIN = 'https://asylumjudge.com';
const CORE_KEYWORD_PAGES = [
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

const TOOL_TOPICS = [
  {
    slug: 'eoir-case-status',
    officialUrl: 'https://acis.eoir.justice.gov/',
    zh: {
      title: '移民法庭上庭案件查询｜EOIR案件状态与开庭信息 | AsylumJudge',
      description: '通过EOIR官方ACIS系统查询移民法庭案件状态、下一次开庭日期和法院信息，并了解查询前需要准备的案件号码。',
      h1: '移民法庭上庭案件查询',
      intro: '使用美国司法部EOIR的Automated Case Information System（ACIS）查询移民法庭案件状态、下一次开庭安排和法院信息。本站不收集或保存A-Number；点击后直接进入EOIR官网。',
      cta: '前往EOIR案件查询',
      faq: [
        ['在哪里查询移民法庭上庭日期？', '进入EOIR官方ACIS系统，按页面要求输入案件号码，即可查看系统当前显示的下一次开庭日期、时间和法院。'],
        ['为什么查询不到案件？', '案件可能尚未录入系统、号码输入有误，或由其他机构处理。请以法院通知和律师提供的信息为准。'],
        ['本站会保存案件号码吗？', '不会。AsylumJudge只提供官方入口和一般说明，不设置案件号码输入框，也不收集查询内容。']
      ]
    },
    en: {
      title: 'EOIR Case Status & Immigration Court Hearing Lookup | AsylumJudge',
      description: 'Open the official EOIR ACIS portal to check immigration court case status, the next hearing date, time, and court information.',
      h1: 'EOIR Immigration Court Case Status Lookup',
      intro: 'Use the Executive Office for Immigration Review Automated Case Information System (ACIS) to check the case status, next hearing date, time, and court information shown by EOIR. AsylumJudge does not collect or store A-Numbers.',
      cta: 'Open official EOIR case lookup',
      faq: [
        ['Where can I check an immigration court hearing date?', 'Use the official EOIR ACIS portal and follow its instructions to view the next hearing information currently shown for a case.'],
        ['Why might a case not appear?', 'The case may not yet be entered, the number may be incorrect, or another agency may have jurisdiction. Court notices remain controlling.'],
        ['Does AsylumJudge store A-Numbers?', 'No. This page links directly to EOIR and does not include a local case-number form.']
      ]
    }
  },
  {
    slug: 'ice-detainee-locator',
    officialUrl: 'https://locator.ice.gov/odls',
    zh: {
      title: 'ICE查人｜ICE被拘留人员查询与拘留地点查找 | AsylumJudge',
      description: '进入ICE官方Online Detainee Locator System，按A-Number或身份信息查询可能被ICE拘留的人员及拘留地点。',
      h1: 'ICE查人与被拘留人员查询',
      intro: 'ICE Online Detainee Locator System用于查找可能由美国移民与海关执法局拘留的人员。可以按官方系统要求使用A-Number或姓名、出生信息查询；本站不收集这些资料。',
      cta: '前往ICE官方查人',
      faq: [
        ['ICE查人需要什么资料？', '官方系统通常提供按A-Number查询或按姓名、出生日期和出生国等身份信息查询的方式，请以页面最新要求为准。'],
        ['刚被ICE带走为什么查不到？', '拘留信息可能尚未同步，或者人员不在该系统覆盖范围内。紧急情况下应联系律师、ICE相关办公室或拘留设施。'],
        ['本站会保存查询信息吗？', '不会。点击按钮后直接进入ICE官网，AsylumJudge不设置本地查询表格。']
      ]
    },
    en: {
      title: 'ICE Detainee Locator｜Find a Person in ICE Custody | AsylumJudge',
      description: 'Open the official ICE Online Detainee Locator System to search for a person who may be in ICE custody using an A-Number or identity information.',
      h1: 'ICE Online Detainee Locator',
      intro: 'The ICE Online Detainee Locator System helps users locate a person who may be in U.S. Immigration and Customs Enforcement custody. Search options and required information are controlled by ICE. AsylumJudge does not collect search details.',
      cta: 'Open the official ICE locator',
      faq: [
        ['What information does the ICE locator use?', 'The official portal generally offers an A-Number search and an identity-information search. Follow the current instructions on the ICE page.'],
        ['Why might a recently detained person not appear?', 'Records may not yet have synchronized, or the person may not be covered by the locator. Contact counsel or the relevant ICE office for urgent matters.'],
        ['Does AsylumJudge save search information?', 'No. The link opens the official ICE website and this page has no local detainee-search form.']
      ]
    }
  },
  {
    slug: 'eoir-33-change-address',
    officialUrl: 'https://respondentaccess.eoir.justice.gov/en/forms/',
    zh: {
      title: 'EOIR-33更改地址｜移民法院地址变更表与在线入口 | AsylumJudge',
      description: '查找EOIR-33/IC和EOIR-33/BIA地址变更表及官方在线入口，区分移民法院案件与移民上诉委员会案件。',
      h1: 'EOIR-33移民法院更改地址',
      intro: '地址发生变化时，应根据案件所在机构选择正确表格：移民法院案件通常使用EOIR-33/IC，移民上诉委员会案件使用EOIR-33/BIA。请进入EOIR官方表格页面核对并提交。',
      cta: '前往EOIR官方表格',
      faq: [
        ['EOIR-33/IC和EOIR-33/BIA有什么区别？', 'EOIR-33/IC用于移民法院案件；EOIR-33/BIA用于移民上诉委员会案件。应按案件当前所在机构选择。'],
        ['只在USCIS改地址可以吗？', '不同机构的地址记录可能并不自动同步。请根据自己案件涉及的机构逐一核对官方地址变更要求。'],
        ['“E33”是不是EOIR-33？', '很多中文用户会搜索“E33”，通常指EOIR-33地址变更表。正式表格名称是EOIR-33。']
      ]
    },
    en: {
      title: 'EOIR-33 Change of Address｜Immigration Court & BIA Forms | AsylumJudge',
      description: 'Find the official EOIR-33/IC and EOIR-33/BIA change-of-address forms and distinguish immigration court cases from Board of Immigration Appeals cases.',
      h1: 'EOIR-33 Change of Address',
      intro: 'Choose the form for the agency currently handling the case: EOIR-33/IC is generally for immigration court matters, while EOIR-33/BIA is for matters before the Board of Immigration Appeals. Use the official EOIR forms page for current instructions.',
      cta: 'Open official EOIR forms',
      faq: [
        ['What is the difference between EOIR-33/IC and EOIR-33/BIA?', 'EOIR-33/IC is for immigration court matters; EOIR-33/BIA is for Board of Immigration Appeals matters.'],
        ['Is changing an address with USCIS enough?', 'Agency address systems may not automatically synchronize. Review the requirements of every agency handling the matter.'],
        ['Is “E33” the same as EOIR-33?', 'People sometimes shorten the search term to “E33,” but the official form name is EOIR-33.']
      ]
    }
  },
  {
    slug: 'uscis-case-status',
    officialUrl: 'https://egov.uscis.gov/',
    zh: {
      title: 'USCIS案件状态查询｜移民申请收据号码查询 | AsylumJudge',
      description: '进入USCIS官方案件状态系统，使用收据号码查询移民申请、请愿或其他案件的最新在线状态。',
      h1: 'USCIS案件状态查询',
      intro: '使用USCIS官方Case Status Online系统，按页面提示输入收据号码，查看移民申请或请愿的在线状态。本站不收集或保存USCIS收据号码。',
      cta: '前往USCIS官方查询',
      faq: [
        ['USCIS案件状态用什么号码查询？', '通常使用USCIS收据通知上的收据号码，并按官方页面提示输入。'],
        ['在线状态和纸质通知不一致怎么办？', '系统更新可能存在时间差。涉及期限、补件或面谈时，应仔细核对纸质通知和USCIS账户信息。'],
        ['本站会记录收据号码吗？', '不会。点击后直接进入USCIS官方网站，本站没有收据号码输入框。']
      ]
    },
    en: {
      title: 'USCIS Case Status Online｜Receipt Number Lookup | AsylumJudge',
      description: 'Open the official USCIS Case Status Online system to check the latest available status of an immigration application or petition using a receipt number.',
      h1: 'USCIS Case Status Online',
      intro: 'Use the official USCIS Case Status Online system and follow its instructions to enter a receipt number. AsylumJudge does not collect or store USCIS receipt numbers.',
      cta: 'Open official USCIS case status',
      faq: [
        ['What number is used for USCIS case status?', 'Use the receipt number shown on the USCIS receipt notice and follow the official page instructions.'],
        ['What if the online status differs from a mailed notice?', 'Online updates may lag. Carefully review mailed notices and the USCIS account for deadlines, evidence requests, or appointments.'],
        ['Does AsylumJudge store receipt numbers?', 'No. The link opens the official USCIS website and this page contains no local receipt-number form.']
      ]
    }
  },
  {
    slug: 'immigration-court-asylum-fee',
    officialUrl: 'https://epay.eoir.justice.gov/',
    zh: {
      title: '庇护年费缴纳｜移民法庭EOIR Payment Portal入口 | AsylumJudge',
      description: '进入EOIR Payment Portal核对并缴纳适用于移民法庭案件的庇护年费或其他EOIR费用，付款前确认案件与官方通知。',
      h1: '移民法庭庇护年费缴纳',
      intro: '如官方通知或案件要求适用费用，请通过EOIR Payment Portal核对付款项目并完成缴费。费用、适用对象和截止日期可能变化，付款前应以EOIR当前页面和个人案件通知为准，并保存付款凭证。',
      cta: '前往EOIR官方缴费',
      faq: [
        ['庇护年费在哪里缴纳？', '移民法庭案件的适用付款可通过EOIR官方Payment Portal办理，请先核对官方通知和案件信息。'],
        ['每个人都需要缴纳吗？', '是否适用、金额和期限取决于当前规则及个人案件情况。不要只凭第三方说明付款，应核对EOIR官网和案件通知。'],
        ['付款后要保留什么？', '建议保存确认页面、收据或其他付款凭证，并核对付款是否对应正确案件和费用项目。']
      ]
    },
    en: {
      title: 'Immigration Court Asylum Fee Payment｜EOIR Payment Portal | AsylumJudge',
      description: 'Open the EOIR Payment Portal to review and pay an applicable immigration court asylum fee or other EOIR fee after confirming the case and official notice.',
      h1: 'Immigration Court Asylum Fee Payment',
      intro: 'If an official notice or current rule requires a payment, use the EOIR Payment Portal to confirm the payment category and complete the transaction. Applicability, amounts, and deadlines can change; verify current EOIR instructions and retain the receipt.',
      cta: 'Open the official EOIR payment portal',
      faq: [
        ['Where can an applicable immigration court asylum fee be paid?', 'Use the official EOIR Payment Portal after checking the case information and official notice.'],
        ['Does every applicant have to pay?', 'Applicability, amount, and deadline depend on current rules and the individual matter. Verify official EOIR instructions before paying.'],
        ['What should be retained after payment?', 'Keep the confirmation page, receipt, or other proof and verify that the payment was applied to the correct case and fee category.']
      ]
    }
  }
];

const TOOL_KEYWORD_PAGES = TOOL_TOPICS.flatMap((topic) => {
  const zhRelative = topic.slug;
  const enRelative = `en/${topic.enSlug || topic.slug}`;
  const sharedZhNav = [
    ['全部官方工具', '/tools/'], ['移民法院地址', '/courts/'], ['查移民法官', '/'], ['庇护通过率', '/asylum-judge-approval-rate/']
  ];
  const sharedEnNav = [
    ['All official tools', '/en/tools/'], ['Court addresses', '/en/courts/'], ['Find immigration judges', '/en/'], ['Asylum approval rates', '/en/asylum-judge-rating/']
  ];
  return [
    {
      ...topic.zh,
      locale: 'zh-Hans', relative: zhRelative, canonical: `${ORIGIN}/${zhRelative}/`, alternate: `${ORIGIN}/${enRelative}/`,
      eyebrow: 'ASYLUMJUDGE · OFFICIAL IMMIGRATION TOOL', home: '/', nav: sharedZhNav,
      ctaHref: topic.officialUrl, ctaExternal: true
    },
    {
      ...topic.en,
      locale: 'en', relative: enRelative, canonical: `${ORIGIN}/${enRelative}/`, alternate: `${ORIGIN}/${zhRelative}/`,
      eyebrow: 'ASYLUMJUDGE · OFFICIAL IMMIGRATION TOOL', home: '/en/', nav: sharedEnNav,
      ctaHref: topic.officialUrl, ctaExternal: true
    }
  ];
});

const KEYWORD_PAGES = [...CORE_KEYWORD_PAGES, ...TOOL_KEYWORD_PAGES];

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
  const options = '<option value="en">EN</option><option value="zh-Hans">简中</option>';
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
  <link rel="stylesheet" href="/asylumjudge/site.css?v=40">
  <style>
    .keyword-shell{max-width:1040px;margin:0 auto;padding:44px 24px 72px}.keyword-hero{padding:38px 0 28px}.keyword-hero .eyebrow{font-weight:800;letter-spacing:.08em}.keyword-hero h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.08;margin:.5rem 0 1rem}.keyword-hero .lead{font-size:1.08rem;line-height:1.8;max-width:850px}.keyword-cta{display:inline-flex;margin-top:18px;padding:12px 18px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-weight:800}.keyword-nav{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 32px}.keyword-nav a{padding:9px 12px;border:1px solid #d9dde3;border-radius:999px;text-decoration:none;color:inherit}.keyword-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.keyword-card{border:1px solid #e2e5e9;border-radius:16px;padding:20px;background:#fff}.keyword-card h2{margin:.1rem 0 .65rem;font-size:1.1rem}.keyword-card p{margin:0;line-height:1.7;color:#424850}@media(max-width:760px){.keyword-grid{grid-template-columns:1fr}.keyword-shell{padding:28px 18px 54px}}
  </style>
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body data-asylum-locale="${page.locale}" data-search-intent-page="${escapeHtml(page.relative)}">
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
      <a class="keyword-cta" href="${page.ctaHref || `${page.home}#judge-search`}"${page.ctaExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(page.cta)} →</a>
      <div class="keyword-nav">${page.nav.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</div>
    </section>
    <section class="keyword-grid" aria-label="${english ? 'Frequently asked questions' : '常见问题'}">
      ${page.faq.map(([q, a]) => `<article class="keyword-card"><h2>${escapeHtml(q)}</h2><p>${escapeHtml(a)}</p></article>`).join('\n      ')}
    </section>
  </main>
  <footer class="judge-footer"><div class="judge-shell"><b>AsylumJudge.com</b><span>${english ? 'Public EOIR immigration court data · continuously updated' : 'EOIR公开移民法院数据 · 持续更新'}</span></div></footer>
  <script src="/asylumjudge/language-route-hardening.js?v=1"></script>
  <script src="/asylumjudge/domain-brand.js?v=12"></script>
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

function toolsIntentBlock(locale) {
  const english = locale === 'en';
  const rows = TOOL_TOPICS.map((topic) => {
    const relative = english ? `/en/${topic.enSlug || topic.slug}/` : `/${topic.slug}/`;
    const copy = english ? topic.en : topic.zh;
    return `<a href="${relative}" style="display:flex;flex-direction:column;gap:4px;padding:14px;border:1px solid #dfe5e1;border-radius:12px;background:#fff;color:#101828;text-decoration:none"><b>${escapeHtml(copy.h1)}</b><span style="color:#667085;font-size:12px;line-height:1.55">${escapeHtml(copy.description)}</span></a>`;
  }).join('');
  return `<section class="tools-warning search-intent-directory" data-search-intent-link="true"><h2>${english ? 'Official immigration lookup guides' : '官方移民查询专题'}</h2><p>${english ? 'Open a focused guide for each service before continuing to the official government portal.' : '按事项查看查询方法、注意事项和对应的美国政府官方入口。'}</p><div class="keyword-directory-links" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:18px">${rows}</div></section>`;
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
      // Ignore transient copy/sync directories that may appear while the
      // generated bundle is being mirrored by the local preview runtime.
      if (entry.name.startsWith('.')) continue;
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

  for (const [path, locale] of [[join(output, 'tools', 'index.html'), 'zh-Hans'], [join(output, 'en', 'tools', 'index.html'), 'en']]) {
    let html = await readFile(path, 'utf8');
    html = insertBeforeMainEnd(html, toolsIntentBlock(locale));
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

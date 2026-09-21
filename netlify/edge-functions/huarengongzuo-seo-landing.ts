const SITE = "https://huarengongzuo.com";

type Landing = {
  name: string;
  search: string;
  intro: string;
  match: (job: any) => boolean;
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalized = (value: unknown) => clean(value).normalize("NFKC").toLowerCase();
const includesAny = (value: unknown, terms: string[]) => terms.some((term) => normalized(value).includes(term));
const placeText = (job: any) => [job.neighborhood, job.borough, job.county, job.city, job.state_code].map(clean).filter(Boolean).join(" · ");
const workText = (job: any) => [job.title, job.category_slug].map(clean).filter(Boolean).join(" ");
const esc = (value: unknown) => clean(value).replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[ch] || ch));
const escJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");

const LOCATIONS: Record<string, Landing> = {
  "new-york": {
    name: "纽约", search: "New York",
    intro: "查看纽约市及皇后区、法拉盛、曼哈顿、布鲁克林等华人社区的最新招聘信息。餐饮、零售、办公室、护理、司机和服务行业岗位持续更新。",
    match: (job) => includesAny(placeText(job), ["new york", "nyc", "纽约", "queens", "皇后", "flushing", "法拉盛", "brooklyn", "布鲁克林", "manhattan", "曼哈顿", "bronx", "staten island"])
  },
  flushing: {
    name: "法拉盛", search: "Flushing",
    intro: "集中查看纽约法拉盛及周边地区招聘。页面汇总仍在有效期内、可以直接联系招聘方的华人常用岗位，并持续更新餐馆、诊所、办公室和本地服务工作。",
    match: (job) => includesAny(placeText(job), ["flushing", "法拉盛"])
  },
  "los-angeles": {
    name: "洛杉矶", search: "Los Angeles",
    intro: "查看洛杉矶及周边华人社区招聘信息，覆盖餐饮、美容、仓库、司机、办公室和本地服务工作。联系前请确认工作地址、薪资和雇主身份。",
    match: (job) => includesAny(placeText(job), ["los angeles", "洛杉矶"])
  },
  boston: {
    name: "波士顿", search: "Boston",
    intro: "查看波士顿及周边地区面向华人的招聘信息。岗位按更新时间展示，可进入详情页查看工作地点、职位要求和联系方法。",
    match: (job) => includesAny(placeText(job), ["boston", "波士顿"])
  },
  houston: {
    name: "休斯敦", search: "Houston",
    intro: "查看休斯敦及周边地区华人招聘信息，快速查找餐饮、仓库、司机、零售和服务行业岗位，并直接联系招聘方。",
    match: (job) => includesAny(placeText(job), ["houston", "休斯敦", "休斯顿"])
  },
  "san-francisco": {
    name: "旧金山", search: "San Francisco",
    intro: "查看旧金山湾区华人招聘信息，覆盖餐饮、科技、零售、办公室、护理、仓储和本地服务岗位。",
    match: (job) => includesAny(placeText(job), ["san francisco", "旧金山", "三藩市", "bay area"])
  },
  seattle: {
    name: "西雅图", search: "Seattle",
    intro: "查看西雅图及华盛顿州周边最新招聘，按职位和地区进入岗位详情并联系招聘方。",
    match: (job) => includesAny(placeText(job), ["seattle", "西雅图"])
  },
  chicago: {
    name: "芝加哥", search: "Chicago",
    intro: "查看芝加哥地区华人常用招聘岗位，包括餐饮、物流、零售、办公室和专业服务工作。",
    match: (job) => includesAny(placeText(job), ["chicago", "芝加哥"])
  },
  philadelphia: {
    name: "费城", search: "Philadelphia",
    intro: "查看费城及周边地区当前有效招聘，快速查找餐饮、护理、仓库、司机和办公室岗位。",
    match: (job) => includesAny(placeText(job), ["philadelphia", "费城"])
  },
  dallas: {
    name: "达拉斯", search: "Dallas",
    intro: "查看达拉斯及北德州招聘信息，覆盖服务业、物流、司机、零售、办公室和技术岗位。",
    match: (job) => includesAny(placeText(job), ["dallas", "达拉斯"])
  },
  atlanta: {
    name: "亚特兰大", search: "Atlanta",
    intro: "查看亚特兰大都会区最新招聘信息，按工作类别和地点直接进入岗位详情。",
    match: (job) => includesAny(placeText(job), ["atlanta", "亚特兰大"])
  },
  miami: {
    name: "迈阿密", search: "Miami",
    intro: "查看迈阿密及南佛州招聘信息，覆盖餐饮、美容、零售、房地产和本地服务岗位。",
    match: (job) => includesAny(placeText(job), ["miami", "迈阿密"])
  },
  "washington-dc": {
    name: "华盛顿DC", search: "Washington DC",
    intro: "查看华盛顿DC及周边地区招聘，包括办公室、教育、法律、护理、餐饮和技术岗位。",
    match: (job) => includesAny(placeText(job), ["washington", "华盛顿", "district of columbia"])
  }
};

const CATEGORIES: Record<string, Landing> = {
  restaurant: {
    name: "餐馆", search: "餐馆",
    intro: "查找全美华人餐馆工作，包括前台、服务员、企台、收银、厨师、打杂、洗碗和外卖相关岗位。岗位持续更新，联系前请核实排班、薪资和工作地点。",
    match: (job) => includesAny(workText(job), ["restaurant", "餐馆", "餐厅", "厨师", "服务员", "企台", "洗碗", "打杂"])
  },
  driver: {
    name: "司机", search: "司机",
    intro: "查找全美华人司机、卡车、送货和配送工作。可按地区继续筛选，并在联系招聘方前确认驾照要求、车辆安排、保险和薪资计算方式。",
    match: (job) => includesAny(workText(job), ["truck-driver", "司机", "卡车", "驾驶", "送货", "配送"])
  },
  warehouse: {
    name: "仓库", search: "仓库",
    intro: "查找全美华人仓库、物流、打包、理货、叉车和配送中心岗位。页面只汇总当前公开招聘信息，并提供进入岗位详情的直接入口。",
    match: (job) => includesAny(workText(job), ["logistics-warehouse", "仓库", "物流", "打包", "理货", "叉车"])
  },
  "beauty-nail": {
    name: "美甲美容", search: "美甲",
    intro: "查找全美华人美甲、美容、美发和相关服务岗位。联系店家时请确认工作地点、经验要求、底薪或提成方式以及是否合法用工。",
    match: (job) => includesAny(workText(job), ["beauty-nail", "美甲", "美容", "美发", "发型"])
  },
  "home-care": {
    name: "家政护理", search: "家政",
    intro: "查找全美华人家政、保姆、护工、陪护和居家护理岗位。涉及住家工作时，应提前确认休息时间、职责范围、住宿条件和工资支付方式。",
    match: (job) => includesAny(workText(job), ["home-care", "家政", "保姆", "护工", "护理", "陪护", "阿姨"])
  },
  massage: {
    name: "按摩SPA", search: "按摩",
    intro: "查找全美华人按摩、SPA和理疗服务岗位，联系前请确认执照要求、工作内容、排班与薪资。",
    match: (job) => includesAny(workText(job), ["massage", "按摩", "spa", "理疗"])
  },
  construction: {
    name: "装修建筑", search: "装修",
    intro: "查找装修、建筑、木工、电工、水暖、安装和施工相关岗位，确认工地位置、保险和薪资方式。",
    match: (job) => includesAny(workText(job), ["construction", "装修", "建筑", "木工", "电工", "安装"])
  },
  "retail-grocery": {
    name: "超市零售", search: "超市",
    intro: "查找超市、零售、店员、收银、理货和门店销售岗位，按城市查看当前有效招聘。",
    match: (job) => includesAny(workText(job), ["retail-grocery", "超市", "零售", "店员", "收银"])
  },
  "office-admin": {
    name: "办公室行政", search: "办公室",
    intro: "查找办公室、文员、前台、行政、客服和助理岗位，查看工作地点、语言和经验要求。",
    match: (job) => includesAny(workText(job), ["office-admin", "办公室", "文员", "前台", "行政", "助理"])
  },
  "accounting-finance": {
    name: "会计金融", search: "会计",
    intro: "查找会计、记账、报税、财务和金融相关岗位，优先展示信息完整且仍可申请的职位。",
    match: (job) => includesAny(workText(job), ["accounting-finance", "会计", "财务", "金融", "bookkeeper", "accountant"])
  },
  education: {
    name: "教育培训", search: "教育",
    intro: "查找教师、助教、幼教、学校和培训机构岗位，按地区查看工作要求与申请入口。",
    match: (job) => includesAny(workText(job), ["education", "老师", "教师", "幼教", "学校", "培训"])
  },
  "it-tech": {
    name: "IT科技", search: "IT",
    intro: "查找软件、IT、数据、产品、工程和技术支持岗位，进入详情页查看雇主与官方申请入口。",
    match: (job) => includesAny(workText(job), ["it-tech", "软件", "程序", "开发", "工程师", "developer", "engineer"])
  },
  sales: {
    name: "市场销售", search: "销售",
    intro: "查找市场、销售、商务拓展和客户服务岗位，比较工作地点、类型与申请要求。",
    match: (job) => includesAny(workText(job), ["sales", "销售", "市场", "商务", "marketing"])
  }
};

async function loadJobs() {
  const base = clean(Netlify.env.get("SUPABASE_URL")).replace(/\/+$/, "");
  const key = clean(Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!base || !key) return [];
  const url = new URL(`${base}/rest/v1/job_listings`);
  url.searchParams.set("select", "id,title,company_name,city,state_code,county,borough,neighborhood,category_slug,employment_type,updated_at");
  url.searchParams.set("status", "eq.open");
  url.searchParams.set("moderation_hold", "eq.false");
  url.searchParams.set("order", "updated_at.desc");
  url.searchParams.set("limit", "300");
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function page(landing: Landing, canonical: string, kind: "location" | "category", jobs: any[]) {
  const title = kind === "location" ? `${landing.name}招聘｜最新华人工作岗位｜华人工作网` : `${landing.name}工作｜美国华人招聘｜华人工作网`;
  const heading = kind === "location" ? `${landing.name}招聘与找工作` : `${landing.name}工作与招聘`;
  const cards = jobs.length ? jobs.map((job) => `<article><h2><a href="/jobs/listing.html?id=${encodeURIComponent(job.id)}">${esc(job.title)}</a></h2><p>${esc(placeText(job) || "美国")}${clean(job.company_name) ? ` · ${esc(job.company_name)}` : ""}</p></article>`).join("") : `<div class="empty">当前没有匹配岗位，请进入全部岗位继续查找。招聘信息会持续更新。</div>`;
  const directorySource = kind === "location" ? LOCATIONS : CATEGORIES;
  const directoryPath = kind === "location" ? "locations" : "categories";
  const directory = Object.entries(directorySource).map(([slug, item]) =>
    `<a href="/jobs/${directoryPath}/${slug}/">${esc(item.name)}${kind === "location" ? "招聘" : "工作"}</a>`
  ).join("");
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${canonical}#page`, name: heading, url: canonical, description: landing.intro, inLanguage: "zh-Hans", dateModified: jobs[0]?.updated_at || undefined, isPartOf: { "@id": `${SITE}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "华人工作网", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "全部岗位", item: `${SITE}/jobs/` },
        { "@type": "ListItem", position: 3, name: heading, item: canonical }
      ] },
      { "@type": "ItemList", name: `${heading}最新岗位`, numberOfItems: jobs.length, itemListElement: jobs.map((job, index) => ({
        "@type": "ListItem", position: index + 1, name: clean(job.title), url: `${SITE}/jobs/listing.html?id=${encodeURIComponent(job.id)}`
      })) }
    ]
  };
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(landing.intro)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<meta property="og:type" content="website"><meta property="og:site_name" content="华人工作网"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(landing.intro)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${SITE}/og-share.png">
<script type="application/ld+json">${escJson(schema)}</script>
<style>body{margin:0;background:#f6f9fd;color:#0f172a;font-family:system-ui,"Noto Sans SC","Microsoft YaHei",sans-serif}.bar{background:#fff;border-bottom:1px solid #dce6f2}.bar div,.wrap{max-width:980px;margin:auto;padding:18px}.brand{display:flex;align-items:center;gap:10px;color:#0f172a;text-decoration:none;font-weight:900}.brand img{width:42px;height:42px}.hero{padding:42px 0 22px}.eyebrow{color:#1769d2;font-weight:850}h1{font-size:clamp(32px,6vw,52px);margin:8px 0 15px}.intro{font-size:18px;line-height:1.8;color:#475569;max-width:800px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}.actions a{padding:11px 16px;border-radius:10px;text-decoration:none;font-weight:850;background:#1769d2;color:#fff}.actions a.alt{background:#eaf3ff;color:#1554a5}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0 30px}.list article,.empty{background:#fff;border:1px solid #dce6f2;border-radius:14px;padding:18px}.list h2{font-size:18px;margin:0 0 8px}.list h2 a{color:#0f172a;text-decoration:none}.list p{color:#64748b;margin:0}.directory{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 35px}.directory a{background:#fff;border:1px solid #dce6f2;border-radius:999px;padding:8px 12px;color:#1554a5;text-decoration:none;font-weight:750}.safety{background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px;line-height:1.7;margin-bottom:45px}@media(max-width:680px){.list{grid-template-columns:1fr}.hero{padding-top:28px}}</style></head><body>
<header class="bar"><div><a class="brand" href="/"><img src="/icon-192.png" alt="华人工作网 Logo" width="42" height="42"><span>华人工作网</span></a></div></header>
<main class="wrap"><section class="hero"><div class="eyebrow">美国华人招聘 · 持续更新</div><h1>${esc(heading)}</h1><p class="intro">${esc(landing.intro)}</p><div class="actions"><a href="/?${kind === "location" ? "place" : "q"}=${encodeURIComponent(landing.search)}#latest-jobs">查看${esc(landing.name)}岗位</a><a class="alt" href="/jobs/">进入全部岗位</a><a class="alt" href="/jobs/publish.html">免费发布招聘</a></div></section>
<section><h2>当前相关岗位</h2><div class="list">${cards}</div></section><nav class="directory" aria-label="更多${kind === "location" ? "地区" : "工作类别"}">${directory}</nav><aside class="safety"><strong>求职安全提醒：</strong>联系前核实雇主身份、工作地点、薪资和用工条件。正规招聘不应要求求职者提供银行卡密码、短信验证码或预付高额费用。</aside></main></body></html>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== "huarengongzuo.com") return context.next();
  const match = url.pathname.match(/^\/jobs\/(locations|categories)\/([a-z0-9-]+)\/?$/);
  if (!match) return context.next();
  const kind = match[1] === "locations" ? "location" : "category";
  const landing = (kind === "location" ? LOCATIONS : CATEGORIES)[match[2]];
  if (!landing) return context.next();
  const canonical = `${SITE}/jobs/${match[1]}/${match[2]}/`;
  const jobs = (await loadJobs()).filter(landing.match).slice(0, 30);
  const html = page(landing, canonical, kind, jobs);
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: {
    "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=300, stale-while-revalidate=900",
    "link": `<${canonical}>; rel=\"canonical\"`, "x-hg-seo-landing": "v1"
  }});
};

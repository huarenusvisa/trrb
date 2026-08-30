import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const TARGET_CANDIDATES = Math.max(50, Math.min(500, Number(process.env.JOBS_TARGET_CANDIDATES || 200)));
const SOURCE_KEY = "500work";
const SOURCE_ORIGIN = "https://500work.com";
const USER_AGENT = "TangDailyJobsBot/1.0 (+https://huarengongzuo.com/)";
const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const EXPIRES_ISO = new Date(NOW.getTime() + 30 * 86400000).toISOString();

const blockedPhones = new Set(["9295715245", "7183587333"]);
const suspicious = /酒店工|外送小姐|陪聊|陪酒|情色|色情|代孕|刷单|投资返利|博彩|赌场|跑分|洗钱|加密货币.*招聘/i;

const locationRules = [
  [/法拉盛|Flushing/i, ["NY", "Flushing"]],
  [/皇后区|Queens/i, ["NY", "Queens"]],
  [/布鲁克林|布碌崙|Brooklyn/i, ["NY", "Brooklyn"]],
  [/曼哈顿|Manhattan/i, ["NY", "Manhattan"]],
  [/长岛|Long Island/i, ["NY", "Long Island"]],
  [/纽约|New York/i, ["NY", "New York"]],
  [/新泽西|New Jersey|\bNJ\b/i, ["NJ", null]],
  [/康州|康涅狄格|Connecticut/i, ["CT", null]],
  [/波士顿|Boston/i, ["MA", "Boston"]],
  [/麻州|马萨诸塞|Massachusetts/i, ["MA", null]],
  [/费城|Philadelphia/i, ["PA", "Philadelphia"]],
  [/宾州|Pennsylvania/i, ["PA", null]],
  [/洛杉矶|Los Angeles/i, ["CA", "Los Angeles"]],
  [/萨克拉门托|Sacramento/i, ["CA", "Sacramento"]],
  [/旧金山|三藩市|San Francisco/i, ["CA", "San Francisco"]],
  [/圣地亚哥|San Diego/i, ["CA", "San Diego"]],
  [/加州|California/i, ["CA", null]],
  [/休斯敦|休斯顿|Houston/i, ["TX", "Houston"]],
  [/达拉斯|Dallas/i, ["TX", "Dallas"]],
  [/德州|Texas/i, ["TX", null]],
  [/芝加哥|Chicago/i, ["IL", "Chicago"]],
  [/伊州|伊利诺伊|Illinois/i, ["IL", null]],
  [/亚特兰大|Atlanta/i, ["GA", "Atlanta"]],
  [/乔治亚|Georgia/i, ["GA", null]],
  [/迈阿密|Miami/i, ["FL", "Miami"]],
  [/佛州|Florida/i, ["FL", null]],
  [/西雅图|Seattle/i, ["WA", "Seattle"]],
  [/华盛顿州|Washington State/i, ["WA", null]],
  [/华盛顿DC|Washington DC/i, ["DC", "Washington"]],
  [/弗吉尼亚|Virginia/i, ["VA", null]],
  [/马里兰|Maryland/i, ["MD", null]],
  [/达勒姆|Durham/i, ["NC", "Durham"]],
  [/北卡|North Carolina/i, ["NC", null]],
  [/南卡|South Carolina/i, ["SC", null]],
  [/俄亥俄|Ohio/i, ["OH", null]],
  [/印第安纳|Indiana/i, ["IN", null]],
  [/田纳西|Tennessee/i, ["TN", null]],
  [/科罗拉多|Colorado/i, ["CO", null]],
  [/亚利桑那|Arizona/i, ["AZ", null]],
  [/内华达|Nevada/i, ["NV", null]],
  [/夏威夷|Hawaii/i, ["HI", null]],
  [/密歇根|Michigan/i, ["MI", null]],
  [/明尼苏达|Minnesota/i, ["MN", null]],
  [/威斯康星|Wisconsin/i, ["WI", null]],
  [/密苏里|Missouri/i, ["MO", null]],
  [/堪萨斯|Kansas/i, ["KS", null]],
  [/路易斯安那|Louisiana/i, ["LA", null]],
  [/俄勒冈|Oregon/i, ["OR", null]],
  [/罗德岛|Rhode Island/i, ["RI", null]],
  [/新罕布什尔|New Hampshire/i, ["NH", null]],
];

const categories = [
  [/餐厅|餐馆|中餐|日餐|外卖店|麻辣烫|厨师|炒锅|油锅|寿司|企台|起台|服务员|后厨|打包|奶茶|咖啡|restaurant|cook|server/i, "restaurant"],
  [/美甲|甲店|指甲店|美容|理发|nail|beauty/i, "beauty-nail"],
  [/按摩|\bspa\b|massage/i, "massage"],
  [/装修|建筑|木工|电工|水电|冷气|玻璃|安装|construction/i, "construction"],
  [/仓库|倉庫|物流|货仓|貨倉|理货|叉车|warehouse|logistics/i, "logistics-warehouse"],
  [/司机|司機|送货|送貨|配送|卡车|卡車|TLC|driver/i, "truck-driver"],
  [/超市|零售|店员|销售|sales|retail/i, "retail-grocery"],
  [/保姆|月嫂|护理|家政|老人中心|home care|caregiver/i, "home-care"],
  [/律师|法律|legal/i, "legal"],
  [/会计|bookkeeper|accountant|finance/i, "accounting-finance"],
  [/地产|房产|real estate/i, "real-estate"],
  [/学校|老师|幼师|教育|培训|teacher|school/i, "education"],
  [/程序|软件|IT|电脑|developer|engineer/i, "it-tech"],
  [/办公室|文员|前台|助理|客服|行政|coordinator|assistant/i, "office-admin"],
  [/市场|销售|marketing|sales/i, "sales"],
];

const stateNames = {
  AZ: "Arizona", CA: "California", CO: "Colorado", CT: "Connecticut", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", IL: "Illinois", IN: "Indiana", KS: "Kansas", LA: "Louisiana", MA: "Massachusetts",
  MD: "Maryland", MI: "Michigan", MN: "Minnesota", MO: "Missouri", NC: "North Carolina",
  NH: "New Hampshire", NJ: "New Jersey", NV: "Nevada", NY: "New York", OH: "Ohio", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", TN: "Tennessee", TX: "Texas",
  VA: "Virginia", WA: "Washington", WI: "Wisconsin", DC: "Washington",
};

function decodeHtml(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(html, text) {
  const contentTitle = html.match(/<[^>]+id=["']contenttitle["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return decodeHtml(contentTitle || h1 || title || text.slice(0, 120))
    .replace(/[，,]\s*[^，,]{0,16}工作网[\s\S]*$/i, "")
    .replace(/[-_|]\s*(?:美国|纽约)?(?:华人)?(?:找工|工作|求职)网?.*$/i, "")
    .trim().slice(0, 120);
}

function extractJobFields(html, title) {
  const descriptionHtml = html.match(/<div\b[^>]*class=["'][^"']*\bdesc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const description = decodeHtml(descriptionHtml).replace(/\s+/g, " ").trim();
  const location = decodeHtml(html.match(/位置[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const published = decodeHtml(html.match(/发布日期[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const phone = decodeHtml(html.match(/电话[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const email = decodeHtml(html.match(/邮箱[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const position = decodeHtml(html.match(/职位[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const salary = decodeHtml(html.match(/薪资[:：]\s*([\s\S]*?)<\/div>/i)?.[1] || "");
  const contactText = `${phone} ${email}`.trim();
  const coreText = `${title} ${description} ${position} ${salary} ${location}`.replace(/\s+/g, " ").trim();
  return { description, location, published, contactText, coreText };
}

function pickContact(text) {
  const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase());
  const phones = [...text.matchAll(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g)]
    .map((m) => `${m[1]}${m[2]}${m[3]}`)
    .filter((phone) => !blockedPhones.has(phone));
  if (phones[0]) return { method: "phone", value: `${phones[0].slice(0, 3)}-${phones[0].slice(3, 6)}-${phones[0].slice(6)}` };
  if (emails[0]) return { method: "email", value: emails[0] };
  return null;
}

function pickLocation(text) {
  for (const [pattern, result] of locationRules) {
    if (pattern.test(text)) return { state_code: result[0], city: result[1] || stateNames[result[0]] };
  }
  return null;
}

function pickCategory(primaryText, supplementalText = "") {
  for (const text of [primaryText, supplementalText]) {
    for (const [pattern, slug] of categories) if (pattern.test(text)) return slug;
  }
  return "other";
}

function pickPublishedAt(text) {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (!iso) return null;
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractDescription(text, title) {
  let value = text;
  const start = value.indexOf(title);
  if (start >= 0) value = value.slice(start + title.length);
  value = value
    .replace(/美国华人168worker\.com[\s\S]*?人力资源服务站点/gi, " ")
    .replace(/客服[:：]?\s*929[-\s]?571[-\s]?5245/gi, " ")
    .replace(/发布招聘|登录|注册|举报/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.slice(0, 4000) || title;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: controller.signal, redirect: "follow" });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 700 * attempt + Math.floor(Math.random() * 400)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function rest(table, query = "", { method = "GET", body, prefer = "return=representation" } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${method} ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = await worker(items[index], index); }
      catch (error) { output[index] = { error: String(error?.message || error), url: items[index] }; }
    }
  }));
  return output;
}

async function discoverUrls() {
  const urls = new Set();
  for (let page = 1; page <= 20 && urls.size < TARGET_CANDIDATES; page += 1) {
    const url = page === 1 ? `${SOURCE_ORIGIN}/` : `${SOURCE_ORIGIN}/index/${page}`;
    const html = await fetchText(url);
    for (const match of html.matchAll(/href=["'](?:https?:\/\/(?:www\.)?500work\.com)?(\/page\/(\d+))[^"']*["']/gi)) {
      urls.add(`${SOURCE_ORIGIN}${match[1]}`);
      if (urls.size >= TARGET_CANDIDATES) break;
    }
  }
  return [...urls].slice(0, TARGET_CANDIDATES);
}

function normalizeCandidate(url, html) {
  const text = decodeHtml(html);
  const title = cleanTitle(html, text);
  const fields = extractJobFields(html, title);
  const contact = pickContact(fields.contactText);
  const location = pickLocation(title) || pickLocation(fields.location);
  const published = pickPublishedAt(fields.published);
  const ageDays = published ? (NOW.getTime() - published.getTime()) / 86400000 : null;
  const errors = [];
  if (title.length < 2) errors.push("missing_title");
  if (!contact) errors.push("no_public_phone_or_email");
  if (!location) errors.push("no_verifiable_us_location");
  if (!published) errors.push("missing_source_date");
  else if (ageDays < -1 || ageDays > 30) errors.push("stale_or_invalid_source_date");
  if (suspicious.test(fields.coreText)) errors.push("high_risk_or_prohibited_content");
  const externalId = url.match(/\/page\/(\d+)/)?.[1] || crypto.randomUUID();
  const description = fields.description || extractDescription(fields.coreText, title);
  const payload = {
    title,
    description,
    category_slug: pickCategory(title, `${fields.description} ${fields.position}`),
    country_code: "US",
    state_code: location?.state_code || null,
    city: location?.city || null,
    employment_type: "unspecified",
    work_mode: "onsite",
    company_name: "未公开雇主",
    contact_method: contact?.method || null,
    contact_value: contact?.value || null,
    contact_public: Boolean(contact),
    source_published_at: published?.toISOString() || null,
  };
  return { externalId, url, payload, errors, payloadHash: sha256(payload) };
}

async function storeCandidate(candidate) {
  const sourceFilter = `source_key=eq.${SOURCE_KEY}&source_external_id=eq.${encodeURIComponent(candidate.externalId)}`;
  const existingRaw = await rest("job_ingest_raw", `${sourceFilter}&payload_hash=eq.${candidate.payloadHash}&select=id,stage,normalized_job_listing_id&limit=1`);
  let rawId;
  if (existingRaw?.[0]) {
    rawId = existingRaw[0].id;
    await rest("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: { fetched_at: NOW_ISO, last_seen_at: NOW_ISO } });
  } else {
    const inserted = await rest("job_ingest_raw", "", { method: "POST", body: {
      source_key: SOURCE_KEY,
      source_external_id: candidate.externalId,
      source_url: candidate.url,
      fetched_at: NOW_ISO,
      first_seen_at: NOW_ISO,
      last_seen_at: NOW_ISO,
      payload: candidate.payload,
      payload_hash: candidate.payloadHash,
      stage: candidate.errors.length ? "rejected" : "validated",
      validation_errors: candidate.errors,
    } });
    rawId = inserted?.[0]?.id;
  }

  if (candidate.errors.length) return "rejected";

  const existingListing = await rest("job_listings", `${sourceFilter}&select=id,status,status_reason,moderation_hold&limit=1`);
  if (existingListing?.[0]) {
    const row = existingListing[0];
    const refreshDraft = row.status === "draft";
    const repairParserHold = row.status === "unlisted" && row.status_reason === "auto_ingest_parser_quality_hold";
    const queueForReview = refreshDraft || repairParserHold;
    const body = {
      source_checked_at: NOW_ISO,
      source_payload_hash: candidate.payloadHash,
    };
    if (queueForReview) Object.assign(body, {
      category_slug: candidate.payload.category_slug,
      title: candidate.payload.title,
      description: candidate.payload.description,
      state_code: candidate.payload.state_code,
      city: candidate.payload.city,
      updated_at: NOW_ISO,
      contact_method: candidate.payload.contact_method,
      contact_value: candidate.payload.contact_value,
      contact_public: candidate.payload.contact_public,
      expires_at: EXPIRES_ISO,
      source_published_at: candidate.payload.source_published_at,
      status: "draft",
      status_reason: "awaiting_human_review",
      moderation_hold: true,
      published_at: null,
    });
    await rest("job_listings", `id=eq.${row.id}`, { method: "PATCH", body });
    const rawStage = row.status === "open" ? "published" : "validated";
    if (rawId) await rest("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: { stage: rawStage, normalized_job_listing_id: row.id, validation_errors: [] } });
    if (row.status === "open") return "existing_open";
    return queueForReview ? "drafted" : "held";
  }

  const listing = await rest("job_listings", "", { method: "POST", body: {
    category_slug: candidate.payload.category_slug,
    title: candidate.payload.title,
    description: candidate.payload.description,
    employment_type: candidate.payload.employment_type,
    country_code: "US",
    state_code: candidate.payload.state_code,
    city: candidate.payload.city,
    status: "draft",
    published_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    contact_method: candidate.payload.contact_method,
    contact_value: candidate.payload.contact_value,
    contact_public: true,
    expires_at: EXPIRES_ISO,
    moderation_hold: true,
    status_reason: "awaiting_human_review",
    listing_origin: "external",
    company_name: candidate.payload.company_name,
    source_key: SOURCE_KEY,
    source_external_id: candidate.externalId,
    source_url: candidate.url,
    source_published_at: candidate.payload.source_published_at,
    source_checked_at: NOW_ISO,
    source_payload_hash: candidate.payloadHash,
    work_mode: candidate.payload.work_mode,
    visa_support_status: "not_stated",
    language_requirements: ["Chinese"],
  } });
  const listingId = listing?.[0]?.id;
  if (rawId && listingId) await rest("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: { stage: "validated", normalized_job_listing_id: listingId, validation_errors: [] } });
  return "drafted";
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const summary = { started_at: NOW_ISO, target: TARGET_CANDIDATES, discovered: 0, fetched: 0, drafted: 0, existing_open: 0, held: 0, rejected: 0, fetch_errors: 0, write_errors: 0 };
  try {
    const urls = await discoverUrls();
    summary.discovered = urls.length;
    if (urls.length < 50) throw new Error(`Source discovery returned only ${urls.length} candidate URLs`);

    const fetched = await mapLimit(urls, 3, async (url) => normalizeCandidate(url, await fetchText(url)));
    const candidates = fetched.filter((item) => !item?.error);
    summary.fetched = candidates.length;
    summary.fetch_errors = fetched.length - candidates.length;
    for (const failed of fetched.filter((item) => item?.error).slice(0, 10)) console.error("FETCH_ERROR", failed.url, failed.error);

    const stored = await mapLimit(candidates, 4, async (candidate) => {
      try { return await storeCandidate(candidate); }
      catch (error) { console.error("WRITE_ERROR", candidate.url, error?.message || error); return "write_error"; }
    });
    for (const status of stored) {
      if (status === "drafted") summary.drafted += 1;
      else if (status === "existing_open") summary.existing_open += 1;
      else if (status === "held") summary.held += 1;
      else if (status === "rejected") summary.rejected += 1;
      else summary.write_errors += 1;
    }

    await rest("job_source_registry", `source_key=eq.${SOURCE_KEY}`, { method: "PATCH", body: {
      last_checked_at: NOW_ISO,
      last_success_at: NOW_ISO,
      last_error: summary.fetch_errors || summary.write_errors ? `partial: fetch_errors=${summary.fetch_errors}, write_errors=${summary.write_errors}` : null,
      updated_at: NOW_ISO,
    } });
    console.log(`JOBS_INGEST_SUMMARY ${JSON.stringify(summary)}`);
    if (summary.fetched < 50 || summary.write_errors > Math.max(10, summary.fetched * 0.1)) process.exitCode = 1;
  } catch (error) {
    await rest("job_source_registry", `source_key=eq.${SOURCE_KEY}`, { method: "PATCH", body: { last_checked_at: NOW_ISO, last_error: String(error?.message || error).slice(0, 500), updated_at: NOW_ISO } }).catch(() => {});
    console.error(`JOBS_INGEST_FATAL ${error?.stack || error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { normalizeCandidate };

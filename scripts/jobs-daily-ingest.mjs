import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const TARGET_CANDIDATES = Math.max(50, Math.min(1_000, Number(process.env.JOBS_TARGET_CANDIDATES || 500)));
const MIN_NEW_PUBLISHED = Math.max(1, Math.min(200, Number(process.env.JOBS_MIN_NEW_PUBLISHED || 50)));
const EXPANDED_CHINESE_TARGET = Math.max(TARGET_CANDIDATES, Math.min(2_000, Number(process.env.JOBS_EXPANDED_CHINESE_TARGET || 1_000)));
const STORE_BATCH_SIZE = Math.max(50, Math.min(500, Number(process.env.JOBS_STORE_BATCH_SIZE || 150)));
const STORE_CONCURRENCY = Math.max(2, Math.min(16, Number(process.env.JOBS_STORE_CONCURRENCY || 8)));
const REST_RETRY_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.JOBS_REST_RETRY_ATTEMPTS || 3)));
const MAX_WRITE_ERROR_RATE = Math.max(0.1, Math.min(0.8, Number(process.env.JOBS_MAX_WRITE_ERROR_RATE || 0.35)));
const MIN_WRITE_ERROR_THRESHOLD = Math.max(10, Math.min(500, Number(process.env.JOBS_MIN_WRITE_ERROR_THRESHOLD || 75)));
const SOURCE_KEY = "500work";
const SOURCE_ORIGIN = "https://500work.com";
const ATS_SOURCES = [
  { type: "greenhouse", key: "greenhouse_weee", board: "weee" },
  { type: "greenhouse", key: "greenhouse_chowbus", board: "chowbus" },
  { type: "greenhouse", key: "greenhouse_yqn", board: "yqn" },
  { type: "greenhouse", key: "greenhouse_freedomcare", board: "freedomcare" },
  { type: "greenhouse", key: "greenhouse_bayada", board: "bayada" },
  { type: "lever", key: "lever_distro", board: "distro" },
  { type: "lever", key: "lever_springoakliving", board: "springoakliving" },
];
// These official employer feeds are only opened when the primary pass produces
// fewer than MIN_NEW_PUBLISHED new listings. This keeps the normal run focused,
// while giving a low-volume day a much broader US-wide candidate pool.
const EXPANDED_ATS_SOURCES = [
  { type: "greenhouse", key: "greenhouse_sweetgreen", board: "sweetgreen" },
  { type: "greenhouse", key: "greenhouse_doordashusa", board: "doordashusa" },
  { type: "greenhouse", key: "greenhouse_lyft", board: "lyft" },
  { type: "greenhouse", key: "greenhouse_toast", board: "toast" },
  { type: "greenhouse", key: "greenhouse_instacart", board: "instacart" },
  { type: "greenhouse", key: "greenhouse_opentable", board: "opentable" },
  { type: "greenhouse", key: "greenhouse_spacex", board: "spacex" },
  { type: "lever", key: "lever_gopuff", board: "gopuff" },
];
const ALL_ATS_SOURCES = [...ATS_SOURCES, ...EXPANDED_ATS_SOURCES];
const SOURCE_REGISTRATIONS = [
  { source_key: SOURCE_KEY, company_name: "500工作网", source_type: "structured_web", board_token: null, source_url: `${SOURCE_ORIGIN}/` },
  ...ALL_ATS_SOURCES.map((source) => ({
    source_key: source.key, company_name: source.board, source_type: source.type === "lever" ? "api" : source.type, board_token: source.board,
    source_url: source.type === "greenhouse" ? `https://job-boards.greenhouse.io/${source.board}` : `https://jobs.lever.co/${source.board}`,
  })),
];
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
  [/保姆|育儿嫂|育兒嫂|月嫂|导乐|導樂|护理|護理|护工|護工|老人照护|老人照護|家政|阿姨|老人中心|home[ -]?care|caregiver|nanny|babysitter|baby[ -]?sitter|newborn care specialist|postpartum doula|birth doula|doula|home health aide|personal care aide|elder care|elderly care|senior care|companion care|housekeeper|housekeeping/i, "home-care"],
  [/律师|法律|legal/i, "legal"],
  [/会计|bookkeeper|accountant|finance/i, "accounting-finance"],
  [/地产|房产|real estate/i, "real-estate"],
  [/学校|老师|幼师|教育|培训|teacher|school/i, "education"],
  [/程序|软件|IT|电脑|developer|engineer/i, "it-tech"],
  [/办公室|文员|前台|助理|客服|行政|office|administrator|coordinator|assistant/i, "office-admin"],
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

function pickEnglishLocation(text) {
  const known = pickLocation(text);
  if (known) return known;
  const match = String(text || "").match(/(?:^|,\s*)([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5})?(?:$|\b)/);
  return match ? { state_code: match[2], city: match[1].trim() } : null;
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

export function retryAfterMs(value, now = Date.now()) {
  const seconds = Number(value);
  if (value && Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value || "");
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

let nextSourceRequest = 0;
let sourceRequestQueue = Promise.resolve();
function paceSourceRequest() {
  sourceRequestQueue = sourceRequestQueue.then(async () => {
    while (nextSourceRequest > Date.now()) {
      await new Promise(resolve => setTimeout(resolve, nextSourceRequest - Date.now()));
    }
    nextSourceRequest = Date.now() + 500;
  });
  return sourceRequestQueue;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await paceSourceRequest();
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(25000), redirect: "follow" });
      if (!response.ok) {
        if (response.status === 429) {
          const cooldown = Math.max(retryAfterMs(response.headers.get("retry-after")), 5000 * 2 ** (attempt - 1));
          nextSourceRequest = Math.max(nextSourceRequest, Date.now() + cooldown);
        }
        const error = new Error(`${url} HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (error.status && ![408,429].includes(error.status) && error.status < 500) break;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw lastError;
}

async function rest(table, query = "", { method = "GET", body, prefer = "return=representation" } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= REST_RETRY_ATTEMPTS; attempt += 1) {
    try {
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
      if (!response.ok) {
        const error = new Error(`${table} ${method} ${response.status}: ${text.slice(0, 500)}`);
        error.status = response.status;
        throw error;
      }
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      const transient = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
      if (!transient || attempt === REST_RETRY_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250)));
    }
  }
  throw lastError;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function ensureSourceRegistry(request = rest) {
  // Insert missing parents before any raw rows, preserving existing settings.
  await request("job_source_registry", "on_conflict=source_key", {
    method: "POST", body: SOURCE_REGISTRATIONS,
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
  const rows = await request("job_source_registry", `select=source_key,is_enabled&source_key=in.(${SOURCE_REGISTRATIONS.map((source) => source.source_key).join(",")})`);
  const registered = new Map((rows || []).map((row) => [row.source_key, row.is_enabled]));
  const missing = SOURCE_REGISTRATIONS.filter((source) => !registered.has(source.source_key));
  if (missing.length) throw new Error(`Missing job source registrations: ${missing.map((source) => source.source_key).join(", ")}`);
  return new Set([...registered].filter(([, enabled]) => enabled === true).map(([key]) => key));
}

async function fetchChineseCandidates({ discover = discoverUrls, fetchPage = fetchText, target = TARGET_CANDIDATES } = {}) {
  let urls = [];
  try {
    urls = await discover(target);
    const fetched = await mapLimit(urls, 3, async (url) => normalizeCandidate(url, await fetchPage(url)));
    return {
      discovered: urls.length, candidates: fetched.filter((item) => !item?.error),
      failures: fetched.filter((item) => item?.error),
      error: urls.length ? null : "Source discovery returned no candidate URLs",
    };
  } catch (error) {
    return { discovered: urls.length, candidates: [], failures: [], error: String(error?.message || error) };
  }
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

async function discoverUrls(target = TARGET_CANDIDATES) {
  const urls = new Set();
  const boundedTarget = Math.max(50, Math.min(2_000, Number(target) || TARGET_CANDIDATES));
  const maxPages = Math.max(20, Math.ceil(boundedTarget / 20) + 10);
  for (let page = 1; page <= maxPages && urls.size < boundedTarget; page += 1) {
    const url = page === 1 ? `${SOURCE_ORIGIN}/` : `${SOURCE_ORIGIN}/index/${page}`;
    const html = await fetchText(url);
    for (const match of html.matchAll(/href=["'](?:https?:\/\/(?:www\.)?500work\.com)?(\/page\/(\d+))[^"']*["']/gi)) {
      urls.add(`${SOURCE_ORIGIN}${match[1]}`);
      if (urls.size >= boundedTarget) break;
    }
  }
  return [...urls].slice(0, boundedTarget);
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
  return { sourceKey: SOURCE_KEY, externalId, url, payload, errors, payloadHash: sha256(payload) };
}

function normalizeEmploymentType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["full_time", "part_time", "contract", "temporary", "internship", "unspecified"].includes(normalized)) return normalized;
  return "unspecified";
}

function normalizeAtsCandidate(source, job) {
  const greenhouse = source.type === "greenhouse";
  const title = decodeHtml(greenhouse ? job.title : job.text).slice(0, 120);
  const description = decodeHtml(greenhouse ? job.content : (job.descriptionPlain || job.description || "")).slice(0, 4000);
  const locationText = greenhouse ? job.location?.name : job.categories?.location;
  const location = pickEnglishLocation(locationText);
  const category = pickCategory(title, description);
  const applicationUrl = greenhouse ? job.absolute_url : job.hostedUrl;
  const sourceDate = greenhouse ? job.updated_at : (job.createdAt ? new Date(job.createdAt).toISOString() : null);
  const payload = {
    title, description, category_slug: category, country_code: "US",
    state_code: location?.state_code || null, city: location?.city || null,
    employment_type: normalizeEmploymentType(greenhouse ? null : job.categories?.commitment),
    work_mode: /remote/i.test(`${locationText} ${job.workplaceType || ""}`) ? "remote" : "onsite",
    company_name: source.board, contact_method: null, contact_value: null, contact_public: false,
    application_url: applicationUrl, source_published_at: sourceDate,
  };
  const errors = [];
  // Public listings require a state and city even for remote work. Keep
  // incomplete source records in raw storage instead of failing the insert.
  if (!location) errors.push("no_verifiable_us_location");
  if (!safeHttpUrl(applicationUrl)) errors.push("missing_official_application_url");
  return { sourceKey: source.key, externalId: String(job.id), url: applicationUrl, payload, errors, payloadHash: sha256(payload) };
}

function safeHttpUrl(value) {
  try { const url = new URL(String(value || "")); return /^https?:$/.test(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

export async function fetchEnglishCandidates(sources = ATS_SOURCES, request = fetchJson) {
  const groups = await mapLimit(sources, 2, async (source) => {
    try {
      const endpoint = source.type === "greenhouse"
        ? `https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs?content=true`
        : `https://api.lever.co/v0/postings/${source.board}?mode=json`;
      const data = await request(endpoint);
      const jobs = source.type === "greenhouse" ? data.jobs : data;
      const discovered = Array.isArray(jobs) ? jobs : [];
      return {
        source_key: source.key,
        discovered: discovered.length,
        candidates: discovered.map((job) => normalizeAtsCandidate(source, job)),
        error: null,
      };
    } catch (error) {
      return { source_key: source.key, discovered: 0, candidates: [], error: String(error?.message || error) };
    }
  });
  const reports = groups.map((group, index) => group?.source_key ? group : {
    source_key: sources[index].key,
    discovered: 0,
    candidates: [],
    error: String(group?.error || "unknown_source_error"),
  });
  return {
    candidates: reports.flatMap((group) => group.candidates),
    sources: reports.map(({ candidates, ...report }) => ({ ...report, fetched: candidates.length })),
  };
}

function emptySourceSummary() {
  return { discovered: 0, fetched: 0, published: 0, repaired: 0, existing: 0, held: 0, rejected: 0, write_errors: 0, error: null };
}

function addStatus(summary, sourceKey, status) {
  const source = summary.sources[sourceKey] ||= emptySourceSummary();
  if (Object.hasOwn(source, status)) source[status] += 1;
  if (Object.hasOwn(summary, status)) summary[status] += 1;
}

export function isPublicJobListing(listing) {
  return listing?.status === "open" && listing.moderation_hold !== true;
}

export async function storeCandidate(candidate, request = rest) {
  const sourceKey = candidate.sourceKey || SOURCE_KEY;
  const sourceFilter = `source_key=eq.${sourceKey}&source_external_id=eq.${encodeURIComponent(candidate.externalId)}`;
  const existingRaw = await request("job_ingest_raw", `${sourceFilter}&payload_hash=eq.${candidate.payloadHash}&select=id,stage,normalized_job_listing_id&limit=1`);
  let rawId;
  if (existingRaw?.[0]) {
    rawId = existingRaw[0].id;
    await request("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: {
      fetched_at: NOW_ISO, last_seen_at: NOW_ISO,
      ...(candidate.errors.length && !existingRaw[0].normalized_job_listing_id
        ? { stage: "rejected", validation_errors: candidate.errors } : {}),
    } });
  } else {
    const inserted = await request("job_ingest_raw", "", { method: "POST", body: {
      source_key: sourceKey,
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

  const existingListing = await request("job_listings", `${sourceFilter}&listing_origin=eq.external&select=id,status,status_reason,moderation_hold&limit=1`);
  if (existingListing?.[0]) {
    const repairHeldListing = !existingListing[0].moderation_hold && existingListing[0].status === "unlisted" && existingListing[0].status_reason === "auto_ingest_parser_quality_hold";
    const refreshOpenListing = existingListing[0].status === "open" && !existingListing[0].moderation_hold;
    const body = {
      source_checked_at: NOW_ISO,
      source_payload_hash: candidate.payloadHash,
    };
    if (repairHeldListing || refreshOpenListing) Object.assign(body, {
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
    });
    if (repairHeldListing) Object.assign(body, { status: "open", status_reason: null, published_at: NOW_ISO });
    const saved = await request("job_listings", `id=eq.${existingListing[0].id}`, { method: "PATCH", body });
    if (!saved?.[0]?.id) throw new Error("Job refresh returned no listing");
    const published = isPublicJobListing(saved[0]);
    if (rawId) await request("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: {
      stage: published ? "published" : "validated", normalized_job_listing_id: saved[0].id,
      validation_errors: published ? [] : [`listing_not_public:${saved[0].status_reason || saved[0].status}`],
    } });
    return published ? (repairHeldListing ? "repaired" : "existing") : "held";
  }

  const listing = await request("job_listings", "", { method: "POST", body: {
    category_slug: candidate.payload.category_slug,
    title: candidate.payload.title,
    description: candidate.payload.description,
    employment_type: candidate.payload.employment_type,
    country_code: "US",
    state_code: candidate.payload.state_code,
    city: candidate.payload.city,
    status: "open",
    published_at: NOW_ISO,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    contact_method: candidate.payload.contact_method,
    contact_value: candidate.payload.contact_value,
    contact_public: Boolean(candidate.payload.contact_public),
    application_url: candidate.payload.application_url || null,
    expires_at: EXPIRES_ISO,
    moderation_hold: false,
    listing_origin: "external",
    company_name: candidate.payload.company_name,
    source_key: sourceKey,
    source_external_id: candidate.externalId,
    source_url: candidate.url,
    source_published_at: candidate.payload.source_published_at,
    source_checked_at: NOW_ISO,
    source_payload_hash: candidate.payloadHash,
    work_mode: candidate.payload.work_mode,
    visa_support_status: "not_stated",
    language_requirements: sourceKey === SOURCE_KEY ? ["Chinese"] : ["English"],
  } });
  const listingId = listing?.[0]?.id;
  if (!listingId) throw new Error("Job insert returned no listing");
  const published = isPublicJobListing(listing[0]);
  if (rawId) await request("job_ingest_raw", `id=eq.${rawId}`, { method: "PATCH", body: {
    stage: published ? "published" : "validated", normalized_job_listing_id: listingId,
    validation_errors: published ? [] : [`listing_not_public:${listing[0].status_reason || listing[0].status}`],
  } });
  return published ? "published" : "held";
}

function candidateKey(candidate) {
  return `${candidate.sourceKey || SOURCE_KEY}:${candidate.externalId}`;
}

function shouldExpand(published, minimum = MIN_NEW_PUBLISHED) {
  return Number(published || 0) < Number(minimum || MIN_NEW_PUBLISHED);
}

async function storeCandidates(candidates, summary, phase) {
  for (let offset = 0; offset < candidates.length; offset += STORE_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + STORE_BATCH_SIZE);
    const stored = await mapLimit(batch, STORE_CONCURRENCY, async (candidate) => {
      try { return { sourceKey: candidate.sourceKey || SOURCE_KEY, status: await storeCandidate(candidate) }; }
      catch (error) {
        console.error("WRITE_ERROR", candidate.sourceKey || SOURCE_KEY, candidate.url, error?.message || error);
        return { sourceKey: candidate.sourceKey || SOURCE_KEY, status: "write_errors" };
      }
    });
    for (const result of stored) addStatus(summary, result.sourceKey, result.status);
    console.log(`JOBS_INGEST_BATCH ${JSON.stringify({ phase, offset, size: batch.length, published: summary.published, existing: summary.existing, rejected: summary.rejected, write_errors: summary.write_errors })}`);
  }
}

async function reportIngestionSummary(summary) {
  const fallback = summary.fallback?.triggered
    ? `；首轮新增不足${summary.minimum_new_published}条，已从已接入来源扩抓${summary.fallback.fetched}条候选`
    : "；首轮已达到最低发布量，无需扩抓";
  const message = `发现${summary.discovered}条，检查${summary.fetched}条，新增发布${summary.published}条，已存在${summary.existing}条，保持下架或待审${summary.held}条，过滤${summary.rejected}条，详情抓取失败${summary.fetch_errors}次，来源失败${summary.source_errors}个，写入失败${summary.write_errors}条${fallback}。`;
  try {
    await rest("automation_notifications", "", { method: "POST", body: {
      control_key: "jobs",
      severity: summary.write_errors || summary.fetch_errors || summary.source_errors ? "warning" : "info",
      title: `招聘抓取完成：新增${summary.published}条`,
      message,
      details: summary,
    }, prefer: "return=minimal" });
  } catch (error) {
    // Reporting must never turn a successful ingestion into a failed run.
    console.error("JOBS_REPORT_ERROR", error?.message || error);
  }
  console.log(`JOBS_INGEST_REPORT ${message}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const summary = {
    started_at: NOW_ISO,
    target: TARGET_CANDIDATES,
    ats_scan: "complete_active_feed",
    minimum_new_published: MIN_NEW_PUBLISHED,
    batch_size: STORE_BATCH_SIZE,
    concurrency: STORE_CONCURRENCY,
    discovered: 0,
    fetched: 0,
    published: 0,
    repaired: 0,
    existing: 0,
    held: 0,
    rejected: 0,
    fetch_errors: 0,
    source_errors: 0,
    write_errors: 0,
    fallback: { triggered: false, reason: null, discovered: 0, fetched: 0, published: 0 },
    sources: {},
  };
  try {
    const enabledSources = await ensureSourceRegistry();
    const chinese = enabledSources.has(SOURCE_KEY)
      ? await fetchChineseCandidates()
      : { discovered: 0, candidates: [], failures: [], error: null };
    summary.discovered = chinese.discovered;
    if (enabledSources.has(SOURCE_KEY)) summary.sources[SOURCE_KEY] = {
      ...emptySourceSummary(), discovered: chinese.discovered, fetched: chinese.candidates.length, error: chinese.error,
    };
    if (chinese.error) summary.source_errors += 1;
    const english = await fetchEnglishCandidates(ATS_SOURCES.filter((source) => enabledSources.has(source.key)));
    const candidates = [...chinese.candidates, ...english.candidates];
    for (const report of english.sources) {
      summary.sources[report.source_key] = { ...emptySourceSummary(), ...report };
      summary.discovered += report.discovered;
      if (report.error) summary.source_errors += 1;
    }
    summary.fetched = candidates.length;
    summary.fetch_errors = chinese.failures.length;
    for (const failed of chinese.failures.slice(0, 10)) console.error("FETCH_ERROR", failed.url, failed.error);
    if (chinese.error) console.error("SOURCE_ERROR", SOURCE_KEY, chinese.error);
    for (const report of english.sources.filter((item) => item.error)) console.error("SOURCE_ERROR", report.source_key, report.error);

    await storeCandidates(candidates, summary, "primary");

    if (shouldExpand(summary.published)) {
      const publishedBeforeFallback = summary.published;
      const knownCandidates = new Set(candidates.map(candidateKey));
      const expandedChinese = enabledSources.has(SOURCE_KEY)
        ? await fetchChineseCandidates({ target: EXPANDED_CHINESE_TARGET })
        : { discovered: 0, candidates: [], failures: [], error: null };
      const expandedEnglish = await fetchEnglishCandidates(
        ALL_ATS_SOURCES.filter((source) => enabledSources.has(source.key)),
      );
      const fallbackCandidates = [...expandedChinese.candidates, ...expandedEnglish.candidates]
        .filter((candidate) => !knownCandidates.has(candidateKey(candidate)));
      const fallbackBySource = new Map();
      for (const candidate of fallbackCandidates) {
        const key = candidate.sourceKey || SOURCE_KEY;
        fallbackBySource.set(key, (fallbackBySource.get(key) || 0) + 1);
      }
      const newEnglishSources = expandedEnglish.sources.filter((report) => !summary.sources[report.source_key]);
      const discoveryDelta = Math.max(0, expandedChinese.discovered - chinese.discovered)
        + newEnglishSources.reduce((total, report) => total + report.discovered, 0);
      summary.discovered += discoveryDelta;
      summary.fetched += fallbackCandidates.length;
      if (summary.sources[SOURCE_KEY]) {
        summary.sources[SOURCE_KEY].discovered = Math.max(summary.sources[SOURCE_KEY].discovered, expandedChinese.discovered);
        summary.sources[SOURCE_KEY].fetched += fallbackBySource.get(SOURCE_KEY) || 0;
        summary.sources[SOURCE_KEY].error ||= expandedChinese.error;
      }
      summary.fetch_errors += expandedChinese.failures.length;
      if (expandedChinese.error && !chinese.error) summary.source_errors += 1;
      for (const report of expandedEnglish.sources) {
        const existing = summary.sources[report.source_key];
        if (existing) {
          existing.discovered = Math.max(existing.discovered, report.discovered);
          existing.fetched += fallbackBySource.get(report.source_key) || 0;
          existing.error ||= report.error;
        } else {
          summary.sources[report.source_key] = {
            ...emptySourceSummary(), ...report, fetched: fallbackBySource.get(report.source_key) || 0,
          };
          if (report.error) summary.source_errors += 1;
        }
      }
      for (const failed of expandedChinese.failures.slice(0, 10)) console.error("FALLBACK_FETCH_ERROR", failed.url, failed.error);
      for (const report of expandedEnglish.sources.filter((item) => item.error)) console.error("FALLBACK_SOURCE_ERROR", report.source_key, report.error);
      summary.fallback = {
        triggered: true,
        reason: `primary_published_below_${MIN_NEW_PUBLISHED}`,
        discovered: discoveryDelta,
        fetched: fallbackCandidates.length,
        published: 0,
      };
      console.log(`JOBS_INGEST_FALLBACK ${JSON.stringify(summary.fallback)}`);
      await storeCandidates(fallbackCandidates, summary, "expanded_web");
      summary.fallback.published = summary.published - publishedBeforeFallback;
    }

    const allowedWriteErrors = Math.max(MIN_WRITE_ERROR_THRESHOLD, Math.ceil(summary.fetched * MAX_WRITE_ERROR_RATE));
    summary.allowed_write_errors = allowedWriteErrors;
    summary.completed_at = new Date().toISOString();
    for (const [sourceKey, report] of Object.entries(summary.sources)) {
      const fetchErrors = sourceKey === SOURCE_KEY ? summary.fetch_errors : 0;
      await rest("job_source_registry", `source_key=eq.${sourceKey}`, { method: "PATCH", body: {
        last_checked_at: NOW_ISO,
        ...(!report.error && report.fetched > 0 && !report.write_errors && !fetchErrors ? { last_success_at: NOW_ISO } : {}),
        last_error: report.error || (report.write_errors || fetchErrors ? `partial: fetch_errors=${fetchErrors}, write_errors=${report.write_errors}` : null),
        updated_at: NOW_ISO,
      } });
    }
    await reportIngestionSummary(summary);
    console.log(`JOBS_INGEST_SUMMARY ${JSON.stringify(summary)}`);
    const handled = summary.published + summary.repaired + summary.existing + summary.held + summary.rejected;
    if (summary.fetched < 50 || handled === 0 || summary.write_errors > allowedWriteErrors) process.exitCode = 1;
  } catch (error) {
    await rest("job_source_registry", `source_key=eq.${SOURCE_KEY}`, { method: "PATCH", body: { last_checked_at: NOW_ISO, last_error: String(error?.message || error).slice(0, 500), updated_at: NOW_ISO } }).catch(() => {});
    console.error(`JOBS_INGEST_FATAL ${error?.stack || error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { ensureSourceRegistry, fetchChineseCandidates, normalizeAtsCandidate, normalizeCandidate, pickCategory, pickEnglishLocation, shouldExpand };

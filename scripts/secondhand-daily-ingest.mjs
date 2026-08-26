import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const TARGET = Math.max(2, Math.min(10, Number(process.env.SECONDHAND_TARGET_CANDIDATES || 10)));
const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const MAX_AGE_DAYS = 14;
const EXPIRES_ISO = new Date(NOW.getTime() + 30 * 86400000).toISOString();
const USER_AGENT = "TangDailySecondhandBot/1.0 (+https://huarengongzuo.com/ershou/)";

const sources = [
  { key: "nychinaren", name: "纽约华人资讯网", origin: "https://www.nychinaren.com", forum: "/f/page_viewforum/f_3.html" },
  { key: "chineseinla", name: "洛杉矶华人资讯网", origin: "https://www.chineseinla.com", forum: "/f/page_viewforum/f_3.html" },
];

const blockedPhones = new Set(["9295715245", "7183587333"]);
const prohibited = /二手车|卖车|买车|VIN|里程|宠物|猫狗|香烟|电子烟|烟弹|槟榔|酒类|药品|减肥药|处方药|保健品|手机靓号|账号|游戏币|代购|换汇|博彩|赌场|色情|成人用品|枪支|弹药|刀具|厂家直销|批发|招商|加盟|全美发货|商家推广|专业安装|售后服务/i;
const commercial = /公司|厂家|工厂|批发|库存充足|长期供应|代理|客服|门店|店内|承接|服务商|促销活动|roadshow/i;

const locationRules = [
  [/法拉盛|Flushing/i, ["NY", "Flushing", "法拉盛 · NY"]],
  [/皇后区|Queens/i, ["NY", "Queens", "皇后区 · NY"]],
  [/布鲁克林|布碌崙|Brooklyn/i, ["NY", "Brooklyn", "布鲁克林 · NY"]],
  [/曼哈顿|Manhattan/i, ["NY", "Manhattan", "曼哈顿 · NY"]],
  [/长岛|Long Island/i, ["NY", "Long Island", "长岛 · NY"]],
  [/纽约|New York/i, ["NY", "New York", "纽约 · NY"]],
  [/新泽西|New Jersey|\bNJ\b/i, ["NJ", "New Jersey", "新泽西 · NJ"]],
  [/康州|Connecticut/i, ["CT", "Connecticut", "康州 · CT"]],
  [/波士顿|Boston/i, ["MA", "Boston", "波士顿 · MA"]],
  [/费城|Philadelphia/i, ["PA", "Philadelphia", "费城 · PA"]],
  [/洛杉矶|Los Angeles/i, ["CA", "Los Angeles", "洛杉矶 · CA"]],
  [/圣盖博|San Gabriel/i, ["CA", "San Gabriel", "圣盖博 · CA"]],
  [/柔似蜜|Rosemead/i, ["CA", "Rosemead", "柔似蜜 · CA"]],
  [/阿罕布拉|Alhambra/i, ["CA", "Alhambra", "阿罕布拉 · CA"]],
  [/天普|Temple City/i, ["CA", "Temple City", "天普市 · CA"]],
  [/罗兰岗|Rowland Heights/i, ["CA", "Rowland Heights", "罗兰岗 · CA"]],
  [/哈岗|Hacienda Heights/i, ["CA", "Hacienda Heights", "哈岗 · CA"]],
  [/尔湾|Irvine/i, ["CA", "Irvine", "尔湾 · CA"]],
  [/东湾|East Bay|Hayward|Fremont/i, ["CA", "East Bay", "东湾 · CA"]],
  [/旧金山|三藩市|San Francisco/i, ["CA", "San Francisco", "旧金山 · CA"]],
  [/西雅图|Seattle/i, ["WA", "Seattle", "西雅图 · WA"]],
  [/芝加哥|Chicago/i, ["IL", "Chicago", "芝加哥 · IL"]],
  [/休斯[敦顿]|Houston/i, ["TX", "Houston", "休斯顿 · TX"]],
];

const categoryRules = [
  [/手机|电脑|平板|iPhone|iPad|MacBook|相机|镜头|显示器|耳机|音响|投影|数码/i, "digital"],
  [/婴儿|宝宝|儿童|玩具|安全座椅|婴儿车|母婴|童车/i, "baby"],
  [/衣服|服装|鞋|靴|箱包|皮包|手袋|配饰|首饰/i, "fashion"],
  [/搬家|清仓|甩卖|全屋|moving sale/i, "moving"],
  [/收藏|邮票|钱币|乐器|台球|摄影|手工|模型|球拍|运动/i, "hobby"],
  [/免费|赠送|自取|送人/i, "free"],
  [/家具|家电|沙发|床垫|床架|餐桌|椅子|冰箱|洗衣机|烘干机|微波炉|电饭锅|书桌|柜子|灯/i, "home"],
];

function decodeHtml(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function cleanPhone(value) { return String(value).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); }

function pickContact(text) {
  const phones = [...text.matchAll(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g)]
    .map((m) => `${m[1]}${m[2]}${m[3]}`).filter((x) => !blockedPhones.has(x));
  const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase());
  if (phones[0]) return `${phones[0].slice(0, 3)}-${phones[0].slice(3, 6)}-${phones[0].slice(6)}`;
  return emails[0] || null;
}

function pickLocation(text) {
  for (const [pattern, value] of locationRules) if (pattern.test(text)) return { state_code: value[0], city: value[1], location_label: value[2] };
  return null;
}

function pickCategory(text) {
  for (const [pattern, slug] of categoryRules) if (pattern.test(text)) return slug;
  return null;
}

function pickPrice(text) {
  if (/免费|赠送|免费自取/i.test(text)) return { price: 0, explicit: true };
  const patterns = [/\$\s*([0-9]{1,6}(?:\.[0-9]{1,2})?)/, /([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*(?:美元|美金|刀)(?!\s*(?:起|小时))/];
  for (const pattern of patterns) {
    const match = text.match(pattern); const price = Number(match?.[1]);
    if (Number.isFinite(price) && price >= 0 && price <= 100000) return { price, explicit: true };
  }
  return { price: null, explicit: false };
}

function pickCondition(text) {
  if (/全新|未拆|未使用/i.test(text)) return "new";
  if (/99新|95新|九五新|几乎全新/i.test(text)) return "like_new";
  if (/需要维修|故障|坏了|维修/i.test(text)) return "needs_repair";
  if (/明显使用|磨损|瑕疵/i.test(text)) return "used_fair";
  return "used_good";
}

function pickPublishedAt(text) {
  const match = text.match(/发布于\s*[:：]?\s*(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/i)
    || text.match(/发布日期\s*[:：]?\s*(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/i);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickTitle(html, text) {
  const raw = html.match(/id=["']contenttitle["'][^>]*>([\s\S]*?)<\//i)?.[1]
    || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || text.slice(0, 100);
  return decodeHtml(raw).replace(/\s*[-_|].*(?:华人|资讯网|论坛).*$/i, "").trim().slice(0, 60);
}

function extractImages(html, source) {
  const found = [];
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*(?:data-original|data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], source.origin).href;
      if (!/^https:\/\//i.test(url)) continue;
      if (/logo|avatar|icon|emoji|qrcode|qr-code|wx_share|sprite|banner|advert|loading|blank\.(?:gif|png)/i.test(url)) continue;
      if (!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url) && !/(?:attachment|upload|forum|photo|image)/i.test(url)) continue;
      if (!found.includes(url)) found.push(url);
    } catch {}
  }
  return found.slice(0, 8);
}

function extractListingSection(text, title) {
  let value = text;
  const marker = value.indexOf("详细描述");
  if (marker >= 0) value = value.slice(marker + 4);
  const end = value.search(/联系时请|返回页首|举报|相关标签|最后进行编辑/i);
  if (end >= 0) value = value.slice(0, end);
  return value.replace(title, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

function extractDescription(section) {
  const value = section.replace(/(?:电话|手机|联系方式)\s*[:：]?\s*(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}/gi, " ")
    .replace(/\s+/g, " ").trim();
  return value.slice(0, 2500);
}

function extractLocationHint(text) {
  return text.match(/(?:所在地区|所在区域|地区)\s*[:：]\s*(.{1,60}?)(?=类别|分类|发布时间|发布日期|详细描述|联系方式|电话|$)/i)?.[1]?.trim() || "";
}

function normalizeCandidate(source, url, html) {
  const text = decodeHtml(html);
  const title = pickTitle(html, text);
  const published = pickPublishedAt(text);
  const ageDays = published ? (NOW.getTime() - published.getTime()) / 86400000 : null;
  const section = extractListingSection(text, title);
  const description = extractDescription(section);
  const coreText = `${title} ${section}`;
  const contact = pickContact(section);
  const location = pickLocation(`${extractLocationHint(text)} ${coreText}`);
  const category = pickCategory(coreText);
  const price = pickPrice(coreText);
  const images = extractImages(html, source);
  const errors = [];
  if (title.length < 3) errors.push("missing_title");
  if (!published || ageDays < -1 || ageDays > MAX_AGE_DAYS) errors.push("stale_or_missing_date");
  if (!contact) errors.push("missing_public_contact");
  if (!location) errors.push("missing_us_location");
  if (!category) errors.push("unsupported_category");
  if (!price.explicit) errors.push("missing_price_or_free_marker");
  if (!images.length) errors.push("missing_product_image");
  if (description.length < 3) errors.push("missing_description");
  if (prohibited.test(`${title} ${description}`)) errors.push("prohibited_or_out_of_scope");
  if (commercial.test(`${title} ${description}`)) errors.push("commercial_advertisement");
  const externalId = url.match(/t_(\d+)/)?.[1] || sha256(url).slice(0, 20);
  const phoneKey = contact ? cleanPhone(contact) || contact.toLowerCase() : "";
  const dedupeKey = sha256(`${phoneKey}|${title.toLowerCase().replace(/\W/g, "").slice(0, 30)}`);
  const payload = { title, description, category_slug: category, price: price.price, item_condition: pickCondition(`${title} ${description}`), contact_value: contact, ...location };
  return { source, url, externalId, published, images, errors: [...new Set(errors)], dedupeKey, payload, payloadHash: sha256(JSON.stringify(payload)) };
}

async function fetchResponse(url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*" }, redirect: "follow", signal: controller.signal });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return response;
    } catch (error) { last = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt)); }
    finally { clearTimeout(timeout); }
  }
  throw last;
}

async function fetchText(url) { return await (await fetchResponse(url)).text(); }

async function rest(table, query = "", { method = "GET", body, prefer = "return=representation" } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method, headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${method} ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function discover(source) {
  const urls = new Set();
  for (let page = 1; page <= 3; page += 1) {
    const separator = source.forum.includes("?") ? "&" : "?";
    const html = await fetchText(`${source.origin}${source.forum}${separator}page=${page}`);
    for (const match of html.matchAll(/(?:href=["'])(?:https?:\/\/[^/]+)?(?:\/f\/page_viewtopic|\/page_forum\/task_vtopic)\/t_(\d+)\.html[^"']*["']/gi)) {
      urls.add(`${source.origin}/f/page_viewtopic/t_${match[1]}.html`);
    }
  }
  return [...urls].slice(0, 40);
}

async function downloadImages(candidate) {
  const images = [];
  for (const url of candidate.images.slice(0, 4)) {
    try {
      const response = await fetchResponse(url, 2);
      const type = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(type)) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 1500 || bytes.length > 8 * 1024 * 1024) continue;
      images.push({ url, type, bytes });
    } catch (error) { console.error("IMAGE_FETCH_ERROR", url, error?.message || error); }
  }
  return images;
}

async function uploadImage(candidate, listingId, image, index) {
  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const path = `external/${candidate.source.key}/${candidate.externalId}/${index}-${sha256(image.url).slice(0, 10)}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/secondhand-images/${path}`, {
    method: "POST", headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": image.type, "x-upsert": "true" }, body: image.bytes,
  });
  if (!response.ok) throw new Error(`storage upload ${response.status}: ${(await response.text()).slice(0, 300)}`);
  await rest("secondhand_listing_images", "", { method: "POST", body: { listing_id: listingId, uploader_user_id: null, storage_path: path, source_url: image.url, sort_order: index, alt_text: `${candidate.payload.title} 第${index + 1}张图` } });
}

async function publish(candidate) {
  if (candidate.errors.length) return "rejected";
  const existing = await rest("secondhand_listings", `source_key=eq.${candidate.source.key}&source_external_id=eq.${candidate.externalId}&select=id,status&limit=1`);
  if (existing?.[0]) {
    await rest("secondhand_listings", `id=eq.${existing[0].id}`, { method: "PATCH", body: { source_checked_at: NOW_ISO, source_payload_hash: candidate.payloadHash } });
    return "existing";
  }
  const duplicate = await rest("secondhand_listings", `dedupe_key=eq.${candidate.dedupeKey}&select=id&limit=1`);
  if (duplicate?.[0]) return "duplicate";
  const images = await downloadImages(candidate);
  if (!images.length) return "rejected_image";
  const sourceNote = `信息来自公开发布页面，发布于${candidate.published.toISOString().slice(0, 10)}。\n来源：${candidate.source.name}\n原始链接：${candidate.url}`;
  const inserted = await rest("secondhand_listings", "", { method: "POST", body: {
    seller_user_id: null, listing_origin: "external", source_key: candidate.source.key, source_external_id: candidate.externalId,
    source_url: candidate.url, source_published_at: candidate.published.toISOString(), source_checked_at: NOW_ISO,
    source_payload_hash: candidate.payloadHash, dedupe_key: candidate.dedupeKey, expires_at: EXPIRES_ISO,
    category_slug: candidate.payload.category_slug, title: candidate.payload.title,
    description: `${candidate.payload.description}\n\n${sourceNote}`.slice(0, 4000), price: candidate.payload.price,
    item_condition: candidate.payload.item_condition, country_code: "US", state_code: candidate.payload.state_code,
    city: candidate.payload.city, location_label: candidate.payload.location_label, contact_value: candidate.payload.contact_value,
    contact_public: true, ai_suggestion: { source_name: candidate.source.name, source_url: candidate.url, imported: true },
    status: "published", moderation_hold: false, status_reason: "external_pilot_rules_passed", published_at: NOW_ISO,
  } });
  const listingId = inserted?.[0]?.id;
  if (!listingId) throw new Error("listing insert returned no id");
  try {
    for (let i = 0; i < images.length; i += 1) await uploadImage(candidate, listingId, images[i], i);
  } catch (error) {
    await rest("secondhand_listings", `id=eq.${listingId}`, { method: "PATCH", body: { status: "paused", moderation_hold: true, status_reason: "external_image_upload_failed" } });
    throw error;
  }
  return "published";
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) { const index = cursor++; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { error, item: items[index] }; } }
  }));
  return output;
}

async function expireOldListings() {
  await rest("secondhand_listings", `listing_origin=eq.external&status=eq.published&expires_at=lt.${encodeURIComponent(NOW_ISO)}`, { method: "PATCH", body: { status: "paused", status_reason: "external_listing_expired" }, prefer: "return=minimal" });
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const summary = { started_at: NOW_ISO, target: TARGET, discovered: 0, fetched: 0, eligible: 0, published: 0, existing: 0, duplicate: 0, rejected: 0, errors: 0 };
  await expireOldListings();
  const discovered = [];
  for (const source of sources) {
    try { for (const url of await discover(source)) discovered.push({ source, url }); }
    catch (error) { console.error("DISCOVERY_ERROR", source.key, error?.message || error); summary.errors += 1; }
  }
  summary.discovered = discovered.length;
  const fetched = await mapLimit(discovered, 3, async ({ source, url }) => normalizeCandidate(source, url, await fetchText(url)));
  const candidates = fetched.filter((x) => x && !x.error);
  summary.fetched = candidates.length;
  summary.errors += fetched.length - candidates.length;
  const eligible = candidates.filter((x) => !x.errors.length).sort((a, b) => b.published - a.published).slice(0, TARGET);
  summary.eligible = eligible.length;
  for (const rejected of candidates.filter((x) => x.errors.length).slice(0, 20)) console.log("REJECTED", rejected.source.key, rejected.externalId, rejected.errors.join(","));
  for (const candidate of eligible) {
    try {
      const result = await publish(candidate);
      if (result === "published") summary.published += 1;
      else if (result === "existing") summary.existing += 1;
      else if (result === "duplicate") summary.duplicate += 1;
      else summary.rejected += 1;
    } catch (error) { summary.errors += 1; console.error("PUBLISH_ERROR", candidate.url, error?.message || error); }
  }
  console.log(`SECONDHAND_INGEST_SUMMARY ${JSON.stringify(summary)}`);
  if (!summary.discovered || summary.errors > Math.max(5, summary.fetched * 0.25)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { normalizeCandidate, pickCategory, pickContact, pickLocation, pickPrice };

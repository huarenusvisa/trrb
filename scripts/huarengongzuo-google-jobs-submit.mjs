import fs from "node:fs/promises";
import { google } from "googleapis";

const ORIGIN = "https://huarengongzuo.com";
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const GSC_SITE = process.env.HG_GOOGLE_SEARCH_CONSOLE_SITE_URL || "https://huarengongzuo.com/";
const GSC_JSON = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || "";
const BING_KEY = process.env.BING_WEBMASTER_API_KEY || "";
const INDEXNOW_KEY = "55d15283c33385e09b4f3fae7562a9cc";
const INDEXNOW_KEY_LOCATION = `${ORIGIN}/${INDEXNOW_KEY}.txt`;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WRITE_MODE = /^(?:1|true|yes)$/i.test(process.env.SEO_WRITE_MODE || "false");
const MAX_INDEXING_URLS = Math.max(1, Math.min(200, Number(process.env.GOOGLE_JOBS_INDEXING_LIMIT || 200)));
const report = {
  generatedAt: new Date().toISOString(), origin: ORIGIN, sitemap: SITEMAP, writeMode: WRITE_MODE,
  sitemapAudit: {}, google: { configured: false }, bing: { configured: false }, warnings: [], failures: []
};

function decodeXml(value = "") {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}
function locations(xml = "") {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
}
function eligibleJobUrls(xml = "") {
  return [...new Set(locations(xml).filter((value) => {
    try {
      const url = new URL(value);
      return url.origin === ORIGIN && url.pathname === "/jobs/listing.html" && /^[0-9a-f-]{36}$/i.test(url.searchParams.get("id") || "");
    } catch { return false; }
  }))];
}
async function fetchSitemap() {
  const response = await fetch(`${SITEMAP}?submit=${Date.now()}`, {
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1", "cache-control": "no-cache", "user-agent": "HuarenGongzuo-SEO-Ops/1.0" },
    cache: "no-store"
  });
  const text = await response.text();
  const marker = response.headers.get("x-hg-sitemap") || "";
  report.sitemapAudit = { status: response.status, marker, bytes: text.length, declaredJobs: response.headers.get("x-hg-sitemap-jobs") };
  if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`);
  if (marker !== "google-jobs-quality-gated-v1") throw new Error(`unexpected sitemap quality marker: ${marker || "missing"}`);
  const urls = eligibleJobUrls(text);
  report.sitemapAudit.jobUrls = urls.length;
  return urls;
}
async function recentlyRemovedJobUrls(currentUrls) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    report.warnings.push("Supabase server credentials are missing; expired job notifications skipped");
    return [];
  }
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, accept: "application/json" };
  async function rows(params) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/job_listings`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "200");
    const response = await fetch(url, { headers, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new Error(`job removal query HTTP ${response.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text);
  }
  const [expired, closed, held] = await Promise.all([
    rows({ and: `(expires_at.gte.${cutoff},expires_at.lte.${now})` }),
    rows({ status: "neq.open", updated_at: `gte.${cutoff}` }),
    rows({ moderation_hold: "eq.true", updated_at: `gte.${cutoff}` })
  ]);
  const current = new Set(currentUrls);
  const ids = [...new Set([...expired, ...closed, ...held].map((row) => String(row?.id || "")).filter(Boolean))];
  return ids.map((id) => `${ORIGIN}/jobs/listing.html?id=${encodeURIComponent(id)}`).filter((url) => !current.has(url));
}
async function googleOps(updatedUrls, deletedUrls) {
  if (!GSC_JSON) throw new Error("Google service account secret is missing");
  let credentials;
  try { credentials = JSON.parse(GSC_JSON); } catch { throw new Error("Google service account JSON is invalid"); }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/indexing"]
  });
  const webmasters = google.webmasters({ version: "v3", auth });
  const indexing = google.indexing({ version: "v3", auth });
  report.google.configured = true;
  report.google.serviceAccountEmail = credentials.client_email || null;
  report.google.siteUrl = GSC_SITE;
  const site = await webmasters.sites.get({ siteUrl: GSC_SITE });
  report.google.permissionLevel = site.data.permissionLevel || null;
  if (!WRITE_MODE) return;
  await webmasters.sitemaps.submit({ siteUrl: GSC_SITE, feedpath: SITEMAP });
  report.google.sitemapSubmitted = true;
  const queue = [
    ...updatedUrls.map((url) => ({ url, type: "URL_UPDATED" })),
    ...deletedUrls.map((url) => ({ url, type: "URL_DELETED" }))
  ].slice(0, MAX_INDEXING_URLS);
  report.google.indexing = {
    requested: queue.length,
    updatedRequested: queue.filter((item) => item.type === "URL_UPDATED").length,
    deletedRequested: queue.filter((item) => item.type === "URL_DELETED").length,
    succeeded: 0, failed: 0, errors: []
  };
  for (const item of queue) {
    try {
      await indexing.urlNotifications.publish({ requestBody: item });
      report.google.indexing.succeeded += 1;
    } catch (error) {
      report.google.indexing.failed += 1;
      if (report.google.indexing.errors.length < 10) report.google.indexing.errors.push({ ...item, error: String(error?.message || error).slice(0, 300) });
    }
  }
  if (report.google.indexing.failed) report.failures.push(`Google Indexing API failed for ${report.google.indexing.failed} URL(s)`);
}
async function bingCall(method, body) {
  const response = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${method}?apikey=${encodeURIComponent(BING_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 180)}`);
}
async function bingOps(updatedUrls, deletedUrls) {
  report.bing.configured = true;
  report.bing.mode = BING_KEY ? "webmaster-api+indexnow" : "indexnow";
  if (!WRITE_MODE) return;
  if (BING_KEY) {
    await bingCall("SubmitFeed", { siteUrl: ORIGIN, feedUrl: SITEMAP });
    report.bing.sitemapSubmitted = true;
  } else {
    report.warnings.push("Bing Webmaster API key is missing; sitemap remains discoverable through robots.txt and IndexNow is used for URL notifications");
  }
  const keyResponse = await fetch(INDEXNOW_KEY_LOCATION, { cache: "no-store" });
  const keyBody = keyResponse.ok ? (await keyResponse.text()).trim() : "";
  if (!keyResponse.ok || keyBody !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key verification failed: HTTP ${keyResponse.status}`);
  }
  const urls = [...new Set([...updatedUrls, ...deletedUrls])].slice(0, 10000);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(ORIGIN).hostname, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList: urls })
  });
  const responseText = await response.text();
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow HTTP ${response.status}: ${responseText.slice(0, 180)}`);
  report.bing.indexNow = { submitted: urls.length, status: response.status };
}

let updatedUrls = [];
let deletedUrls = [];
try { updatedUrls = await fetchSitemap(); }
catch (error) { report.failures.push(String(error?.message || error)); }
if (updatedUrls.length) {
  try { deletedUrls = await recentlyRemovedJobUrls(updatedUrls); }
  catch (error) { report.failures.push(`Expired job discovery: ${String(error?.message || error)}`); }
  report.sitemapAudit.recentlyRemovedUrls = deletedUrls.length;
  try { await googleOps(updatedUrls, deletedUrls); }
  catch (error) { report.failures.push(`Google Search Console/Indexing API: ${String(error?.message || error)}`); }
  try { await bingOps(updatedUrls, deletedUrls); }
  catch (error) { report.failures.push(`Bing Webmaster: ${String(error?.message || error)}`); }
}
await fs.writeFile("huarengongzuo-google-jobs-submit-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

export { eligibleJobUrls };

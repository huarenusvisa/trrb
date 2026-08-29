#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".netlify"]);
const SKIP_HTML_PREFIXES = ["admin/", "trrb_admin_v1/"];
const ROUTE_PREFIXES = new Set([
  "ice", "trump", "immigrate", "important-news", "hot-headlines", "us-politics",
  "us-crime", "china-officialdom", "asylum", "asylumjudge", "immigration", "deport", "expose", "community", "jobs", "niulai", "ershou", "news"
]);
const FORBIDDEN_SITEMAP_ROUTES = [
  /https:\/\/trrb\.net\/niulai(?:\/|[?<]|$)/i,
  /https:\/\/trrb\.net\/people(?:\/|[?<]|$)/i,
  /https:\/\/trrb\.net\/expose(?:\/|\?|<|$)/i,
  /https:\/\/trrb\.net\/(?:thanks|delete-account)\.html(?:\?|<|$)/i,
  /https:\/\/trrb\.net\/(?:uscis|dhs|cbp|visa|world)(?:\/|\?|<|$)/i
];
const errors = [];
const warnings = [];
const checked = { html: 0, links: 0, images: 0, scripts: 0, styles: 0 };

async function walk(dir = ROOT) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(ROOT, file).replaceAll(path.sep, "/"); }
function cleanUrl(value) {
  return String(value || "").trim().replace(/&amp;/g, "&").split("#")[0].split("?")[0];
}
function isExternal(value) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|\/\/)/i.test(value);
}
function localTarget(fromFile, raw) {
  const clean = cleanUrl(raw);
  if (!clean || isExternal(clean)) return null;
  if (clean === "/") return "index.html";
  let target = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(rel(fromFile)), clean));
  if (target.endsWith("/")) target += "index.html";
  return target.replace(/^\.\//, "");
}
async function exists(target) {
  try { return (await stat(path.join(ROOT, target))).isFile(); }
  catch { return false; }
}
function tagValues(html, tag, attr) {
  const values = [];
  const tagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(tagRe)) {
    const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i");
    const found = match[0].match(attrRe);
    if (found) values.push(found[1]);
  }
  return values;
}
function has(html, re) { return re.test(html); }
function isCleanRouteTarget(target) {
  if (!target || path.posix.extname(target)) return false;
  const first = target.split("/").filter(Boolean)[0] || "";
  return ROUTE_PREFIXES.has(first);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\const files = await walk();
const htmlFiles = files.filter((f) => f.endsWith(".html"));");
}
function redirectRoutePattern(route) {
  const parts = route.split("/");
  const body = parts.map((part) => {
    if (part === "*" || /^:[A-Za-z][\w-]*$/.test(part)) return "[^?]*";
    return escapeRegex(part);
  }).join("/");
  return new RegExp(`^${body}/?#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".netlify"]);
const SKIP_HTML_PREFIXES = ["admin/", "trrb_admin_v1/"];
const ROUTE_PREFIXES = new Set([
  "ice", "trump", "immigrate", "important-news", "hot-headlines", "us-politics",
  "us-crime", "china-officialdom", "asylum", "asylumjudge", "immigration", "deport", "expose", "community", "jobs", "niulai", "ershou", "news"
]);
const FORBIDDEN_SITEMAP_ROUTES = [
  /https:\/\/trrb\.net\/niulai(?:\/|[?<]|$)/i,
  /https:\/\/trrb\.net\/people(?:\/|[?<]|$)/i,
  /https:\/\/trrb\.net\/expose(?:\/|\?|<|$)/i,
  /https:\/\/trrb\.net\/(?:thanks|delete-account)\.html(?:\?|<|$)/i,
  /https:\/\/trrb\.net\/(?:uscis|dhs|cbp|visa|world)(?:\/|\?|<|$)/i
];
const errors = [];
const warnings = [];
const checked = { html: 0, links: 0, images: 0, scripts: 0, styles: 0 };

async function walk(dir = ROOT) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(ROOT, file).replaceAll(path.sep, "/"); }
function cleanUrl(value) {
  return String(value || "").trim().replace(/&amp;/g, "&").split("#")[0].split("?")[0];
}
function isExternal(value) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|\/\/)/i.test(value);
}
function localTarget(fromFile, raw) {
  const clean = cleanUrl(raw);
  if (!clean || isExternal(clean)) return null;
  if (clean === "/") return "index.html";
  let target = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(rel(fromFile)), clean));
  if (target.endsWith("/")) target += "index.html";
  return target.replace(/^\.\//, "");
}
async function exists(target) {
  try { return (await stat(path.join(ROOT, target))).isFile(); }
  catch { return false; }
}
function tagValues(html, tag, attr) {
  const values = [];
  const tagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(tagRe)) {
    const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i");
    const found = match[0].match(attrRe);
    if (found) values.push(found[1]);
  }
  return values;
}
function has(html, re) { return re.test(html); }
function isCleanRouteTarget(target) {
  if (!target || path.posix.extname(target)) return false;
  const first = target.split("/").filter(Boolean)[0] || "";
  return ROUTE_PREFIXES.has(first);
}

);
}
async function loadInternalRedirectMatchers() {
  try {
    const source = await readFile(path.join(ROOT, "_redirects"), "utf8");
    const routes = [];
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const tokens = line.split(/\s+/);
      if (tokens.length < 3) continue;
      const status = tokens[tokens.length - 1];
      const target = tokens[tokens.length - 2];
      if (!/^(?:200|301)!?$/.test(status) || !target.startsWith("/")) continue;
      let sourceRoute = tokens[0];
      if (/^https?:\/\//i.test(sourceRoute)) {
        try { sourceRoute = new URL(sourceRoute).pathname; } catch { continue; }
      }
      sourceRoute = cleanUrl(sourceRoute);
      if (!sourceRoute.startsWith("/")) continue;
      routes.push(redirectRoutePattern(sourceRoute));
    }
    return routes;
  } catch {
    return [];
  }
}
function isRedirectBacked(raw, matchers) {
  const route = cleanUrl(raw);
  return route.startsWith("/") && matchers.some((pattern) => pattern.test(route));
}

const files = await walk();
const internalRedirectMatchers = await loadInternalRedirectMatchers();
const htmlFiles = files.filter((f) => f.endsWith(".html") && !/(?:^|\/)google[a-z0-9]+\.html$/i.test(rel(f)));

for (const file of htmlFiles) {
  const name = rel(file);
  const html = await readFile(file, "utf8");
  checked.html++;
  const publicPage = !SKIP_HTML_PREFIXES.some((prefix) => name.startsWith(prefix));
  const is404 = name === "404.html";

  if (publicPage) {
    if (!has(html, /<html\b[^>]*\blang=["'][^"']+["']/i)) errors.push(`${name}: 缺少 html lang`);
    if (!has(html, /<title>[^<]{3,}<\/title>/i)) errors.push(`${name}: 缺少有效 title`);
    if (!has(html, /<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']{20,}["']/i) && !has(html, /<meta\b[^>]*content=["'][^"']{20,}["'][^>]*name=["']description["']/i)) warnings.push(`${name}: 缺少或过短 meta description`);
    if (is404) {
      if (!/noindex/i.test(html)) errors.push(`${name}: 404页面必须 noindex`);
    } else if (/name=["']robots["'][^>]*noindex/i.test(html)) {
      warnings.push(`${name}: 公共页面被设置为 noindex`);
    }
    const dynamicSeo = ["article.html", "listing.html"].includes(name) || /article-seo\.js|listing-seo\.js/.test(html);
    if (!dynamicSeo && !has(html, /<link\b[^>]*rel=["']canonical["']/i)) warnings.push(`${name}: 缺少 canonical`);
    if (!has(html, /property=["']og:title["']/i) && !dynamicSeo) warnings.push(`${name}: 缺少 Open Graph title`);
  }

  const checks = [
    ["a", "href", "links"], ["img", "src", "images"], ["script", "src", "scripts"], ["link", "href", "styles"]
  ];
  for (const [tag, attr, bucket] of checks) {
    for (const raw of tagValues(html, tag, attr)) {
      const target = localTarget(file, raw);
      if (!target) continue;
      checked[bucket]++;
      if (raw.includes(":")) continue;
      if (!(await exists(target)) && !isCleanRouteTarget(target) && !isRedirectBacked(raw, internalRedirectMatchers)) {
        errors.push(`${name}: ${tag}[${attr}] 指向不存在文件 ${raw} -> ${target}`);
      }
    }
  }
}

for (const item of ["robots.txt", "sitemap.xml", "news-sitemap.xml", "feed.xml", "404.html"]) {
  if (!(await exists(item))) errors.push(`缺少 ${item}`);
}

try {
  const robots = await readFile(path.join(ROOT, "robots.txt"), "utf8");
  if (!/User-agent:\s*\*/i.test(robots)) errors.push("robots.txt 缺少 User-agent: *");
  if (!/Sitemap:\s*https:\/\/trrb\.net\/sitemap\.xml/i.test(robots)) errors.push("robots.txt 缺少主 sitemap 声明");
  if (!/Sitemap:\s*https:\/\/trrb\.net\/news-sitemap\.xml/i.test(robots)) warnings.push("robots.txt 缺少 news sitemap 声明");
  if (/Sitemap:\s*https:\/\/www\.trrb\.net\//i.test(robots)) errors.push("robots.txt 仍包含 www.trrb.net sitemap 声明");
  if (!/Disallow:\s*\/admin\//i.test(robots)) warnings.push("robots.txt 未屏蔽后台目录");
} catch {}

try {
  const sitemap = await readFile(path.join(ROOT, "sitemap.xml"), "utf8");
  if (!/<(?:sitemapindex|urlset)\b/i.test(sitemap)) errors.push("sitemap.xml 结构无效");
  if (/http:\/\/trrb\.net/i.test(sitemap)) errors.push("sitemap.xml 包含非HTTPS地址");
} catch {}

for (const file of files.filter((item) => /(?:^|\/)sitemap[^/]*\.xml$/i.test(rel(item)))) {
  const name = rel(file);
  const xml = await readFile(file, "utf8");
  for (const pattern of FORBIDDEN_SITEMAP_ROUTES) {
    if (pattern.test(xml)) errors.push(`${name}: 包含 noindex、预发布或已退役路由`);
  }
  if (/https:\/\/www\.trrb\.net\//i.test(xml)) errors.push(`${name}: 包含 www.trrb.net URL`);
  if (/\/article\.html\?id=/i.test(xml)) errors.push(`${name}: 包含旧 article.html?id= URL`);
}

// Recruitment now uses huarengongzuo.com as its canonical host. The trrb.net
// sitemap must not manufacture an indexable /jobs/ URL for a permanent redirect.
try {
  const liveSitemap = await readFile(path.join(ROOT, "netlify/edge-functions/sitemap-live.ts"), "utf8");
  if (/jobsLoc\s*=\s*`\$\{SITE\}\/jobs\/`/.test(liveSitemap)) errors.push("live sitemap 仍在加入已跳转的 /jobs/");
  if (!/live-supabase-v8-jobs-external-canonical/.test(liveSitemap)) errors.push("live sitemap 未升级到 jobs external canonical v8");
} catch (error) {
  errors.push(`无法读取 live sitemap edge: ${error.message}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  checked,
  errors,
  warnings,
  status: errors.length ? "failed" : "passed"
};
await writeFile(path.join(ROOT, "seo-audit-report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`SEO审计完成：HTML ${checked.html}，内部链接 ${checked.links}，图片 ${checked.images}，脚本 ${checked.scripts}，样式 ${checked.styles}`);
if (warnings.length) console.warn(`SEO警告 ${warnings.length} 条:\n- ${warnings.slice(0, 80).join("\n- ")}`);
if (errors.length) {
  console.error(`SEO/404错误 ${errors.length} 条:\n- ${errors.slice(0, 120).join("\n- ")}`);
  const isNetlify = process.env.NETLIFY === "true";
  if (!isNetlify) process.exit(1);
  console.warn("Netlify deploy will continue; strict SEO/404 auditing remains enforced in GitHub Actions.");
}
console.log(errors.length ? "SEO与内部404审计完成，Netlify 以非阻断警告继续。" : "SEO与内部404审计通过。");

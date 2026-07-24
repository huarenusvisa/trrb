import { readFile } from "node:fs/promises";

const failures = [];

async function bytes(path) {
  try { return await readFile(path); }
  catch (error) { failures.push(`${path}: missing (${error.code || error.message})`); return Buffer.alloc(0); }
}

function startsText(buffer, expected) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, 300)).trimStart().startsWith(expected);
}

function includesText(buffer, expected) {
  return buffer.toString("utf8").includes(expected);
}

async function parseBrowserScript(path) {
  const source = (await bytes(path)).toString("utf8");
  if (!source) return;
  try { new Function(source); }
  catch (error) { failures.push(`${path}: JavaScript syntax error (${error.message})`); }
}

const index = await bytes("index.html");
if (!startsText(index, "<!doctype html>")) failures.push("index.html is not HTML");
if (!includesText(index, "category-runtime-v3.js")) failures.push("index.html is missing category CMS runtime");

const listing = await bytes("listing.html");
if (!startsText(listing, "<!doctype html>")) failures.push("listing.html is not HTML");
if (!includesText(listing, "category-runtime-v3.js")) failures.push("listing.html is missing category CMS runtime");
if (!includesText(listing, "nav-expose-link")) failures.push("listing.html is missing persistent expose navigation link");

const article = await bytes("article.html");
if (!startsText(article, "<!doctype html>")) failures.push("article.html is not HTML");
if (!includesText(article, "category-runtime-v3.js")) failures.push("article.html is missing category CMS runtime");
if (!includesText(article, "nav-expose-link")) failures.push("article.html is missing persistent expose navigation link");

const css = await bytes("styles.css");
const cssHead = css.toString("utf8", 0, Math.min(css.length, 300)).trimStart();
if (!(cssHead.startsWith(":root") || cssHead.startsWith("*") || cssHead.startsWith("body"))) failures.push("styles.css does not look like CSS");

const common = await bytes("site-common.js");
if (startsText(common, "{")) failures.push("site-common.js contains JSON instead of JavaScript");

const search = await bytes("site-search.js");
if (!includesText(search, "bindSiteSearch")) failures.push("site-search.js is missing search code");

const categoryRuntime = await bytes("category-runtime-v3.js");
if (!includesText(categoryRuntime, "show_in_navigation") || !includesText(categoryRuntime, "show_on_homepage")) failures.push("category runtime is not using canonical CMS fields");

await Promise.all([
  parseBrowserScript("site-common.js"),
  parseBrowserScript("site-search.js"),
  parseBrowserScript("category-runtime-v3.js"),
  parseBrowserScript("listing.js"),
  parseBrowserScript("article.js"),
  parseBrowserScript("admin/category-manager.js")
]);

const manifest = await bytes("site.webmanifest");
try { JSON.parse(manifest.toString("utf8")); }
catch { failures.push("site.webmanifest is not valid JSON"); }

const logo = await bytes("trrb-logo-cropped.webp");
if (!(logo.subarray(0, 4).toString("ascii") === "RIFF" && logo.subarray(8, 12).toString("ascii") === "WEBP")) failures.push("trrb-logo-cropped.webp is not WebP");

const qr = await bytes("assets/reader-group-qr.jpeg");
if (!(qr[0] === 0xff && qr[1] === 0xd8 && qr[2] === 0xff)) failures.push("assets/reader-group-qr.jpeg is not JPEG");

const sitemap = await bytes("sitemap.xml");
if (!startsText(sitemap, "<?xml")) failures.push("sitemap.xml is not XML");
if (!includesText(sitemap, "<urlset") || !includesText(sitemap, "<loc>https://www.trrb.net/</loc>")) failures.push("sitemap.xml is missing its root URL");

const newsSitemap = await bytes("news-sitemap.xml");
if (!startsText(newsSitemap, "<?xml")) failures.push("news-sitemap.xml is not XML");
if (!includesText(newsSitemap, "xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\"")) failures.push("news-sitemap.xml is missing Google News namespace");

const feed = await bytes("feed.xml");
if (!startsText(feed, "<?xml")) failures.push("feed.xml is not XML");
if (!includesText(feed, "<rss version=\"2.0\"") || !includesText(feed, "<channel>")) failures.push("feed.xml is not a valid RSS document");

const redirects = await bytes("_redirects");
if (!redirects.toString("utf8").trim()) failures.push("_redirects contains no category routes");

const headers = await bytes("_headers");
if (headers[0] === 0xff && headers[1] === 0xd8) failures.push("_headers was replaced by an image");
if (!includesText(headers, "Cache-Control")) failures.push("_headers is missing cache rules");

if (failures.length) {
  console.error("TRRB site integrity check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("TRRB production integrity check passed.");

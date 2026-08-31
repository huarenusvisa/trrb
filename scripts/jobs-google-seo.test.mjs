import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [page, sitemap, netlify, listing] = await Promise.all([
  read("netlify/edge-functions/huarengongzuo-job-prerender.ts"),
  read("netlify/edge-functions/huarengongzuo-jobs-sitemap.ts"),
  read("netlify.toml"),
  read("jobs/listing.html")
]);

for (const required of [
  '"@type": "JobPosting"',
  "hiringOrganization",
  "datePosted",
  "validThrough",
  "jobLocation",
  "directApply",
  "company_name",
  "expires_at",
  "moderation_hold"
]) {
  assert.ok(page.includes(required), "job prerender missing " + required);
}
assert.match(page, /clean\(job\.description\)\.length\s*>=\s*MIN_DESCRIPTION/, "description quality gate missing");
assert.match(page, /expires\s*>\s*Date\.now\(\)/, "future-expiry gate missing");
assert.match(page, /publicAction\(job\)/, "public apply/contact gate missing");
assert.doesNotMatch(page, /name:\s*["']华人工作网["'][\s\S]{0,80}hiringOrganization/, "platform must not impersonate the hiring organization");
assert.match(page, /SUPABASE_SERVICE_ROLE_KEY/, "server-side database key lookup missing");
assert.doesNotMatch(listing, /SUPABASE_SERVICE_ROLE_KEY/, "service role key leaked into public listing HTML");

assert.match(sitemap, /google-jobs-quality-gated-v1/, "quality-gated jobs sitemap marker missing");
assert.match(sitemap, /\.filter\(eligible\)/, "jobs sitemap does not share the eligibility boundary");
assert.match(sitemap, /listing\.html\?id=/, "jobs sitemap missing canonical detail URLs");
assert.match(sitemap, /expires\s*>\s*Date\.now\(\)/, "sitemap future-expiry gate missing");

assert.match(netlify, /function\s*=\s*"huarengongzuo-job-prerender"[\s\S]*path\s*=\s*"\/jobs\/listing\.html"/, "job prerender edge route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-jobs-sitemap"[\s\S]*path\s*=\s*"\/sitemap\.xml"/, "jobs sitemap edge route missing");
assert.match(listing, /noindex,follow,noarchive/, "base job template must stay noindex until a real open job passes the edge gate");

console.log("Google Jobs SEO contract passed: real employer, full description, live expiry, public application, server rendering and sitemap gates are enforced.");

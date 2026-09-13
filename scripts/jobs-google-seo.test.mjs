import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [page, sitemap, netlify, listing, robots, indexNowKey, submitter, workflow, landing, jobsPage, publishPage, seekerPage] = await Promise.all([
  read("netlify/edge-functions/huarengongzuo-job-prerender.ts"),
  read("netlify/edge-functions/huarengongzuo-jobs-sitemap.ts"),
  read("netlify.toml"),
  read("jobs/listing.html"),
  read("netlify/edge-functions/huarengongzuo-robots.ts"),
  read("netlify/edge-functions/huarengongzuo-indexnow-key.ts"),
  read("scripts/huarengongzuo-google-jobs-submit.mjs"),
  read(".github/workflows/huarengongzuo-google-jobs-submit.yml"),
  read("netlify/edge-functions/huarengongzuo-seo-landing.ts"),
  read("jobs/index.html"),
  read("jobs/publish.html"),
  read("jobs/seeker.html")
]);
const home = await read("huarengongzuo/index.html");

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
assert.match(page, /validCompany\(job\.company_name\)/, "placeholder employer gate missing from job page");
assert.match(sitemap, /validCompany\(job\.company_name\)/, "placeholder employer gate missing from jobs sitemap");
for (const placeholder of ["未公开雇主", "招聘方未公开名称", "unknown", "confidential"]) {
  assert.ok(page.includes(placeholder), `job page does not reject placeholder employer: ${placeholder}`);
  assert.ok(sitemap.includes(placeholder), `jobs sitemap does not reject placeholder employer: ${placeholder}`);
}
assert.doesNotMatch(page, /name:\s*["']华人工作网["'][\s\S]{0,80}hiringOrganization/, "platform must not impersonate the hiring organization");
assert.match(page, /SUPABASE_SERVICE_ROLE_KEY/, "server-side database key lookup missing");
assert.doesNotMatch(listing, /SUPABASE_SERVICE_ROLE_KEY/, "service role key leaked into public listing HTML");

assert.match(sitemap, /google-jobs-quality-gated-v1/, "quality-gated jobs sitemap marker missing");
assert.match(sitemap, /\.filter\(eligible\)/, "jobs sitemap does not share the eligibility boundary");
assert.match(sitemap, /listing\.html\?id=/, "jobs sitemap missing canonical detail URLs");
assert.match(sitemap, /expires\s*>\s*Date\.now\(\)/, "sitemap future-expiry gate missing");
assert.match(sitemap, /\/jobs\/locations\/flushing\//, "evergreen location pages missing from sitemap");
assert.match(sitemap, /\/jobs\/categories\/restaurant\//, "evergreen category pages missing from sitemap");
assert.doesNotMatch(sitemap, /block\(`\$\{SITE\}\/jobs\/(?:publish|seeker)\.html/, "transaction forms must not be emitted in sitemap");

assert.match(netlify, /function\s*=\s*"huarengongzuo-job-prerender"[\s\S]*path\s*=\s*"\/jobs\/listing\.html"/, "job prerender edge route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-jobs-sitemap"[\s\S]*path\s*=\s*"\/sitemap\.xml"/, "jobs sitemap edge route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-robots"[\s\S]*path\s*=\s*"\/robots\.txt"/, "Huaren Gongzuo robots edge route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-indexnow-key"[\s\S]*path\s*=\s*"\/55d15283c33385e09b4f3fae7562a9cc\.txt"/, "Huaren Gongzuo IndexNow key route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-seo-landing"[\s\S]*path\s*=\s*"\/jobs\/locations\/\*"/, "location SEO landing route missing");
assert.match(netlify, /function\s*=\s*"huarengongzuo-seo-landing"[\s\S]*path\s*=\s*"\/jobs\/categories\/\*"/, "category SEO landing route missing");
assert.match(landing, /CollectionPage/, "SEO landing page structured data missing");
assert.match(landing, /BreadcrumbList/, "SEO landing breadcrumb structured data missing");
assert.match(landing, /icon-192\.png/, "SEO landing logo/favicon missing");
assert.match(jobsPage, /canonical" href="https:\/\/huarengongzuo\.com\/jobs\//, "jobs page canonical is not owned by 华人工作网");
assert.match(jobsPage, /华人工作网 Logo/, "visible jobs page logo missing");
assert.match(publishPage, /noindex,follow/, "publish form should not compete in search results");
assert.match(seekerPage, /noindex,follow/, "seeker form should not compete in search results");
assert.match(listing, /noindex,follow,noarchive/, "base job template must stay noindex until a real open job passes the edge gate");
assert.match(robots, /Sitemap: https:\/\/huarengongzuo\.com\/sitemap\.xml/, "host robots does not advertise jobs sitemap");
assert.match(indexNowKey, /55d15283c33385e09b4f3fae7562a9cc/, "IndexNow verification key response missing");
assert.match(submitter, /urlNotifications\.publish/, "Google Indexing API publisher missing");
assert.match(submitter, /serviceAccountEmail/, "Google service-account authorization diagnostics missing");
assert.match(submitter, /URL_UPDATED/, "Google updated-job notification missing");
assert.match(submitter, /URL_DELETED/, "Google expired-job notification missing");
assert.match(submitter, /sitemaps\.submit/, "Google Search Console sitemap submission missing");
assert.match(submitter, /SubmitFeed/, "Bing sitemap submission missing");
assert.match(submitter, /api\.indexnow\.org\/indexnow/, "Bing IndexNow fallback missing");
assert.doesNotMatch(workflow, /workflow_run:|schedule:/, "independent site must not run its own scheduled SEO robot");
assert.doesNotMatch(workflow, /huarengongzuo-google-jobs-submit\.mjs|SEO_WRITE_MODE:\s*['\"]true/, "independent site must not submit directly to search engines");
assert.match(workflow, /huarengongzuo\/seo\/tasks\.json/, "central SEO task-pool handoff is missing");
assert.match(home, /google-site-verification/, "Google Search Console ownership marker missing from Huaren Gongzuo home");

console.log("Google Jobs SEO contract passed: real employer, full description, live expiry, public application, server rendering and sitemap gates are enforced.");

import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const page = read('huarengongzuo/index.html');
const app = read('huarengongzuo/site.js');
const brand = read('huarengongzuo/domain-brand.js');
const redirects = read('_redirects');
const trrbJobs = read('jobs/index.html');

const checks = [
  ['standalone page uses 华人工作网 brand', /<h1>找工作，<em>更直接<\/em><\/h1>/.test(page) && /华人工作网/.test(page)],
  ['standalone canonical is correct', /https:\/\/huarengongzuo\.com\//.test(page)],
  ['same production jobs endpoint is reused', /\/\.netlify\/functions\/public-jobs\?limit=100/.test(app)],
  ['no shadow database or second Supabase project', !/createClient|supabase\.co|job_listings_r3|huarengongzuo_jobs/i.test(app + page)],
  ['direct phone, SMS and email contact remain available', /tel:/.test(app) && /sms:/.test(app) && /mailto:/.test(app)],
  ['employer and seeker publishing stay on canonical jobs routes', /\/jobs\/publish\.html/.test(page) && /\/jobs\/seeker\.html/.test(page)],
  ['domain root, robots and sitemap rewrites exist', ['/', '/robots.txt', '/sitemap.xml'].every((path) => redirects.includes(`https://huarengongzuo.com${path}`))],
  ['www and HTTP permanently canonicalize to HTTPS apex', /http:\/\/www\.huarengongzuo\.com\/\*/.test(redirects) && /https:\/\/www\.huarengongzuo\.com\/\*/.test(redirects)],
  ['唐人日报 jobs entry links directly to independent site', /href="https:\/\/huarengongzuo\.com\/">招聘求职<\/a>/.test(read('index.html')) && /美国招聘求职｜唐人日报/.test(trrbJobs)],
  ['independent site owns its browser and search icon', /\/favicon\.svg/.test(page) && /huarengongzuo\/logo-mark\.svg/.test(redirects)],
  ['share metadata uses a public PNG card', /property="og:image" content="https:\/\/huarengongzuo\.com\/og-share\.png/.test(page) && /rel="apple-touch-icon"/.test(page)],
  ['share and Apple icon host rewrites exist', /huarengongzuo\.com\/og-share\.png \/huarengongzuo\/og-share\.png/.test(redirects) && /huarengongzuo\.com\/apple-touch-icon\.png \/huarengongzuo\/apple-touch-icon\.png/.test(redirects)],
  ['custom-domain brand layer does not run on trrb.net', /if \(!\/\^\(www\\\.\)\?huarengongzuo/.test(brand)]
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failed++;
}
if (failed) {
  console.error(`HUARENGONGZUO DOMAIN FAIL: ${failed}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`HUARENGONGZUO DOMAIN PASS: ${checks.length}/${checks.length}`);

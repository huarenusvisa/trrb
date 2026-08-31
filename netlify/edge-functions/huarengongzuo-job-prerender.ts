const SITE = "https://huarengongzuo.com";
const MIN_DESCRIPTION = 100;
const OFFICIAL_APPLY_SOURCE = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;

export const config = { path: "/jobs/listing.html" };

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch] || ch));
}
function escJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
function iso(value: unknown): string {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function supabaseConfig() {
  return {
    base: (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, ""),
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  };
}
function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}
const SELECT = [
  "id","title","description","company_name","employment_type","salary_min","salary_max","salary_period",
  "currency_code","country_code","state_code","city","county","borough","neighborhood","postal_code",
  "status","published_at","updated_at","expires_at","moderation_hold","contact_method","contact_value",
  "contact_public","application_url","source_key","source_published_at"
].join(",");

async function getJob(id: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase server configuration missing");
  const url = new URL(`${base}/rest/v1/job_listings`);
  url.searchParams.set("select", SELECT);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.open");
  url.searchParams.set("moderation_hold", "eq.false");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: headers(key), cache: "no-store" });
  if (!response.ok) throw new Error(`job_listings ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
function publicAction(job: any) {
  const value = clean(job.contact_value);
  if (job.contact_public && job.contact_method === "phone" && value) {
    const phone = value.replace(/[^+\d]/g, "");
    return phone ? { label: "拨打招聘方电话", href: `tel:${phone}` } : null;
  }
  if (job.contact_public && job.contact_method === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { label: "发送求职邮件", href: `mailto:${value}` };
  }
  const apply = clean(job.application_url);
  if (OFFICIAL_APPLY_SOURCE.test(clean(job.source_key)) && /^https?:\/\//i.test(apply)) {
    return { label: "前往雇主官网申请", href: apply };
  }
  return null;
}
function eligible(job: any): boolean {
  const expires = new Date(String(job.expires_at || "")).getTime();
  return Boolean(
    clean(job.company_name) &&
    clean(job.description).length >= MIN_DESCRIPTION &&
    iso(job.published_at || job.source_published_at) &&
    Number.isFinite(expires) && expires > Date.now() &&
    clean(job.title) && clean(job.city) && clean(job.state_code) &&
    publicAction(job)
  );
}
function employmentType(value: unknown): string | undefined {
  return ({
    full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR",
    temporary: "TEMPORARY", internship: "INTERN", volunteer: "VOLUNTEER"
  } as Record<string, string>)[clean(value)];
}
function salarySchema(job: any) {
  const min = Number(job.salary_min);
  const max = Number(job.salary_max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return undefined;
  const unit = ({ hour: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR" } as Record<string,string>)[clean(job.salary_period)];
  if (!unit) return undefined;
  const value: any = { "@type": "QuantitativeValue", unitText: unit };
  if (Number.isFinite(min)) value.minValue = min;
  if (Number.isFinite(max)) value.maxValue = max;
  if (!Number.isFinite(min) && Number.isFinite(max)) value.value = max;
  return { "@type": "MonetaryAmount", currency: clean(job.currency_code) || "USD", value };
}
function schemaFor(job: any, canonical: string) {
  const description = `<p>${esc(clean(job.description))}</p>`;
  const schema: any = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "@id": `${canonical}#job`,
    title: clean(job.title),
    description,
    identifier: { "@type": "PropertyValue", name: "华人工作网", value: clean(job.id) },
    datePosted: iso(job.source_published_at || job.published_at),
    validThrough: iso(job.expires_at),
    directApply: true,
    hiringOrganization: { "@type": "Organization", name: clean(job.company_name) },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: clean(job.city),
        addressRegion: clean(job.state_code),
        postalCode: clean(job.postal_code) || undefined,
        addressCountry: clean(job.country_code) || "US"
      }
    },
    url: canonical
  };
  const type = employmentType(job.employment_type);
  const salary = salarySchema(job);
  if (type) schema.employmentType = type;
  if (salary) schema.baseSalary = salary;
  return schema;
}
function page(job: any, canonical: string, indexable: boolean) {
  const title = clean(job.title);
  const company = clean(job.company_name);
  const description = clean(job.description);
  const place = [job.neighborhood, job.borough || job.county, job.city, job.state_code].map(clean).filter(Boolean).join(" · ");
  const action = publicAction(job);
  const robots = indexable
    ? "index,follow,max-image-preview:large,max-snippet:-1"
    : "noindex,follow,noarchive";
  const schema = indexable ? `<script type="application/ld+json" data-hg-jobposting>${escJson(schemaFor(job, canonical))}</script>` : "";
  const expired = new Date(String(job.expires_at || "")).getTime() <= Date.now();
  return `<!doctype html>
<html lang="zh-Hans"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}｜${esc(company || "华人工作网")}</title>
<meta name="description" content="${esc(`${title}｜${company}｜${place}。查看职位要求并直接联系招聘方。`.slice(0,180))}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<meta property="og:type" content="website"><meta property="og:site_name" content="华人工作网">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0,160))}">
<meta property="og:url" content="${esc(canonical)}">
${schema}
<style>body{margin:0;background:#f7faff;color:#0b172a;font-family:system-ui,"Noto Sans SC","Microsoft YaHei",sans-serif}.bar{background:#fff;border-bottom:1px solid #dce6f2}.bar div,.wrap{max-width:900px;margin:auto;padding:18px}.bar a{color:#1769d2;text-decoration:none;font-weight:800}.card{margin-top:28px;background:#fff;border:1px solid #dce6f2;border-radius:16px;padding:26px;box-shadow:0 8px 30px rgba(15,42,77,.06)}h1{font-size:clamp(28px,5vw,42px);line-height:1.25;margin:5px 0 12px}.company{font-size:18px;font-weight:800;color:#1769d2}.meta{color:#64748b;margin:10px 0 22px}.description{white-space:pre-wrap;line-height:1.8}.apply{display:inline-block;margin-top:24px;background:#1769d2;color:#fff;text-decoration:none;font-weight:850;padding:12px 18px;border-radius:10px}.note{margin-top:25px;padding:13px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412}</style>
</head><body>
<header class="bar"><div><a href="/">华人工作网</a> · <a href="/#latest-jobs">返回最新招聘</a></div></header>
<main class="wrap"><article class="card">
<div class="company">${esc(company || "招聘方未公开名称")}</div><h1>${esc(title)}</h1>
<div class="meta">${esc(place || "美国")} · 发布于 ${esc(iso(job.source_published_at || job.published_at).slice(0,10))}</div>
<div class="description">${esc(description)}</div>
${action ? `<a class="apply" href="${esc(action.href)}" rel="nofollow noopener">${esc(action.label)}</a>` : ""}
${expired ? '<div class="note">该职位已过有效期，不再接受申请。</div>' : '<div class="note">联系前请核实雇主身份、工作地点、薪资和用工条件；不要向陌生人提供银行卡密码或验证码。</div>'}
</article></main></body></html>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== "huarengongzuo.com") return context.next();
  const id = clean(url.searchParams.get("id"));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return context.next();
  try {
    const job = await getJob(id);
    if (!job) return context.next();
    const canonical = `${SITE}/jobs/listing.html?id=${encodeURIComponent(id)}`;
    const indexable = eligible(job);
    const html = page(job, canonical, indexable);
    const responseHeaders = new Headers({
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "link": `<${canonical}>; rel="canonical"`,
      "x-hg-job-prerender": indexable ? "google-jobs-v1" : "public-noindex-v1"
    });
    if (!indexable) responseHeaders.set("x-robots-tag", "noindex, follow");
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error("Huaren Gongzuo job prerender failed", error);
    return context.next();
  }
};

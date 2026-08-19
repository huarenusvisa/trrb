const SITE = "https://trrb.net";
const REQUIRED_ANALYSIS = ["chineseTitle", "summary", "legalIssue", "holdingOrRule", "impact", "sourceGrounding", "disclaimer"];

export const config = { path: "/legal/detail.html" };

const SOURCE_LABELS: Record<string,string> = {
  SCOTUS: "美国最高法院",
  US_CIRCUIT: "联邦巡回上诉法院",
  BIA: "BIA先例裁决",
  WHITE_HOUSE: "白宫行政命令",
  FEDERAL_REGISTER: "Federal Register"
};

function clean(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
function esc(value: unknown): string {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
function dateOnly(value: unknown): string {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? clean(value) : d.toISOString().slice(0,10);
}
function titleOf(record: any, analysis: any): string {
  return clean(analysis?.chineseTitle) || clean(record?.title) || clean(record?.citation) || clean(record?.docket) || `${SOURCE_LABELS[clean(record?.sourceSystem)] || clean(record?.sourceSystem) || "美国法律"}资料`;
}
function analysisComplete(analysis: any, datasetVersion: unknown): boolean {
  return Boolean(analysis) &&
    REQUIRED_ANALYSIS.every((field) => clean(analysis?.[field])) &&
    clean(analysis?.datasetVersion) === clean(datasetVersion) &&
    clean(analysis?.disclaimer).includes("不构成法律意见");
}
async function jsonFrom(request: Request, pathname: string): Promise<any> {
  const url = new URL(pathname, request.url);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${pathname} ${response.status}`);
  return response.json();
}
function noindex(status: number, message: string, marker: string): Response {
  return new Response(`<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow,noarchive"><title>${esc(message)}｜唐人日报</title></head><body><main><h1>${esc(message)}</h1><p><a href="/legal/">返回美国判例与新规</a></p></main></body></html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, follow, noarchive",
      "x-trrb-legal-detail-prerender": marker
    }
  });
}
function stripSeo(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/i, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>/i, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, "")
    .replace(/<script\s+[^>]*id=["']legal-detail-jsonld["'][^>]*>[\s\S]*?<\/script>/i, "");
}
function detailBody(record: any, analysis: any): string {
  const source = SOURCE_LABELS[clean(record.sourceSystem)] || clean(record.sourceSystem) || "官方资料";
  const title = titleOf(record, analysis);
  const authority = clean(record.authorityType) || "法律资料";
  const issuer = clean(record.issuingBody) || source;
  const published = dateOnly(record.publicationDate) || "日期未提取";
  const fields: Array<[string,string]> = [
    ["来源系统", source], ["发布机构", issuer], ["资料类型", authority], ["发布日期", published],
    ["案号", clean(record.docket)], ["正式引证", clean(record.citation)], ["管辖范围", clean(record.jurisdiction)],
    ["先例状态", clean(record.precedentialStatus)], ["来源键", clean(record.sourceKey)]
  ];
  const official: string[] = [];
  if (clean(record.officialUrl)) official.push(`<a class="primary" href="${esc(record.officialUrl)}" target="_blank" rel="noopener noreferrer">打开官方原文</a>`);
  if (clean(record.officialPdfUrl) && clean(record.officialPdfUrl) !== clean(record.officialUrl)) official.push(`<a href="${esc(record.officialPdfUrl)}" target="_blank" rel="noopener noreferrer">打开官方PDF</a>`);
  return `<article id="detail-record" class="detail-record" data-trrb-legal-prerender="edge">
      <div class="legal-card-top"><span class="badge">${esc(source)}</span><span class="badge kind">${esc(authority)}</span></div>
      <h1 id="detail-title">${esc(title)}</h1>
      <div class="meta detail-meta" id="detail-meta"><span>${esc(issuer)}</span><span>${esc(published)}</span>${clean(record.docket)?`<span>案号 ${esc(record.docket)}</span>`:""}${clean(record.citation)?`<span>${esc(record.citation)}</span>`:""}</div>
      <section class="detail-panel" aria-labelledby="detail-summary-title"><h2 id="detail-summary-title">中文信息整理</h2><div id="detail-analysis">
        <h3>${esc(analysis.chineseTitle)}</h3><p><strong>要旨：</strong>${esc(analysis.summary)}</p><p><strong>法律问题：</strong>${esc(analysis.legalIssue)}</p><p><strong>裁判/规则：</strong>${esc(analysis.holdingOrRule)}</p><p><strong>影响范围：</strong>${esc(analysis.impact)}</p><p><strong>来源核验：</strong>${esc(analysis.sourceGrounding)}</p><p class="muted">${esc(analysis.disclaimer)}</p>
      </div></section>
      <section class="detail-panel detail-fields" aria-labelledby="detail-fields-title"><h2 id="detail-fields-title">官方资料信息</h2><dl id="detail-fields-list">${fields.filter(([,value])=>value).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></section>
      <section class="detail-panel" id="detail-related" aria-labelledby="detail-related-title"><h2 id="detail-related-title">相关判例 / 同机构规则</h2><p class="muted">浏览器加载后将从当前统一法律数据库计算相关官方记录。</p><div id="detail-related-list" class="legal-list"></div></section>
      <section class="official-layer" aria-labelledby="official-layer-title"><div><p class="eyebrow">OFFICIAL SOURCE</p><h2 id="official-layer-title">法院 / 政府官方原文</h2><p>唐人日报不改写官方法律文本。涉及法律效力、引用、期限或个案判断时，请以官方原文及后续裁判、规则为准。</p></div><div class="card-actions" id="detail-official-actions">${official.join("") || '<span class="muted">当前记录没有可用的官方原文链接。</span>'}</div></section>
      <p class="detail-disclaimer">${esc(analysis.disclaimer)}</p>
    </article>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"));
  if (!id) return context.next();

  try {
    const [db, ai] = await Promise.all([
      jsonFrom(request, "/data/legal/unified-legal-authorities-latest.json"),
      jsonFrom(request, "/data/legal/legal-ai-analysis-latest.json")
    ]);
    if (clean(ai?.datasetVersion) !== clean(db?.datasetVersion)) return noindex(503, "法律资料正在同步，请稍后重试", "dataset-version-mismatch");
    const records = Array.isArray(db?.records) ? db.records : [];
    const analyses = Array.isArray(ai?.analyses) ? ai.analyses : [];
    const record = records.find((item: any) => clean(item?.id) === id);
    if (!record) return noindex(404, "这条法律资料不存在或已停止公开", "record-not-found");
    const analysis = analyses.find((item: any) => clean(item?.recordId) === id);
    if (!analysisComplete(analysis, db?.datasetVersion)) return noindex(503, "法律资料正在完成中文校验，请稍后重试", "analysis-not-ready");

    const upstream = await context.next();
    if (!upstream.ok) return upstream;
    const contentType = upstream.headers.get("content-type") || "";
    if (!/text\/html/i.test(contentType)) return upstream;
    let html = await upstream.text();
    const title = titleOf(record, analysis);
    const canonical = `${SITE}/legal/detail.html?id=${encodeURIComponent(id)}`;
    const description = clean(analysis.summary).slice(0,180);
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": canonical,
      name: title,
      url: canonical,
      description,
      inLanguage: "zh-Hans",
      isPartOf: { "@type": "CollectionPage", name: "美国判例与新规", url: `${SITE}/legal/` },
      about: {
        "@type": "CreativeWork",
        name: clean(record.title) || title,
        identifier: clean(record.citation) || clean(record.docket) || clean(record.sourceKey) || id,
        url: clean(record.officialUrl) || canonical,
        datePublished: clean(record.publicationDate) || undefined,
        publisher: clean(record.issuingBody) ? { "@type": "Organization", name: clean(record.issuingBody) } : undefined
      }
    };
    const seo = `<title>${esc(title)}｜美国判例与新规｜唐人日报</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${esc(canonical)}"><script type="application/ld+json" id="legal-detail-jsonld">${escJson(schema)}</script>`;
    html = stripSeo(html)
      .replace(/<\/head>/i, `${seo}</head>`)
      .replace(/<section id="detail-status"[\s\S]*?<\/section>/i, '<section id="detail-status" class="detail-status" hidden></section>')
      .replace(/<article id="detail-record"[\s\S]*?<\/article>/i, detailBody(record, analysis));

    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
    headers.set("link", `<${canonical}>; rel=\"canonical\"`);
    headers.delete("x-robots-tag");
    headers.set("x-trrb-legal-detail-prerender", "legal-edge-v1");
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
  } catch (error) {
    console.error("legal detail prerender failed", error);
    return noindex(503, "法律资料暂时无法加载，请稍后重试", "edge-error");
  }
};

import { immigrationCategory, immigrationTopic } from "./_shared/immigration-knowledge-routes.ts";

const SITE = "https://trrb.net";
const DEFAULT_IMAGE = `${SITE}/trrb-logo-cropped.webp`;

export const config = {
  path: [
    "/", "/index.html",
    "/listing", "/listing.html",
    "/important-news", "/hot-headlines", "/us-politics", "/us-crime", "/china-officialdom", "/immigration", "/asylum",
    "/uscis", "/dhs", "/cbp", "/visa", "/china", "/politics", "/world",
    "/expose", "/expose.html",
    "/immigrate", "/immigrate/", "/immigrate/index.html",
    "/immigrate/center", "/immigrate/center.html",
    "/trump", "/trump/", "/trump/index.html",
    "/ice/news", "/ice/news/"
  ]
};

type Seo = {
  title: string;
  description: string;
  canonical: string;
  robots?: string;
  image?: string;
};

const CATEGORY_SLUGS: Record<string, string> = {
  "重要新闻": "important-news",
  "热门头条": "hot-headlines",
  "美国时政": "us-politics",
  "美国警情": "us-crime",
  "中国官场": "china-officialdom",
  "移民美国": "immigration",
  "庇护百科": "asylum",
  "USCIS": "uscis",
  "DHS": "dhs",
  "CBP": "cbp",
  "Visa": "visa",
  "China": "china",
  "Politics": "politics",
  "World": "world"
};

const CATEGORY_NAMES_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([name, slug]) => [slug, name])
);

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  "热门头条": "中国热门头条"
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categorySeo(category: string, slug: string, page = 1): Seo {
  const displayCategory = CATEGORY_DISPLAY_NAMES[category] || category;
  const baseCanonical = `${SITE}/${slug}`;
  const canonical = page > 1 ? `${baseCanonical}?page=${page}` : baseCanonical;
  return {
    title: `${displayCategory}新闻${page > 1 ? ` 第${page}页` : ""} - 唐人日报`,
    description: category === "热门头条" ? "唐人日报中国热门头条，只汇集中国大陆社会、民生、公共事件与网络热点。" : `唐人日报${displayCategory}栏目，持续更新相关新闻、政策变化、重要事件、背景信息与后续进展，为华人读者提供清晰及时的新闻汇总。`,
    canonical
  };
}

function listingSeo(url: URL): Seo {
  if (url.pathname === "/ice/news" || url.pathname === "/ice/news/") {
    return {
      title: "ICE执法动态新闻 - 唐人日报",
      description: "唐人日报ICE执法动态新闻，持续更新美国移民与海关执法局相关抓捕、拘留、遣返、执法行动及政策变化。",
      canonical: `${SITE}/ice/news`
    };
  }

  const category = String(url.searchParams.get("category") || "").trim();
  const query = String(url.searchParams.get("q") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);

  if (query || type === "search") {
    return {
      title: query ? `搜索：${query} - 唐人日报` : "新闻搜索 - 唐人日报",
      description: query
        ? `唐人日报站内搜索结果：${query}。汇总相关最新新闻、政策变化、背景信息与后续报道，方便读者快速查找相关内容。`
        : "唐人日报站内新闻搜索，查找已发布新闻、政策变化、背景信息、专题内容与后续报道。",
      canonical: `${SITE}/listing`,
      robots: "noindex,follow,noarchive"
    };
  }

  if (!category) {
    return {
      title: "文章列表 - 唐人日报",
      description: "唐人日报文章列表，汇总美国时政、移民、社会、警情、中国新闻及专题报道。",
      canonical: `${SITE}/listing`,
      robots: "noindex,follow,noarchive"
    };
  }

  const slug = CATEGORY_SLUGS[category];
  if (slug) return categorySeo(category, slug, page);
  return {
    title: "未开放栏目 - 唐人日报",
    description: "该栏目不是唐人日报当前公开索引栏目，请通过正式栏目导航浏览已发布内容。",
    canonical: `${SITE}/listing`,
    robots: "noindex,follow,noarchive"
  };
}

function immigrationCenterSeo(url: URL): Seo {
  const requestedPath = String(url.searchParams.get("path") || "").trim();
  const category = immigrationCategory(requestedPath);
  if (!category) {
    return {
      title: "移民美国知识库 - 唐人日报",
      description: "唐人日报移民美国知识库，按赴美留学、赴美工作、职业移民、家庭移民、人道主义庇护、境内身份转换和入籍美国公民分类整理。",
      canonical: `${SITE}/immigrate/`,
      robots: "noindex,follow,noarchive"
    };
  }

  const requestedTopic = String(url.searchParams.get("topic") || "").trim();
  const topic = requestedTopic ? immigrationTopic(category, requestedTopic) : null;
  if (requestedTopic && !topic) {
    return {
      title: `${category.name}完整指南｜美国移民知识中心 - 唐人日报`,
      description: category.description,
      canonical: `${SITE}/immigrate/center?path=${encodeURIComponent(category.slug)}`,
      robots: "noindex,follow,noarchive"
    };
  }

  if (topic) {
    return {
      title: `${topic.name}完整指南｜${category.name}知识中心 - 唐人日报`,
      description: `${topic.name}。${category.description}系统整理申请资格、办理流程、材料准备、时间节点、常见风险与相关文章。`.slice(0, 180),
      canonical: `${SITE}/immigrate/center?path=${encodeURIComponent(category.slug)}&topic=${encodeURIComponent(topic.slug)}`
    };
  }

  return {
    title: `${category.name}完整指南｜美国移民知识中心 - 唐人日报`,
    description: category.description,
    canonical: `${SITE}/immigrate/center?path=${encodeURIComponent(category.slug)}`
  };
}

function routeSeo(url: URL): Seo | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") {
    return {
      title: "唐人日报 Tang Ren Daily - 中美新闻实时播报",
      description: "唐人日报立足美国，服务华人，聚焦美国时政、移民新闻、中国官场、美国警情、ICE执法动态、庇护百科等内容。",
      canonical: `${SITE}/`
    };
  }
  if (path === "/listing" || path === "/listing.html" || path === "/ice/news") return listingSeo(url);

  const categorySlug = path.replace(/^\//, "");
  const categoryName = CATEGORY_NAMES_BY_SLUG[categorySlug];
  if (categoryName) {
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    return categorySeo(categoryName, categorySlug, page);
  }

  if (path === "/expose" || path === "/expose.html") {
    return {
      title: "曝光墙投稿 - 唐人日报",
      description: "向唐人日报提交曝光材料，支持文字、图片和视频。可匿名公开，但必须留下电话或邮箱供编辑核实。",
      canonical: `${SITE}/expose`,
      robots: "noindex,follow,noarchive"
    };
  }
  if (path === "/immigrate" || path === "/immigrate/index.html") {
    return {
      title: "移民美国知识库 - 唐人日报",
      description: "唐人日报移民美国知识库，按赴美留学、赴美工作、职业移民、家庭移民、人道主义庇护、境内身份转换和入籍美国公民分类整理。",
      canonical: `${SITE}/immigrate/`
    };
  }
  if (path === "/immigrate/center" || path === "/immigrate/center.html") return immigrationCenterSeo(url);
  if (path === "/trump" || path === "/trump/index.html") {
    return {
      title: "特朗普本人实时动态｜唐人日报",
      description: "实时聚合特朗普本人公开讲话、政策决定、会见访问、竞选活动和社交平台发言，不收录其子女及家族成员新闻。",
      canonical: `${SITE}/trump`
    };
  }
  return null;
}

function stripSeo(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "");
}

function injectSeo(html: string, seo: Seo): string {
  const image = seo.image || DEFAULT_IMAGE;
  const robots = seo.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const tags = `
    <title>${esc(seo.title)}</title>
    <meta name="description" content="${esc(seo.description)}" />
    <meta name="robots" content="${esc(robots)}" />
    <link rel="canonical" href="${esc(seo.canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="唐人日报" />
    <meta property="og:title" content="${esc(seo.title)}" />
    <meta property="og:description" content="${esc(seo.description)}" />
    <meta property="og:url" content="${esc(seo.canonical)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(seo.title)}" />
    <meta name="twitter:description" content="${esc(seo.description)}" />
    <meta name="twitter:image" content="${esc(image)}" />`;
  return stripSeo(html).replace(/<\/head>/i, `${tags}\n  </head>`);
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const seo = routeSeo(url);
  if (!seo) return context.next();

  try {
    const upstream = await context.next();
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !/text\/html/i.test(contentType)) return upstream;
    const html = await upstream.text();
    const body = injectSeo(html, seo);
    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    headers.set("link", `<${seo.canonical}>; rel=\"canonical\"`);
    headers.set("x-trrb-seo-route-meta", "round10-v7-shared-immigration-routes");
    if (/^noindex/i.test(seo.robots || "")) headers.set("x-robots-tag", seo.robots || "noindex,follow");
    else headers.delete("x-robots-tag");
    return new Response(request.method === "HEAD" ? null : body, { status: upstream.status, headers });
  } catch (error) {
    console.error("seo route meta failed", error);
    return context.next();
  }
};

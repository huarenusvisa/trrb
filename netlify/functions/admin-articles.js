const {
  safeText,
  rest,
  authenticateAdmin
} = require("./_shared/supabase-admin");
const {
  makeSlug,
  generateSummary,
  generateSeoKeywords
} = require("./_shared/article-seo");
const {
  suggestTitles,
  uploadManualCover,
  generateCover
} = require("./_shared/article-ai");

const ALLOWED_STATUS = new Set(["draft", "published", "hidden"]);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function listArticles() {
  const rows = await rest("articles", {
    query: {
      select: "id,title,category_name,status,published_at,created_at,cover_image,summary,metadata",
      order: "created_at.desc",
      limit: "100"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function updateStatus(input) {
  const id = safeText(input.article_id, 100);
  const status = safeText(input.status, 30);
  if (!id || !ALLOWED_STATUS.has(status)) {
    const error = new Error("文章ID或状态无效");
    error.statusCode = 400;
    throw error;
  }
  const patch = { status };
  if (status === "published") patch.published_at = nowIso();
  const rows = await rest("articles", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function validateExternalCover(value) {
  const url = safeText(value, 2000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    const error = new Error("封面图片链接格式无效");
    error.statusCode = 400;
    throw error;
  }
}

async function saveArticle(input, actor) {
  const title = safeText(input.title, 220);
  const content = safeText(input.content, 50000);
  const categoryId = safeText(input.category_id, 100) || null;
  const categoryName = safeText(input.category_name, 80) || "重要新闻";
  const requestedStatus = safeText(input.status, 30) || "draft";
  const author = safeText(input.author, 120) || "Tang Ren Daily";
  const autoAiCover = Boolean(input.auto_ai_cover);

  if (title.length < 5) {
    const error = new Error("标题至少需要5个字");
    error.statusCode = 400;
    throw error;
  }
  if (content.length < 30) {
    const error = new Error("正文至少需要30个字");
    error.statusCode = 400;
    throw error;
  }
  if (!ALLOWED_STATUS.has(requestedStatus)) {
    const error = new Error("文章状态无效");
    error.statusCode = 400;
    throw error;
  }

  const summary = generateSummary(content, title);
  const seoKeywords = generateSeoKeywords(title, categoryName, content);
  const coverImage = validateExternalCover(input.cover_image);
  const needsBackgroundCover = requestedStatus === "published" && !coverImage && autoAiCover;
  const storedStatus = needsBackgroundCover ? "draft" : requestedStatus;
  const time = nowIso();

  const payload = {
    title,
    slug: makeSlug(title),
    summary,
    content,
    category_id: categoryId,
    category_name: categoryName,
    cover_image: coverImage,
    seo_keywords: seoKeywords,
    author,
    status: storedStatus,
    published_at: storedStatus === "published" ? time : null,
    created_at: time,
    metadata: {
      publisher_version: "admin-publisher-v2",
      seo_automatic: true,
      summary_automatic: true,
      ai_cover_requested: autoAiCover,
      ai_cover_generated: false,
      ai_cover_processing: needsBackgroundCover,
      requested_status: requestedStatus,
      published_by: actor.user.email || actor.admin.email || ""
    }
  };

  const rows = await rest("articles", {
    method: "POST",
    body: payload,
    prefer: "return=representation"
  });
  const article = Array.isArray(rows) ? rows[0] : rows;
  if (!article?.id) throw new Error("文章写入成功，但数据库没有返回文章ID");

  return {
    article,
    seo_keywords: seoKeywords,
    summary,
    cover_image: coverImage,
    ai_cover_generated: false,
    background_required: needsBackgroundCover,
    background_article_id: needsBackgroundCover ? String(article.id) : null
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const actor = await authenticateAdmin(event);
    const input = JSON.parse(event.body || "{}");
    const action = safeText(input.action, 60);

    if (action === "list") return json(200, { articles: await listArticles() });
    if (action === "status") return json(200, { article: await updateStatus(input) });
    if (action === "suggest_titles") return json(200, { titles: await suggestTitles(input) });
    if (action === "upload_cover") return json(200, { url: await uploadManualCover(input) });
    if (action === "generate_cover") return json(200, { url: await generateCover(input), ai_generated: true });
    if (action === "save_article") return json(200, await saveArticle(input, actor));
    return json(400, { error: "未知操作" });
  } catch (error) {
    console.error("Admin article API error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

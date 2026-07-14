const {
  safeText,
  rest,
  authenticateAdmin
} = require("./_shared/supabase-admin");
const { generateCover } = require("./_shared/article-ai");
const { generateSummary } = require("./_shared/article-seo");

function nowIso() {
  return new Date().toISOString();
}

async function getArticle(id) {
  const rows = await rest("articles", {
    query: {
      select: "id,title,summary,content,category_name,cover_image,status,metadata",
      id: `eq.${id}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchArticle(id, patch) {
  const rows = await rest("articles", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

exports.handler = async (event) => {
  let articleId = "";
  try {
    await authenticateAdmin(event);
    const input = JSON.parse(event.body || "{}");
    articleId = safeText(input.article_id, 100);
    if (!articleId) throw new Error("缺少文章ID");

    const article = await getArticle(articleId);
    if (!article) throw new Error("没有找到待生成封面的文章");

    const metadata = article.metadata && typeof article.metadata === "object" ? article.metadata : {};
    if (article.status === "published" && article.cover_image) return;
    if (!metadata.ai_cover_processing && metadata.requested_status !== "published") {
      throw new Error("这篇文章没有等待AI封面发布");
    }

    const summary = safeText(article.summary, 600) || generateSummary(article.content, article.title);
    const coverImage = await generateCover({
      title: article.title,
      category_name: article.category_name,
      summary,
      content: article.content
    });

    await patchArticle(articleId, {
      cover_image: coverImage,
      status: "published",
      published_at: nowIso(),
      metadata: {
        ...metadata,
        ai_cover_processing: false,
        ai_cover_generated: true,
        ai_cover_generated_at: nowIso(),
        ai_cover_error: null,
        requested_status: "published"
      }
    });
  } catch (error) {
    console.error("Background AI article publication failed:", error);
    if (articleId) {
      try {
        const article = await getArticle(articleId);
        const metadata = article?.metadata && typeof article.metadata === "object" ? article.metadata : {};
        await patchArticle(articleId, {
          status: "draft",
          metadata: {
            ...metadata,
            ai_cover_processing: false,
            ai_cover_generated: false,
            ai_cover_error: safeText(error.message || String(error), 1000),
            ai_cover_failed_at: nowIso(),
            requested_status: "published"
          }
        });
      } catch (patchError) {
        console.error("Unable to record AI cover failure:", patchError);
      }
    }
    throw error;
  }
};

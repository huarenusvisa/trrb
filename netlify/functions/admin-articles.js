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
const { isIceEnforcementText } = require("./_shared/ice-enforcement");
const { isUsImmigrationText } = require("./_shared/us-immigration-category");
const { CHINA_HOT_CATEGORY, isChinaHotCategory, isChinaHotHeadline } = require("./_shared/china-hot-headlines");

const ALLOWED_STATUS = new Set(["draft", "published", "hidden"]);
const ICE_CATEGORIES = new Set(["ICE执法动态", "ICE执法", "驱逐快报"]);
const IMMIGRATION_CATEGORY = "移民美国";

const IMMIGRATION_PROCESS_TERMS = [
  "签证", "绿卡", "入籍", "公民申请", "移民申请", "移民签证", "身份转换", "调整身份", "排期", "签证公告",
  "移民局", "移民法庭", "移民法官", "赴美", "入境美国", "庇护", "临时保护身份",
  "uscis", "美国公民及移民服务局", "nvc", "领事馆面签", "移民签证",
  "f-1", "f1学生", "j-1", "m-1", "cpt", "opt", "stem opt", "i-20", "sevis",
  "h-1b", "l-1", "o-1", "h-2a", "h-2b", "tn签证", "e-1", "e-2", "r-1",
  "eb-1", "eb1", "eb-2", "eb2", "niw", "perm", "eb-3", "eb3", "eb-4", "eb4", "eb-5", "eb5",
  "婚姻绿卡", "婚绿", "f2a", "k-1", "cr-1", "ir-1", "i-130", "i-485", "i-864", "ds-260",
  "政治庇护", "庇护申请", "庇护面谈", "庇护时钟", "i-589", "vawa", "u签证", "t签证", "sijs", "tps",
  "n-400", "n400", "n-600", "n600", "工卡", "ead", "advance parole", "回美证"
];

const GENERAL_CRIME_TERMS = [
  "警方", "警察", "警局", "枪击", "刺伤", "命案", "抢劫", "盗窃", "诈骗", "纵火",
  "酒驾", "醉驾", "肇事", "刑事指控", "嫌疑人", "法院判刑"
];

const US_POLITICS_TERMS = [
  "白宫", "国会", "参议院", "众议院", "总统", "州长", "行政命令", "最高法院",
  "上诉法院", "联邦法院", "法案", "听证会", "政府政策"
];

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

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

// Category must be established by the headline and opening lead, not by incidental
// words buried later in the article.
function normalizedArticleText(title, content) {
  return `${String(title || "")} ${String(content || "").slice(0, 1200)}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(String(term).toLowerCase()));
}

function enforceImmigrationCategory(title, content, categoryName) {
  if (categoryName !== IMMIGRATION_CATEGORY) {
    return { categoryName, corrected: false, reason: "" };
  }

  const text = normalizedArticleText(title, content);
  if (isIceEnforcementText(title, String(content || "").slice(0, 1200))) {
    return { categoryName: "ICE执法动态", corrected: true, reason: "immigration-enforcement" };
  }
  if (isUsImmigrationText(title, String(content || "").slice(0, 1200))) {
    return { categoryName: IMMIGRATION_CATEGORY, corrected: false, reason: "immigration-to-us" };
  }
  if (containsAny(text, GENERAL_CRIME_TERMS)) {
    return { categoryName: "美国警情", corrected: true, reason: "general-crime" };
  }
  if (containsAny(text, US_POLITICS_TERMS)) {
    return { categoryName: "美国时政", corrected: true, reason: "us-politics" };
  }

  const error = new Error("该稿不属于“移民美国”。该栏目只收录赴美签证、绿卡、入籍、庇护申请及美国移民办理政策；ICE抓捕、拘留、遣返和边境执法请发布到“ICE执法动态”。");
  error.statusCode = 400;
  throw error;
}

function enforceChinaHotCategory(title, content, categoryName) {
  if (!isChinaHotCategory(categoryName)) return;
  if (isChinaHotHeadline(title, content)) return;
  const error = new Error("该稿不属于“中国热门头条”。该栏目只收录以中国大陆事件、地点、机构或社会议题为主体的新闻；美国新闻请发布到美国时政或美国警情。");
  error.statusCode = 400;
  throw error;
}

async function assertNoPublishedDuplicate(title, excludeId = "") {
  const wanted = normalizeTitle(title);
  if (wanted.length < 8) return;
  const rows = await rest("articles", {
    query: {
      select: "id,title,published_at,status",
      status: "eq.published",
      order: "published_at.desc.nullslast,created_at.desc",
      limit: "500"
    }
  });
  const duplicate = (Array.isArray(rows) ? rows : []).find((row) =>
    String(row?.id || "") !== String(excludeId || "") && normalizeTitle(row?.title) === wanted
  );
  if (duplicate) {
    const error = new Error(`检测到重复稿：已有已发布文章「${duplicate.title}」`);
    error.statusCode = 409;
    error.existingArticleId = duplicate.id;
    throw error;
  }
}

async function listArticles() {
  const rows = await rest("articles", {
    query: {
      select: "id,title,category_name,status,published_at,created_at,cover_image,summary,metadata",
      order: "created_at.desc",
      // Automated source intake can add more than 100 review drafts in one
      // collection window. Keep them visible in the content center instead of
      // silently dropping older pending items from the administrator list.
      limit: "500"
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

  if (status === "published") {
    const existing = await rest("articles", {
      query: { select: "id,title", id: `eq.${id}`, limit: "1" }
    });
    const article = Array.isArray(existing) ? existing[0] : null;
    if (!article?.title) {
      const error = new Error("找不到待发布文章");
      error.statusCode = 404;
      throw error;
    }
    await assertNoPublishedDuplicate(article.title, id);
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
  let categoryId = safeText(input.category_id, 100) || null;
  let categoryName = safeText(input.category_name, 80) || "美国时政";
  const requestedStatus = safeText(input.status, 30) || "draft";
  const author = safeText(input.author, 120) || "Tang Ren Daily";
  const autoAiCover = Boolean(input.auto_ai_cover);
  const categoryPolicy = enforceImmigrationCategory(title, content, categoryName);
  categoryName = categoryPolicy.categoryName;
  enforceChinaHotCategory(title, content, categoryName);
  if (isChinaHotCategory(categoryName)) categoryName = CHINA_HOT_CATEGORY;
  if (categoryPolicy.corrected) categoryId = null;
  const isIceBrief = ICE_CATEGORIES.has(categoryName);

  if (title.length < 5) {
    const error = new Error("标题至少需要5个字");
    error.statusCode = 400;
    throw error;
  }
  if (!content.trim()) {
    const error = new Error("正文不能为空");
    error.statusCode = 400;
    throw error;
  }
  if (!isIceBrief && content.length < 30) {
    const error = new Error("普通文章正文至少需要30个字；ICE执法快讯不以篇幅作为发布门槛");
    error.statusCode = 400;
    throw error;
  }
  if (!ALLOWED_STATUS.has(requestedStatus)) {
    const error = new Error("文章状态无效");
    error.statusCode = 400;
    throw error;
  }
  if (requestedStatus === "published") await assertNoPublishedDuplicate(title);

  const summary = generateSummary(content, title);
  const seoKeywords = generateSeoKeywords(title, categoryName, content);
  const coverImage = validateExternalCover(input.cover_image);
  // A cover is optional. Publishing must never wait for image generation.
  const storedStatus = requestedStatus;
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
      ai_cover_processing: false,
      requested_status: requestedStatus,
      published_by: actor.user.email || actor.admin.email || "",
      ice_length_policy: isIceBrief ? "news-value-not-character-count" : undefined,
      category_policy: categoryPolicy.reason || undefined,
      category_auto_corrected: categoryPolicy.corrected || undefined
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
    background_required: false,
    background_article_id: null
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
    const payload = { error: error.message || String(error) };
    if (error.existingArticleId) payload.existing_article_id = error.existingArticleId;
    return json(error.statusCode || 500, payload);
  }
};

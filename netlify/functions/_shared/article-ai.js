const crypto = require("node:crypto");
const {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  requestJson
} = require("./supabase-admin");

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const ARTICLE_IMAGE_BUCKET = process.env.ARTICLE_IMAGE_BUCKET || "article-images";

function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text.trim();
    }
  }
  return "";
}

async function suggestTitles(input) {
  if (!OPENAI_KEY) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
  const content = safeText(input.content, 12000);
  const category = safeText(input.category_name, 60) || "新闻";
  if (content.length < 50) {
    const error = new Error("正文至少需要50个字，才能生成标题建议");
    error.statusCode = 400;
    throw error;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title_1", "title_2", "title_3"],
    properties: {
      title_1: { type: "string" },
      title_2: { type: "string" },
      title_3: { type: "string" }
    }
  };

  const response = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "你是唐人日报资深中文新闻标题编辑。",
        "根据正文生成三个准确、清晰、互不重复的简体中文标题。",
        "标题必须概括核心事实，不得编造，不得加入正文中没有的人名、数字或结论。",
        "避免震惊、炸裂、惊天等夸张词。每个标题控制在8至36个中文字符。"
      ].join("\n"),
      input: JSON.stringify({ category, content }),
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "article_title_suggestions",
          strict: true,
          schema
        }
      }
    })
  });

  const parsed = JSON.parse(responseText(response));
  const titles = [...new Set([
    parsed?.title_1,
    parsed?.title_2,
    parsed?.title_3
  ].map((item) => safeText(item, 80)).filter(Boolean))].slice(0, 3);
  if (titles.length !== 3) throw new Error("AI没有返回三个有效标题，请重试");
  return titles;
}

async function uploadImageBytes(bytes, contentType, folder = "manual") {
  const extension = contentType === "image/webp" ? "webp" : contentType === "image/jpeg" ? "jpg" : "png";
  const now = new Date();
  const path = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(ARTICLE_IMAGE_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "false",
      "Cache-Control": "31536000"
    },
    body: bytes
  });
  if (!response.ok) throw new Error(`封面上传失败：${await response.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${ARTICLE_IMAGE_BUCKET}/${path}`;
}

async function uploadManualCover(input) {
  const base64 = String(input.data_base64 || "");
  const mime = safeText(input.mime_type, 80).toLowerCase();
  if (!["image/webp", "image/jpeg", "image/png"].includes(mime)) {
    const error = new Error("只支持 WebP、JPG 或 PNG 封面");
    error.statusCode = 400;
    throw error;
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    const error = new Error("压缩后的封面不能超过5MB");
    error.statusCode = 400;
    throw error;
  }
  return uploadImageBytes(bytes, mime, "manual");
}

async function generateCover(input) {
  if (!OPENAI_KEY) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
  const title = safeText(input.title, 220);
  const category = safeText(input.category_name, 60) || "新闻";
  const summary = safeText(input.summary, 600);
  const content = safeText(input.content, 4000);
  if (!title) throw new Error("缺少文章标题");

  const prompt = `Create a professional landscape editorial news illustration for a Chinese-language US news website, composed safely for a 16:9 crop. Category: ${category}. Headline: ${title}. Context: ${summary || content}. Serious, clean, realistic editorial illustration. No words, no logos, no watermarks, no readable documents, no fake official seals. Do not depict an identifiable real person. For crime, immigration, disaster, politics, detention or courtroom topics, create a clearly conceptual editorial illustration rather than a fabricated documentary photograph.`;
  const imageData = await requestJson("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1536x1024",
      quality: "medium"
    })
  });
  const base64 = imageData?.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI没有返回图片数据");
  return uploadImageBytes(Buffer.from(base64, "base64"), "image/png", "ai");
}

const TRANSLATION_CHUNK_SIZE = 10000;
const MAX_TRANSLATION_CHUNKS = 10;

function splitTranslationContent(value, chunkSize = TRANSLATION_CHUNK_SIZE) {
  const text = String(value ?? "").replace(/\u0000/g, "").trim();
  if (!text) return [];
  if (text.length > chunkSize * MAX_TRANSLATION_CHUNKS) throw new RangeError("正文超过安全分段上限");
  const chunks = [];
  let remaining = text;
  while (remaining.length > chunkSize) {
    const window = remaining.slice(0, chunkSize + 1);
    const minimum = Math.floor(chunkSize * 0.6);
    let cut = -1;
    for (let index = window.length - 1; index >= minimum; index -= 1) {
      if (/[\n。！？.!?；;]/.test(window[index])) { cut = index + 1; break; }
    }
    if (cut < 0) cut = chunkSize;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function requestTranslationChunk({ locale, title, summary, content, index, total }) {
  const target = locale === "en" ? "American English" : "Traditional Chinese used in Taiwan and Hong Kong";
  const first = index === 0;
  const properties = first
    ? { title: { type: "string" }, summary: { type: "string" }, content: { type: "string" } }
    : { content: { type: "string" } };
  const response = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        `Translate segment ${index + 1} of ${total} of this published news article into ${target}.`,
        "Preserve every fact, name, date, number, quotation, URL, paragraph break and uncertainty in this segment.",
        "Do not add analysis, background, labels or facts. Do not omit material. Return plain text only.",
        first ? "Also translate the full article title and summary supplied with the first segment." : "Return only the translated content for this segment.",
        "This is an editorial draft that must be reviewed by a human before publication."
      ].join("\n"),
      input: JSON.stringify({ ...(first ? { title, summary } : {}), content }),
      max_output_tokens: 12000,
      text: { format: { type: "json_schema", name: first ? "article_translation_first_segment" : "article_translation_segment", strict: true, schema: { type: "object", additionalProperties: false, required: Object.keys(properties), properties } } }
    })
  });
  return JSON.parse(responseText(response));
}

async function translateArticle(input) {
  if (!OPENAI_KEY) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
  const locale = input.locale === "en" ? "en" : input.locale === "zh-TW" ? "zh-TW" : "";
  const title = safeText(input.title, 500);
  const summary = safeText(input.summary, 5000);
  const content = String(input.content ?? "").replace(/\u0000/g, "").trim();
  if (!locale || !title || content.length < 20) {
    const error = new Error("缺少有效的目标语言、标题或正文");
    error.statusCode = 400;
    throw error;
  }
  let chunks;
  try { chunks = splitTranslationContent(content); }
  catch (error) { error.statusCode = 400; throw error; }
  const translated = [];
  let metadata = null;
  for (let index = 0; index < chunks.length; index += 1) {
    const part = await requestTranslationChunk({ locale, title, summary, content: chunks[index], index, total: chunks.length });
    if (index === 0) metadata = part;
    const translatedContent = safeText(part?.content, 30000);
    if (!translatedContent) throw new Error(`AI没有返回第 ${index + 1} 段翻译，请重试`);
    translated.push(translatedContent);
  }
  const translation = {
    title: safeText(metadata?.title, 500),
    summary: safeText(metadata?.summary, 5000),
    content: safeText(translated.join("\n\n"), 200000)
  };
  if (!translation.title || !translation.content) throw new Error("AI没有返回完整翻译草稿，请重试");
  return { ...translation, model: OPENAI_MODEL };
}

module.exports = { suggestTitles, uploadManualCover, generateCover, translateArticle, splitTranslationContent, TRANSLATION_CHUNK_SIZE, MAX_TRANSLATION_CHUNKS };

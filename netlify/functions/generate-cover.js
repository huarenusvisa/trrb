const crypto = require("node:crypto");
const {
  SUPABASE_URL,
  SERVICE_KEY,
  authenticateStaff
} = require("./_shared/supabase-admin");

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  try {
    await authenticateStaff(event, ["owner", "editor"]);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
    if (!SERVICE_KEY) throw new Error("Netlify 尚未设置 SUPABASE_SERVICE_ROLE_KEY");

    const input = JSON.parse(event.body || "{}");
    const title = String(input.title || "").slice(0, 220);
    const category = String(input.category || "新闻").slice(0, 40);
    const summary = String(input.summary || "").slice(0, 600);
    if (!title) {
      const error = new Error("缺少文章标题");
      error.statusCode = 400;
      throw error;
    }

    const prompt = `Create a professional 16:9 editorial news illustration for a Chinese-language US news website. Category: ${category}. Headline: ${title}. Context: ${summary}. Serious, clean, realistic editorial illustration, visually clear, restrained red/blue/neutral palette. No words, no logos, no watermarks, no readable documents, no fake official seals. Do not depict an identifiable real person unless merely symbolic. For crime, immigration, disaster, politics or detention topics, create a conceptual illustration rather than a fabricated documentary scene.`;

    const imageRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", quality: "medium" })
    });
    const imageData = await imageRes.json();
    if (!imageRes.ok) throw new Error(imageData?.error?.message || "OpenAI 图片生成失败");
    const b64 = imageData?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI 没有返回图片数据");

    const bytes = Buffer.from(b64, "base64");
    const now = new Date();
    const objectPath = `ai/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now()}-${crypto.randomUUID()}.png`;
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/article-images/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "image/png",
        "x-upsert": "false",
        "Cache-Control": "31536000"
      },
      body: bytes
    });
    if (!uploadRes.ok) throw new Error(`AI 图片上传失败：${await uploadRes.text()}`);

    const url = `${SUPABASE_URL}/storage/v1/object/public/article-images/${objectPath}`;
    return response(200, { url, aiGenerated: true });
  } catch (error) {
    console.error(error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

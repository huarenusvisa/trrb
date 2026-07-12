const SUPABASE_URL = process.env.SUPABASE_URL || "https://fwiznbpsqkfgkvyznebz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("缺少后台登录凭证");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!userRes.ok) throw new Error("后台登录凭证无效");
    const user = await userRes.json();
    if (!user?.id) throw new Error("无法验证后台用户");

    const openaiKey = process.env.OPENAI_API_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!openaiKey) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
    if (!serviceKey) throw new Error("Netlify 尚未设置 SUPABASE_SERVICE_ROLE_KEY");

    const input = JSON.parse(event.body || "{}");
    const title = String(input.title || "").slice(0, 220);
    const category = String(input.category || "新闻").slice(0, 40);
    const summary = String(input.summary || "").slice(0, 600);
    if (!title) throw new Error("缺少文章标题");
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
    const path = `ai/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${Date.now()}-${crypto.randomUUID()}.png`;
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/article-images/${path}`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "image/png", "x-upsert": "false", "Cache-Control": "31536000" },
      body: bytes
    });
    if (!uploadRes.ok) throw new Error(`AI 图片上传失败：${await uploadRes.text()}`);
    const url = `${SUPABASE_URL}/storage/v1/object/public/article-images/${path}`;
    return { statusCode: 200, headers, body: JSON.stringify({ url, aiGenerated: true }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || String(error) }) };
  }
};

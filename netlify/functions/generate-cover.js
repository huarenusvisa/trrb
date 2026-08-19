const crypto = require("node:crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fwiznbpsqkfgkvyznebz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    body: JSON.stringify(body)
  };
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function requireAdmin(event, serviceKey) {
  const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  const user = await readJson(userRes);
  if (!userRes.ok || !user?.id) {
    const error = new Error("后台登录凭证无效");
    error.statusCode = 401;
    throw error;
  }

  const adminUrl = new URL(`${SUPABASE_URL}/rest/v1/admin_users`);
  adminUrl.searchParams.set("select", "id,user_id,email,role,is_active");
  adminUrl.searchParams.set("user_id", `eq.${user.id}`);
  adminUrl.searchParams.set("is_active", "eq.true");
  adminUrl.searchParams.set("limit", "1");
  const adminRes = await fetch(adminUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json"
    }
  });
  const adminRows = await readJson(adminRes);
  if (!adminRes.ok) {
    const error = new Error("后台权限校验失败");
    error.statusCode = 502;
    throw error;
  }

  let admin = Array.isArray(adminRows) ? adminRows[0] : null;
  const ownerEmail = String(process.env.TRRB_OWNER_EMAIL || "tangrenribao@gmail.com").trim().toLowerCase();
  const ownerUid = String(process.env.TRRB_OWNER_UID || "4c491ee3-a9f0-42c9-9bee-1abb52b20b01").trim();
  if (!admin && user.id === ownerUid && String(user.email || "").trim().toLowerCase() === ownerEmail) {
    admin = { role: "owner", email: ownerEmail };
  }

  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) {
    const error = new Error("没有后台图片生成权限");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!openaiKey) throw new Error("Netlify 尚未设置 OPENAI_API_KEY");
    if (!serviceKey) throw new Error("Netlify 尚未设置 SUPABASE_SERVICE_ROLE_KEY");

    await requireAdmin(event, serviceKey);

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
    const path = `ai/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now()}-${crypto.randomUUID()}.png`;
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/article-images/${path}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "image/png",
        "x-upsert": "false",
        "Cache-Control": "31536000"
      },
      body: bytes
    });
    if (!uploadRes.ok) throw new Error(`AI 图片上传失败：${await uploadRes.text()}`);

    const url = `${SUPABASE_URL}/storage/v1/object/public/article-images/${path}`;
    return response(200, { url, aiGenerated: true });
  } catch (error) {
    console.error(error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

const { json, clean, rest, publicPost } = require("./_shared/exposure-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit) || 20, 1), 60);
    const offset = Math.max(Number(event.queryStringParameters?.offset) || 0, 0);
    const q = clean(event.queryStringParameters?.q, 80);
    const status = "in.(published,disputed,resolved)";
    let path = `exposure_posts?select=*&status=${encodeURIComponent(status)}&order=pinned.desc,published_at.desc&limit=${limit}&offset=${offset}`;
    if (q) path += `&or=${encodeURIComponent(`title.ilike.*${q}*,body.ilike.*${q}*,target_name.ilike.*${q}*`)}`;
    const posts = await rest(path, { method: "GET" });
    const ids = (posts || []).map((p) => p.id);
    let media = [];
    if (ids.length) {
      media = await rest(`exposure_media?select=*&post_id=in.(${ids.join(",")})&order=sort_order.asc`, { method: "GET" });
    }
    const mediaMap = new Map();
    for (const item of media || []) {
      if (!mediaMap.has(item.post_id)) mediaMap.set(item.post_id, []);
      mediaMap.get(item.post_id).push(item);
    }
    return json(200, {
      posts: (posts || []).map((row) => ({ ...publicPost(row), media: mediaMap.get(row.id) || [] }))
    });
  } catch (error) {
    console.error("exposure-feed", error);
    return json(500, { error: error.message || String(error) });
  }
};

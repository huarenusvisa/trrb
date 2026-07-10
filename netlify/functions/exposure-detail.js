const { json, clean, rest, publicPost } = require("./_shared/exposure-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const id = clean(event.queryStringParameters?.id, 80);
    if (!id) throw new Error("缺少曝光内容ID");
    const posts = await rest(`exposure_posts?select=*&id=eq.${encodeURIComponent(id)}&status=in.(published,disputed,resolved)&limit=1`, { method: "GET" });
    const post = posts?.[0];
    if (!post) return json(404, { error: "内容不存在或已撤下" });
    const [media, comments] = await Promise.all([
      rest(`exposure_media?select=*&post_id=eq.${encodeURIComponent(id)}&order=sort_order.asc`, { method: "GET" }),
      rest(`exposure_comments?select=id,post_id,parent_id,nickname,body,role,status,likes,created_at&post_id=eq.${encodeURIComponent(id)}&status=eq.published&order=created_at.asc`, { method: "GET" })
    ]);
    return json(200, { post: { ...publicPost(post), media: media || [] }, comments: comments || [] });
  } catch (error) {
    console.error("exposure-detail", error);
    return json(500, { error: error.message || String(error) });
  }
};

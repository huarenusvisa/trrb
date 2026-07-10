const { json, parseJson, clean, rest } = require("./_shared/exposure-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const input = parseJson(event);
    const postId = clean(input.postId, 80);
    const nickname = clean(input.nickname, 40);
    const body = clean(input.body, 2000);
    if (!postId || !nickname || !body) throw new Error("请填写昵称和评论内容");
    const posts = await rest(`exposure_posts?select=id&id=eq.${encodeURIComponent(postId)}&status=in.(published,disputed,resolved)&limit=1`, { method: "GET" });
    if (!posts?.[0]) throw new Error("该内容已撤下，暂时不能评论");
    const inserted = await rest("exposure_comments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        post_id: postId,
        parent_id: clean(input.parentId, 80) || null,
        nickname,
        email: clean(input.email, 200) || null,
        body,
        role: "reader",
        status: "published"
      })
    });
    const c = inserted?.[0];
    if (!c) throw new Error("评论发布失败");
    delete c.email;
    return json(200, { ok: true, comment: c });
  } catch (error) {
    console.error("exposure-comment", error);
    return json(400, { error: error.message || String(error) });
  }
};

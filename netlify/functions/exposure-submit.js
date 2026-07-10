const { json, parseJson, clean, bool, rest, publicPost, SUPABASE_URL } = require("./_shared/exposure-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const input = parseJson(event);
    const title = clean(input.title, 160);
    const body = clean(input.body, 20000);
    const disclaimer = bool(input.disclaimerAccepted);
    if (title.length < 4) throw new Error("标题至少需要4个字");
    if (body.length < 10) throw new Error("曝光内容至少需要10个字");
    if (!disclaimer) throw new Error("请确认投稿责任声明");

    const media = Array.isArray(input.media) ? input.media.slice(0, 12) : [];
    for (const item of media) {
      const path = clean(item.storagePath, 500);
      if (!path.startsWith("pending/")) throw new Error("媒体文件路径无效");
      if (!["image", "video"].includes(item.mediaType)) throw new Error("媒体类型无效");
    }

    const payload = {
      title,
      body,
      target_name: clean(input.targetName, 160) || null,
      location: clean(input.location, 200) || null,
      happened_at: clean(input.happenedAt, 20) || null,
      author_name: clean(input.authorName, 80) || null,
      author_contact: clean(input.authorContact, 300) || null,
      anonymous: bool(input.anonymous),
      disclaimer_accepted: true,
      status: "published",
      published_at: new Date().toISOString()
    };

    const inserted = await rest("exposure_posts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    const post = inserted?.[0];
    if (!post?.id) throw new Error("曝光内容保存失败");

    if (media.length) {
      const rows = media.map((item, index) => ({
        post_id: post.id,
        media_url: `${SUPABASE_URL}/storage/v1/object/public/exposure-media/${encodeURI(clean(item.storagePath, 500))}`,
        storage_path: clean(item.storagePath, 500),
        media_type: item.mediaType,
        file_name: clean(item.fileName, 240) || null,
        mime_type: clean(item.mimeType, 120) || null,
        size_bytes: Number(item.sizeBytes) || null,
        sort_order: index
      }));
      await rest("exposure_media", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(rows)
      });
    }

    return json(200, { ok: true, post: publicPost(post), url: `/exposure-post.html?id=${encodeURIComponent(post.id)}` });
  } catch (error) {
    console.error("exposure-submit", error);
    return json(400, { error: error.message || String(error) });
  }
};

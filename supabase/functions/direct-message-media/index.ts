import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowed = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mp4", "audio/m4a", "audio/aac", "audio/mpeg", "audio/webm", "audio/3gpp", "audio/wav",
  "application/pdf", "text/plain", "application/zip", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/webm": "webm", "audio/3gpp": "3gp", "audio/wav": "wav",
  "application/pdf": "pdf", "text/plain": "txt", "application/zip": "zip", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return reply({ error: "unauthorized" }, 401);

  let payload: { action?: string; conversationId?: string; base64?: string; contentType?: string; fileName?: string; messageIds?: string[]; path?: string };
  try { payload = await request.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const conversationId = String(payload.conversationId || "");
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return reply({ error: "invalid_conversation" }, 400);
  const { data: conversation } = await admin.from("direct_conversations")
    .select("id,requester_user_id,recipient_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || (conversation.requester_user_id !== user.id && conversation.recipient_user_id !== user.id)) {
    return reply({ error: "conversation_forbidden" }, 403);
  }

  if (payload.action === "urls") {
    const ids = Array.isArray(payload.messageIds) ? payload.messageIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100) : [];
    if (!ids.length) return reply({ urls: {} });
    const { data: messages, error } = await admin.from("direct_messages")
      .select("id,attachment_path")
      .eq("conversation_id", conversationId)
      .in("id", ids)
      .not("attachment_path", "is", null);
    if (error) return reply({ error: "lookup_failed" }, 503);
    const urls: Record<string, string> = {};
    await Promise.all((messages || []).map(async (message) => {
      const { data } = await admin.storage.from("direct-message-media").createSignedUrl(message.attachment_path, 3600);
      if (data?.signedUrl) urls[message.id] = data.signedUrl;
    }));
    return reply({ urls });
  }

  if (payload.action === "delete") {
    const path = String(payload.path || "");
    if (!path.startsWith(`${conversationId}/${user.id}/`)) return reply({ error: "invalid_path" }, 400);
    const { error } = await admin.storage.from("direct-message-media").remove([path]);
    return error ? reply({ error: "delete_failed" }, 503) : reply({ removed: true });
  }

  const contentType = String(payload.contentType || "").toLowerCase().split(";")[0];
  const base64 = String(payload.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!allowed.has(contentType) || !base64) return reply({ error: "invalid_media" }, 400);
  if (base64.length > 16 * 1024 * 1024) return reply({ error: "file_too_large" }, 413);
  let bytes: Uint8Array;
  try { const binary = atob(base64); bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
  catch { return reply({ error: "invalid_base64" }, 400); }
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) return reply({ error: "file_too_large" }, 413);

  const extension = extensions[contentType] || "bin";
  const path = `${conversationId}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await admin.storage.from("direct-message-media").upload(path, bytes, { contentType, cacheControl: "3600", upsert: false });
  if (error) {
    console.error("direct message media upload failed", { userId: user.id, conversationId, code: error.name, message: error.message });
    return reply({ error: "upload_failed" }, 503);
  }
  return reply({ path, size: bytes.length, fileName: String(payload.fileName || "").slice(0, 180) || null });
});

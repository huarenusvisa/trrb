import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic" };
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
  let payload: { action?: string; base64?: string; contentType?: string; scope?: string; paths?: string[] };
  try { payload = await request.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (payload.action === "delete") {
    const paths = Array.isArray(payload.paths) ? payload.paths.filter((path): path is string => typeof path === "string" && path.startsWith(`${user.id}/`)).slice(0, 10) : [];
    if (!paths.length) return reply({ error: "invalid_paths" }, 400);
    const { error } = await admin.storage.from("profile-media").remove(paths);
    return error ? reply({ error: "delete_failed" }, 503) : reply({ removed: paths.length });
  }
  const contentType = String(payload.contentType || "").toLowerCase().split(";")[0];
  const scope = payload.scope === "cover" ? "cover" : payload.scope === "avatar" ? "avatar" : "";
  const base64 = String(payload.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!scope || !allowed.has(contentType) || !base64) return reply({ error: "invalid_media" }, 400);
  if (base64.length > 16 * 1024 * 1024) return reply({ error: "file_too_large" }, 413);
  let bytes: Uint8Array;
  try { const binary = atob(base64); bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); } catch { return reply({ error: "invalid_base64" }, 400); }
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) return reply({ error: "file_too_large" }, 413);
  const path = `${user.id}/${scope}/${Date.now()}-${crypto.randomUUID()}.${extensions[contentType]}`;
  const { error } = await admin.storage.from("profile-media").upload(path, bytes, { contentType, cacheControl: "31536000", upsert: false });
  if (error) { console.error("profile media upload failed", { userId: user.id, code: error.name, message: error.message }); return reply({ error: "upload_failed" }, 503); }
  return reply({ path });
});

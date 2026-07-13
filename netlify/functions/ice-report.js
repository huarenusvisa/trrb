const crypto = require("node:crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_HOURS = 6;
const MAX_FILES = 5;
const MAX_PREPARED_UPLOADS = 20;
const MIME_LIMITS = {
  "image/jpeg": 15 * 1024 * 1024,
  "image/png": 15 * 1024 * 1024,
  "image/webp": 15 * 1024 * 1024,
  "image/gif": 15 * 1024 * 1024,
  "image/heic": 15 * 1024 * 1024,
  "image/heif": 15 * 1024 * 1024,
  "video/mp4": 80 * 1024 * 1024,
  "video/quicktime": 80 * 1024 * 1024,
  "video/webm": 80 * 1024 * 1024,
};
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4",
  "video/quicktime": "mov", "video/webm": "webm",
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function safeText(value, max) {
  return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max);
}

function requireEnvironment() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const error = new Error("服务器尚未配置Supabase环境变量");
    error.statusCode = 500;
    throw error;
  }
}

function readBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    const error = new Error("请求内容不是有效JSON");
    error.statusCode = 400;
    throw error;
  }
}

function clientIp(event) {
  return safeText(
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0] ||
    "unknown",
    120
  );
}

function ipHash(event) {
  const secret = process.env.ICE_REPORT_HASH_SECRET || SERVICE_KEY;
  return crypto.createHmac("sha256", secret).update(clientIp(event)).digest("hex");
}

function isAllowedOrigin(event) {
  const origin = safeText(event.headers.origin, 300);
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "trrb.net" || host === "www.trrb.net" || host.endsWith(".netlify.app") || host === "localhost";
  } catch {
    return false;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function serviceFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.headers || {}),
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = new Error(body?.message || body?.details || body?.error || body?.raw || `Supabase ${response.status}`);
    error.statusCode = 502;
    throw error;
  }
  return body;
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return serviceFetch(`/rest/v1/${table}${url.search}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cleanOriginalName(value) {
  return safeText(value, 180).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

async function prepareUpload(event, input) {
  const type = safeText(input.file_type, 100).toLowerCase();
  const size = Number(input.file_size || 0);
  const originalName = cleanOriginalName(input.file_name || "upload");

  if (!MIME_LIMITS[type]) {
    const error = new Error("不支持这个文件类型");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MIME_LIMITS[type]) {
    const error = new Error(`文件大小超出限制：${originalName}`);
    error.statusCode = 400;
    throw error;
  }

  const hash = ipHash(event);
  const preparedSince = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();
  const preparedRows = await rest("ice_report_upload_tokens", {
    query: {
      select: "id",
      submitter_ip_hash: `eq.${hash}`,
      created_at: `gte.${preparedSince}`,
      limit: String(MAX_PREPARED_UPLOADS + 1),
    },
  });
  if (Array.isArray(preparedRows) && preparedRows.length >= MAX_PREPARED_UPLOADS) {
    const error = new Error("本设备准备上传的文件过多，请稍后再试");
    error.statusCode = 429;
    throw error;
  }

  const now = new Date();
  const path = [
    "incoming",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    `${crypto.randomUUID()}.${MIME_EXTENSIONS[type]}`,
  ].join("/");

  const endpoint = `/storage/v1/object/upload/sign/${encodeURIComponent(PRIVATE_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const data = await serviceFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-upsert": "false" },
    body: "{}",
  });

  const relative = data?.url || data?.signedURL || data?.signedUrl;
  if (!relative) throw new Error("Supabase没有返回上传地址");
  const signedUrl = /^https?:\/\//i.test(relative)
    ? relative
    : `${SUPABASE_URL}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`;

  await rest("ice_report_upload_tokens", {
    method: "POST",
    body: {
      path,
      mime_type: type,
      file_size: size,
      submitter_ip_hash: hash,
      used: false,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
    prefer: "return=minimal",
  });

  return { path, signed_url: signedUrl, expires_in: 7200 };
}

async function objectExists(path) {
  const endpoint = `/storage/v1/object/info/${encodeURIComponent(PRIVATE_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    await serviceFetch(endpoint, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function validUploadToken(path, type, size, hash) {
  const rows = await rest("ice_report_upload_tokens", {
    query: {
      select: "id,path,mime_type,file_size,used,expires_at",
      path: `eq.${path}`,
      submitter_ip_hash: `eq.${hash}`,
      used: "eq.false",
      expires_at: `gt.${new Date().toISOString()}`,
      limit: "1",
    },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && row.mime_type === type && Number(row.file_size) === Number(size) ? row : null;
}

async function enforceRateLimit(event) {
  const hash = ipHash(event);
  const since = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();
  const rows = await rest("ice_user_reports", {
    query: {
      select: "id",
      submitter_ip_hash: `eq.${hash}`,
      created_at: `gte.${since}`,
      limit: String(RATE_LIMIT_MAX + 1),
    },
  });
  if (Array.isArray(rows) && rows.length >= RATE_LIMIT_MAX) {
    const error = new Error(`提交过于频繁，请${RATE_LIMIT_HOURS}小时后再试`);
    error.statusCode = 429;
    throw error;
  }
  return hash;
}

function validateDate(value) {
  const text = safeText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const min = Date.now() - 366 * 24 * 60 * 60 * 1000;
  const max = Date.now() + 2 * 24 * 60 * 60 * 1000;
  return date.getTime() >= min && date.getTime() <= max ? text : "";
}

async function submitReport(event, input) {
  if (safeText(input.website, 200)) {
    return { id: crypto.randomUUID(), receipt_id: "已接收" };
  }

  const reportDate = validateDate(input.report_date);
  const location = safeText(input.location_text, 200);
  const description = safeText(input.event_description, 5000);
  const contact = safeText(input.contact_info, 300);
  const mediaInput = Array.isArray(input.media) ? input.media.slice(0, MAX_FILES) : [];

  if (!reportDate || location.length < 3 || description.length < 10) {
    const error = new Error("日期、地点或事件内容不完整");
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(input.media) || input.media.length > MAX_FILES) {
    const error = new Error("照片或视频最多5个");
    error.statusCode = 400;
    throw error;
  }

  const hash = ipHash(event);
  const uploadTokenIds = [];
  const media = [];
  for (const item of mediaInput) {
    const path = safeText(item?.path, 500);
    const type = safeText(item?.mime_type, 100).toLowerCase();
    const size = Number(item?.size || 0);
    if (!path.startsWith("incoming/") || !MIME_LIMITS[type] || size <= 0 || size > MIME_LIMITS[type]) {
      const error = new Error("上传文件信息无效");
      error.statusCode = 400;
      throw error;
    }
    const tokenRow = await validUploadToken(path, type, size, hash);
    if (!tokenRow) {
      const error = new Error("上传凭证无效或已经过期，请重新选择文件");
      error.statusCode = 400;
      throw error;
    }
    if (!(await objectExists(path))) {
      const error = new Error("有文件尚未上传完成，请重试");
      error.statusCode = 400;
      throw error;
    }
    uploadTokenIds.push(tokenRow.id);
    media.push({
      path,
      original_name: cleanOriginalName(item.original_name || "upload"),
      mime_type: type,
      size,
    });
  }

  await enforceRateLimit(event);
  const rows = await rest("ice_user_reports", {
    method: "POST",
    body: {
      report_date: reportDate,
      location_text: location,
      event_description: description,
      contact_info: contact,
      media,
      status: "draft",
      submitter_ip_hash: hash,
      user_agent: safeText(event.headers["user-agent"], 500),
      source_page: safeText(event.headers.referer || event.headers.referrer || "/topic/ice/", 500),
    },
    prefer: "return=representation",
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("保存失败，未返回提交编号");

  for (const tokenId of uploadTokenIds) {
    await rest("ice_report_upload_tokens", {
      method: "PATCH",
      query: { id: `eq.${tokenId}` },
      body: { used: true, report_id: row.id },
      prefer: "return=minimal",
    });
  }

  return {
    id: row.id,
    receipt_id: String(row.id).split("-")[0].toUpperCase(),
    status: "draft",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {}, {
      "Access-Control-Allow-Origin": event.headers.origin || "https://trrb.net",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAllowedOrigin(event)) return json(403, { error: "请求来源不允许" });

  try {
    requireEnvironment();
    const input = readBody(event);
    const action = safeText(input.action, 40);
    if (action === "prepare_upload") return json(200, await prepareUpload(event, input));
    if (action === "submit") return json(200, await submitReport(event, input));
    return json(400, { error: "无效操作" });
  } catch (error) {
    console.error("ICE随手拍接口失败：", error);
    return json(error.statusCode || 500, { error: error.message || "服务器错误" });
  }
};

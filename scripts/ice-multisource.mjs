#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import process from "node:process";

const args = new Map(process.argv.slice(2).map((arg) => {
  const value = arg.replace(/^--/, "");
  const index = value.indexOf("=");
  return index < 0 ? [value, "true"] : [value.slice(0, index), value.slice(index + 1)];
}));

const MODE = args.get("mode") || process.env.RUN_MODE || "collect";
const SOURCE_FILE = new URL("../data/ice-source-registry.json", import.meta.url);
const ICE_TERMS =
  '("ICE" OR "Immigration and Customs Enforcement" OR "immigration raid" OR deported OR deportation OR removed OR removal OR detained OR detention OR "immigration arrest" OR "immigration custody" OR HSI OR ERO)';
const DISCOVERY_QUERIES = [
  `${ICE_TERMS} lang:en -is:retweet`,
  '("ICE raid" OR "ICE arrest" OR "ICE detention" OR "deportation flight" OR "removal flight") lang:en -is:retweet',
];

function intEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}
function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}
function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeJson(value, fallback = null) {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}
function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}
function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function localIceRelevance(text) {
  const value = String(text || "").toLowerCase();
  const agency =
    /\bice\b|immigration and customs enforcement|\bhsi\b|\bero\b|homeland security investigations/.test(value);
  const action =
    /arrest|detain|detention|raid|deport|removal|removed|custody|release|court|facility|operation|warrant|immigration enforcement/.test(value);
  return agency && action;
}

function discoveredSourceEligible(author) {
  const followers = Number(author?.public_metrics?.followers_count || 0);
  return Boolean(author?.verified) || followers >= intEnv("ICE_DISCOVERY_MIN_FOLLOWERS", 10000, 0);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function maxSnowflake(ids) {
  return ids.reduce((max, id) => {
    if (!id) return max;
    try { return BigInt(id) > BigInt(max || "0") ? String(id) : max; }
    catch { return String(id) > String(max || "") ? String(id) : max; }
  }, "");
}
function xPostUrl(username, id) {
  return username
    ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`
    : `https://x.com/i/web/status/${encodeURIComponent(id)}`;
}
function nyDateLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${month}月${day}日`;
}
function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text.trim();
      }
    }
  }
  return "";
}

async function requestJson(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      const body = text ? safeJson(text, { raw: text }) : null;
      if (!response.ok) {
        const error = new Error(
          `${options.method || "GET"} ${url} → ${response.status}: ${
            body?.detail || body?.message || body?.error?.message || text.slice(0, 500)
          }`
        );
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || (error.status && error.status < 500 && error.status !== 429)) {
        throw error;
      }
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function requireEnvironment() {
  const names = [
    "X_BEARER_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

function supabaseHeaders(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: supabaseHeaders(prefer),
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function openAiStructured(instructions, input, schema, name, maxOutputTokens) {
  const response = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
  });
  await addUsage({ openAiCalls: 1 });
  const parsed = safeJson(responseText(response));
  if (!parsed) throw new Error(`OpenAI ${name} 返回无法解析`);
  return parsed;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "relevant","confidence","reason","event_fingerprint","event_type","event_date",
    "city","state_code","location_text","people_count","claims","entities",
    "claim_status","risk_flags"
  ],
  properties: {
    relevant: { type: "boolean" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    event_fingerprint: { type: "string" },
    event_type: {
      type: "string",
      enum: [
        "arrest","detention","raid","deportation","removal_flight",
        "release","court","policy","facility","protest","other"
      ]
    },
    event_date: { type: "string" },
    city: { type: "string" },
    state_code: { type: "string" },
    location_text: { type: "string" },
    people_count: { type: "integer", minimum: 0 },
    claims: { type: "array", items: { type: "string" }, maxItems: 12 },
    entities: { type: "array", items: { type: "string" }, maxItems: 12 },
    claim_status: {
      type: "string",
      enum: [
        "official_statement","reported_event","allegation","court_record",
        "eyewitness","opinion","unknown"
      ]
    },
    risk_flags: {
      type: "object",
      additionalProperties: false,
      required: ["privacy","legal","graphic","fabrication","minor"],
      properties: {
        privacy: { type: "boolean" },
        legal: { type: "boolean" },
        graphic: { type: "boolean" },
        fabrication: { type: "boolean" },
        minor: { type: "boolean" }
      }
    }
  }
};

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "publish","confidence","reason","conflict_detected","legal_risk","privacy_risk",
    "fabrication_risk","completeness_score","time_location_score","public_value_score",
    "risk_score","title","summary","content","event_type","confirmed_facts",
    "unconfirmed_claims","lead_source_post_id"
  ],
  properties: {
    publish: { type: "boolean" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    conflict_detected: { type: "boolean" },
    legal_risk: { type: "boolean" },
    privacy_risk: { type: "boolean" },
    fabrication_risk: { type: "boolean" },
    completeness_score: { type: "integer", minimum: 0, maximum: 20 },
    time_location_score: { type: "integer", minimum: 0, maximum: 10 },
    public_value_score: { type: "integer", minimum: 0, maximum: 10 },
    risk_score: { type: "integer", minimum: 0, maximum: 5 },
    title: { type: "string" },
    summary: { type: "string" },
    content: { type: "string" },
    event_type: { type: "string" },
    confirmed_facts: { type: "array", items: { type: "string" }, maxItems: 16 },
    unconfirmed_claims: { type: "array", items: { type: "string" }, maxItems: 16 },
    lead_source_post_id: { type: "string" }
  }
};

async function loadSeedSources() {
  const rows = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  if (!Array.isArray(rows) || rows.length < 50 || rows.length > 100) {
    throw new Error(`ICE信源数量必须为50—100，当前为${Array.isArray(rows) ? rows.length : 0}`);
  }
  return rows;
}
async function syncSources(seed) {
  await sb("source_registry", {
    method: "POST",
    query: { on_conflict: "topic_key,x_username" },
    body: seed.map((source) => ({
      topic_key: "ice",
      x_username: source.username,
      display_name: source.name,
      source_type: source.type,
      trust_tier: source.tier,
      independence_key: source.group,
      enabled: source.enabled !== false,
      requires_corroboration: source.requires_corroboration !== false,
    })),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}
async function enabledSources() {
  const rows = await sb("source_registry", {
    query: {
      select: "*",
      topic_key: "eq.ice",
      enabled: "eq.true",
      order: "trust_tier.asc,x_username.asc",
      limit: "100",
    },
  });
  return Array.isArray(rows) ? rows : [];
}
async function validateSources(sources) {
  if (!boolEnv("ICE_VALIDATE_SOURCE_HANDLES", false)) return sources;
  for (let index = 0; index < sources.length; index += 100) {
    const chunk = sources.slice(index, index + 100);
    const url = new URL("https://api.x.com/2/users/by");
    url.searchParams.set("usernames", chunk.map((source) => source.x_username).join(","));
    url.searchParams.set(
      "user.fields",
      "id,username,name,description,location,url,verified,public_metrics"
    );
    try {
      const result = await requestJson(url, {
        headers: {
          Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
          Accept: "application/json",
        },
      });
      const found = new Map((result?.data || []).map((user) => [user.username.toLowerCase(), user]));
      for (const source of chunk) {
        const profile = found.get(source.x_username.toLowerCase());
        if (!profile) continue;
        await sb("source_registry", {
          method: "PATCH",
          query: { id: `eq.${source.id}` },
          body: {
            validated: true,
            x_user_id: profile.id,
            display_name: profile.name || source.display_name,
            profile,
            last_validated_at: nowIso(),
          },
          prefer: "return=minimal",
        });
      }
    } catch (error) {
      console.warn("X账号验证接口不可用，继续使用种子信源：", error.message);
      break;
    }
  }
  return enabledSources();
}

function chunkSources(sources, size) {
  const output = [];
  for (let index = 0; index < sources.length; index += size) {
    output.push(sources.slice(index, index + size));
  }
  return output;
}

function sourceQuery(batch, cadence, groupIndex, kind) {
  const from = batch.map((source) => `from:${source.x_username}`).join(" OR ");
  return {
    key: `${kind}-${digest(batch.map((source) => source.x_username.toLowerCase()).join(","))}`,
    text: `(${from}) ${ICE_TERMS} lang:en -is:retweet`,
    sourceMap: new Map(batch.map((source) => [source.x_username.toLowerCase(), source])),
    discovery: false,
    kind,
    cadence,
    groupIndex,
  };
}

function buildQueries(sources) {
  const official = sources.filter((source) => source.source_type === "official");
  const media = sources.filter((source) =>
    ["major_media", "local_media", "specialist_media"].includes(source.source_type)
  );
  const organizations = sources.filter((source) =>
    ["legal_org", "research_org", "civic_org"].includes(source.source_type)
  );

  const queries = [];

  chunkSources(official, intEnv("ICE_OFFICIALS_PER_QUERY", 8, 5, 10))
    .forEach((batch, index) => queries.push(sourceQuery(batch, "hourly", index, "official")));

  chunkSources(media, intEnv("ICE_MEDIA_PER_QUERY", 8, 5, 10))
    .forEach((batch, index) => queries.push(sourceQuery(batch, "media-rotation", index, "media")));

  chunkSources(organizations, intEnv("ICE_ORGS_PER_QUERY", 13, 8, 15))
    .forEach((batch, index) => queries.push(sourceQuery(batch, "org-rotation", index, "organization")));

  DISCOVERY_QUERIES.forEach((text, index) => queries.push({
    key: `discovery-${index + 1}-${digest(text)}`,
    text,
    sourceMap: new Map(),
    discovery: true,
    kind: "discovery",
    cadence: "discovery-rotation",
    groupIndex: index,
  }));

  return queries;
}

function selectQueriesForRun(queries, date = new Date()) {
  if (MODE === "bootstrap") return queries;

  const hour = date.getUTCHours();
  const selected = [];

  const mediaQueries = queries.filter((query) => query.kind === "media");
  const orgQueries = queries.filter((query) => query.kind === "organization");
  const discoveryQueries = queries.filter((query) => query.kind === "discovery");

  selected.push(...queries.filter((query) => query.kind === "official"));

  // 媒体分两批轮换：每个媒体来源约每2小时检查一次。
  selected.push(...mediaQueries.filter((query) => query.groupIndex % 2 === hour % 2));

  // 专业机构每3小时运行一组，两组轮换后每个来源约每6小时检查一次。
  if (hour % 3 === 0 && orgQueries.length) {
    selected.push(orgQueries[Math.floor(hour / 3) % orgQueries.length]);
  }

  // 记者和可信个体发现查询每2小时运行一条，并在两条查询之间轮换。
  if (hour % 2 === 0 && discoveryQueries.length) {
    selected.push(discoveryQueries[Math.floor(hour / 2) % discoveryQueries.length]);
  }

  return selected;
}


async function usageRow(key) {
  const rows = await sb("ice_usage_ledger", {
    query: { select: "*", usage_key: `eq.${key}`, limit: "1" },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function addUsage({ xRequests = 0, xPosts = 0, openAiCalls = 0 }) {
  const month = monthKey();
  const day = dayKey();
  const monthUsage = (await usageRow(`month:${month}`)) || {
    usage_key: `month:${month}`,
    period_type: "month",
    period_label: month,
    x_requests: 0,
    x_posts_read: 0,
    openai_calls: 0,
  };
  const dayUsage = (await usageRow(`day:${day}`)) || {
    usage_key: `day:${day}`,
    period_type: "day",
    period_label: day,
    x_requests: 0,
    x_posts_read: 0,
    openai_calls: 0,
  };

  for (const row of [monthUsage, dayUsage]) {
    await sb("ice_usage_ledger", {
      method: "POST",
      query: { on_conflict: "usage_key" },
      body: {
        ...row,
        x_requests: Number(row.x_requests || 0) + xRequests,
        x_posts_read: Number(row.x_posts_read || 0) + xPosts,
        openai_calls: Number(row.openai_calls || 0) + openAiCalls,
        updated_at: nowIso(),
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

async function assertBudgetAvailable() {
  const month = await usageRow(`month:${monthKey()}`);
  const day = await usageRow(`day:${dayKey()}`);

  const monthlyPostCap = intEnv("ICE_MONTHLY_X_POST_READ_CAP", 52000, 1000, 1000000);
  const dailyRequestCap = intEnv("ICE_DAILY_X_REQUEST_CAP", 190, 10, 5000);

  if (Number(month?.x_posts_read || 0) >= monthlyPostCap) {
    throw new Error(
      `ICE月度X读取预算已达到保护上限：${month?.x_posts_read || 0}/${monthlyPostCap}`
    );
  }
  if (Number(day?.x_requests || 0) >= dailyRequestCap) {
    throw new Error(
      `ICE当日X请求已达到保护上限：${day?.x_requests || 0}/${dailyRequestCap}`
    );
  }
}

async function queryState(key) {
  const rows = await sb("ice_query_state", {
    query: { select: "*", query_key: `eq.${key}`, limit: "1" },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function saveQueryState(row) {
  await sb("ice_query_state", {
    method: "POST",
    query: { on_conflict: "query_key" },
    body: row,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}
function searchUrl(query, state, token = "", bootstrap = false) {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query.text);
  url.searchParams.set("max_results", "10");
  url.searchParams.set(
    "tweet.fields",
    "created_at,author_id,attachments,entities,lang,public_metrics,possibly_sensitive"
  );
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set(
    "user.fields",
    "id,username,name,description,location,url,verified,public_metrics"
  );
  url.searchParams.set(
    "media.fields",
    "media_key,type,url,preview_image_url,width,height,alt_text"
  );
  if (!bootstrap && state?.last_seen_id) url.searchParams.set("since_id", state.last_seen_id);
  if (token) url.searchParams.set("next_token", token);
  return url;
}
async function fetchQuery(query, state, bootstrap = false) {
  const maxPages = 1;
  const output = [];
  let token = "";
  let pages = 0;
  do {
    await assertBudgetAvailable();
    const body = await requestJson(searchUrl(query, state, token, bootstrap), {
      headers: {
        Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
        Accept: "application/json",
      },
    });
    await addUsage({
      xRequests: 1,
      xPosts: Array.isArray(body?.data) ? body.data.length : 0,
    });
    const users = new Map((body?.includes?.users || []).map((user) => [user.id, user]));
    const media = new Map((body?.includes?.media || []).map((item) => [item.media_key, item]));
    for (const tweet of body?.data || []) {
      const author = users.get(tweet.author_id) || {};
      output.push({
        tweet,
        author,
        media: (tweet.attachments?.media_keys || []).map((key) => media.get(key)).filter(Boolean),
        query,
      });
    }
    token = body?.meta?.next_token || "";
    pages += 1;
  } while (token && pages < maxPages);

  if (token) {
    console.warn(`${query.key}本小时返回超过10条；为控制预算，本轮只读取第一页。`);
  }
  return output;
}
async function bootstrapQuery(query) {
  const rows = await fetchQuery(query, null, true);
  const time = nowIso();
  await saveQueryState({
    query_key: query.key,
    query_text: query.text,
    last_seen_id: maxSnowflake(rows.map((row) => row.tweet.id)) || null,
    bootstrap_at: time,
    last_run_at: time,
    last_success_at: time,
    last_error: null,
    last_result: { mode: "bootstrap", ignored: rows.length },
    updated_at: time,
  });
  console.log(`初始化${query.key}，忽略历史${rows.length}条`);
}

function discoveredSource(item) {
  const username = item.author.username || "";
  return {
    id: null,
    x_username: username,
    display_name: item.author.name || username,
    source_type: "discovered_individual",
    trust_tier: 5,
    independence_key: `x:${username.toLowerCase()}`,
  };
}
function resolveSource(item) {
  const username = String(item.author.username || "").toLowerCase();
  return item.query.sourceMap.get(username) || discoveredSource(item);
}
async function postExists(id) {
  const rows = await sb("ice_posts", {
    query: { select: "id", x_post_id: `eq.${id}`, limit: "1" },
  });
  return Array.isArray(rows) && rows[0];
}
async function insertPost(item) {
  const source = resolveSource(item);
  const username = item.author.username || source.x_username || "";
  const rows = await sb("ice_posts", {
    method: "POST",
    body: {
      x_post_id: item.tweet.id,
      x_url: xPostUrl(username, item.tweet.id),
      source_registry_id: source.id || null,
      source_username: username,
      source_display_name: item.author.name || source.display_name || username,
      source_type: source.source_type || "discovered_individual",
      trust_tier: Number(source.trust_tier || 5),
      independence_key: source.independence_key || `x:${username.toLowerCase()}`,
      source_created_at: item.tweet.created_at || null,
      source_text: item.tweet.text || "",
      media: item.media || [],
      raw_payload: {
        tweet: item.tweet,
        author: item.author,
        media: item.media || [],
        discovery: item.query.discovery,
      },
      processing_status: "collected",
    },
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
async function collectQuery(query) {
  const state = await queryState(query.key);
  if (!state || MODE === "bootstrap") {
    await bootstrapQuery(query);
    return 0;
  }
  const started = nowIso();
  try {
    const rows = await fetchQuery(query, state, false);
    let inserted = 0;
    for (const item of rows) {
      if (await postExists(item.tweet.id)) continue;
      if (!localIceRelevance(item.tweet.text || "")) continue;
      if (item.query.discovery && !discoveredSourceEligible(item.author)) continue;
      await insertPost(item);
      inserted += 1;
    }
    await saveQueryState({
      query_key: query.key,
      query_text: query.text,
      last_seen_id: maxSnowflake(rows.map((row) => row.tweet.id)) || state.last_seen_id,
      bootstrap_at: state.bootstrap_at,
      last_run_at: started,
      last_success_at: nowIso(),
      last_error: null,
      last_result: { fetched: rows.length, inserted },
      updated_at: nowIso(),
    });
    return inserted;
  } catch (error) {
    await saveQueryState({
      query_key: query.key,
      query_text: query.text,
      last_seen_id: state.last_seen_id,
      bootstrap_at: state.bootstrap_at,
      last_run_at: started,
      last_error: String(error.message || error).slice(0, 2000),
      last_result: { error: String(error.message || error) },
      updated_at: nowIso(),
    });
    throw error;
  }
}

async function backlog() {
  const rows = await sb("ice_posts", {
    query: {
      select: "*",
      processing_status: "in.(collected,failed)",
      attempts: `lt.${intEnv("ICE_MAX_RETRIES", 5, 1, 20)}`,
      order: "created_at.asc",
      limit: String(intEnv("ICE_MAX_AI_POSTS_PER_RUN", 12, 1, 50)),
    },
  });
  return Array.isArray(rows) ? rows : [];
}
async function updatePost(id, patch) {
  const rows = await sb("ice_posts", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
async function extractPost(post) {
  return openAiStructured(
    [
      "你是唐人日报ICE专题事实提取编辑。",
      "判断帖子是否直接涉及美国ICE拘留、逮捕、执法、遣返、移送、拘留设施、相关法院程序或重要政策。",
      "只提取原帖明确出现的信息，不补充外部事实。",
      "严格区分逮捕、拘留、指控、起诉、定罪、判刑、遣返、移送和释放。",
      "event_fingerprint使用稳定的英文小写短语，按日期、地点、核心主体、事件类型组织；未知部分留空。",
      "个人或组织说法不得自动视为已证实事实。",
      "涉及未成年人、精确住址电话证件号、医疗隐私或未经证实刑事指控时设置风险标记。",
    ].join("\n"),
    {
      post_id: post.x_post_id,
      source: {
        username: post.source_username,
        name: post.source_display_name,
        type: post.source_type,
        trust_tier: post.trust_tier,
      },
      created_at: post.source_created_at,
      text: post.source_text,
      media: post.media || [],
    },
    EXTRACTION_SCHEMA,
    "ice_post_extraction",
    1300
  );
}
function fingerprint(extraction, post) {
  const value = normalize(extraction.event_fingerprint);
  if (value.length >= 8) return digest(value).slice(0, 40);
  return digest([
    extraction.event_date,
    extraction.state_code,
    extraction.city,
    extraction.event_type,
    ...(extraction.entities || []).slice(0, 4),
    post.source_text.slice(0, 200),
  ].join("|")).slice(0, 40);
}
async function storyFor(fp, extraction, post) {
  const rows = await sb("ice_stories", {
    query: { select: "*", event_fingerprint: `eq.${fp}`, limit: "1" },
  });
  if (Array.isArray(rows) && rows[0]) return rows[0];
  const inserted = await sb("ice_stories", {
    method: "POST",
    body: {
      event_fingerprint: fp,
      event_type: extraction.event_type || "other",
      first_seen_at: post.source_created_at || nowIso(),
      last_seen_at: post.source_created_at || nowIso(),
      status: "collecting",
    },
    prefer: "return=representation",
  });
  return Array.isArray(inserted) ? inserted[0] : inserted;
}
async function attachEvidence(story, post) {
  await sb("ice_story_evidence", {
    method: "POST",
    query: { on_conflict: "story_id,post_id" },
    body: {
      story_id: story.id,
      post_id: post.id,
      source_registry_id: post.source_registry_id,
      independence_key: post.independence_key,
      source_type: post.source_type,
      trust_tier: post.trust_tier,
      x_post_id: post.x_post_id,
      x_url: post.x_url,
    },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
  await updatePost(post.id, { processing_status: "clustered" });
}
async function processPost(post) {
  await updatePost(post.id, {
    processing_status: "processing",
    attempts: Number(post.attempts || 0) + 1,
    last_error: null,
  });
  try {
    const extraction = await extractPost(post);
    if (!extraction.relevant || extraction.confidence < 55) {
      await updatePost(post.id, {
        relevant: false,
        processing_status: "irrelevant",
        extraction_confidence: extraction.confidence,
        extraction_payload: extraction,
      });
      return null;
    }
    const fp = fingerprint(extraction, post);
    const updated = await updatePost(post.id, {
      relevant: true,
      event_fingerprint: fp,
      event_type: extraction.event_type,
      event_date: extraction.event_date || "",
      city: extraction.city || "",
      state_code: extraction.state_code || "",
      location_text: extraction.location_text || "",
      people_count: Number(extraction.people_count || 0),
      claims: extraction.claims || [],
      entities: extraction.entities || [],
      extraction_confidence: extraction.confidence,
      extraction_payload: extraction,
      processing_status: "extracted",
      last_error: null,
    });
    const story = await storyFor(fp, extraction, updated);
    await attachEvidence(story, updated);
    return story.id;
  } catch (error) {
    await updatePost(post.id, {
      processing_status: "failed",
      last_error: String(error.message || error).slice(0, 2000),
    });
    console.error(`处理${post.x_post_id}失败：`, error.message);
    return null;
  }
}

async function storyEvidence(storyId) {
  const links = await sb("ice_story_evidence", {
    query: {
      select: "*",
      story_id: `eq.${storyId}`,
      order: "created_at.asc",
      limit: "100",
    },
  });
  if (!Array.isArray(links) || !links.length) return [];
  const ids = links.map((link) => link.post_id).join(",");
  const posts = await sb("ice_posts", {
    query: { select: "*", id: `in.(${ids})`, limit: "100" },
  });
  const map = new Map((Array.isArray(posts) ? posts : []).map((post) => [post.id, post]));
  return links.map((link) => ({ link, post: map.get(link.post_id) })).filter((item) => item.post);
}
function counts(evidence) {
  const independent = new Set();
  let official = 0, media = 0, organization = 0, individual = 0;
  for (const item of evidence) {
    independent.add(item.link.independence_key);
    const type = item.link.source_type;
    if (type === "official") official += 1;
    else if (["major_media","local_media","specialist_media"].includes(type)) media += 1;
    else if (["legal_org","research_org","civic_org"].includes(type)) organization += 1;
    else individual += 1;
  }
  return { independent: independent.size, official, media, organization, individual };
}
function reliability(evidence) {
  let best = 0;
  for (const item of evidence) {
    const type = item.link.source_type;
    let score = 10;
    if (type === "official") score = 30;
    else if (["major_media","specialist_media"].includes(type)) score = 26;
    else if (type === "local_media") score = 23;
    else if (type === "journalist") score = 22;
    else if (["legal_org","research_org"].includes(type)) score = 20;
    else if (type === "civic_org") score = 17;
    best = Math.max(best, score);
  }
  return best;
}
function corroboration(sourceCounts) {
  if (sourceCounts.official >= 1 && sourceCounts.independent >= 2) return 25;
  if (sourceCounts.independent >= 3) return 25;
  if (sourceCounts.independent >= 2) return 21;
  if (sourceCounts.official >= 1) return 18;
  return 0;
}
function coverImage(evidence) {
  for (const item of evidence) {
    for (const media of item.post.media || []) {
      if (media?.type === "photo" && media.url) return media.url;
      if (media?.preview_image_url) return media.preview_image_url;
    }
  }
  return "";
}
async function latestScheduled() {
  const rows = await sb("ice_stories", {
    query: {
      select: "scheduled_at",
      scheduled_at: "not.is.null",
      order: "scheduled_at.desc",
      limit: "1",
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}
function roundHalfHour(date) {
  const result = new Date(date);
  result.setUTCSeconds(0, 0);
  const minute = result.getUTCMinutes();
  if (minute === 0 || minute === 30) return result;
  if (minute < 30) result.setUTCMinutes(30, 0, 0);
  else result.setUTCHours(result.getUTCHours() + 1, 0, 0, 0);
  return result;
}
async function scheduledAt() {
  const interval = intEnv("ICE_PUBLISH_INTERVAL_MINUTES", 120, 30, 1440);
  const latest = await latestScheduled();
  let candidate = new Date();
  if (latest?.scheduled_at) {
    const next = new Date(new Date(latest.scheduled_at).getTime() + interval * 60000);
    if (next > candidate) candidate = next;
  }
  return roundHalfHour(candidate).toISOString();
}
async function judgeStory(storyId) {
  const storyRows = await sb("ice_stories", {
    query: {
      select: "id,status,human_review_status",
      id: `eq.${storyId}`,
      limit: "1",
    },
  });
  const storyMeta = Array.isArray(storyRows) ? storyRows[0] : null;
  if (!storyMeta) return;
  if (["approved","published","rejected"].includes(storyMeta.status)) return;
  if (storyMeta.human_review_status === "editing") {
    console.log(`${storyId}：管理员正在编辑，本轮跳过AI覆盖`);
    return;
  }

  const evidence = await storyEvidence(storyId);
  if (!evidence.length) return;
  const sourceCounts = counts(evidence);
  const sourceScore = reliability(evidence);
  const crossScore = corroboration(sourceCounts);

  const ai = await openAiStructured(
    [
      "你是唐人日报ICE专题交叉核验主编。",
      "只采用至少一个来源明确支持且没有被其他可靠来源冲突的事实。",
      "官方机构单一来源可以进入发布判断，但必须使用“ICE表示、DHS称、警方通报”等归因。",
      "非官方媒体、记者、律师、机构或个体，至少需要两个独立来源相互印证。",
      "严格区分逮捕、拘留、指控、起诉、定罪、判刑、遣返、移送和释放。",
      "存在关键冲突、隐私风险、未成年人身份、精确住址电话证件号或未经证实刑事指控时，阻止自动发布。",
      `正文第一句必须以“唐人日报${nyDateLabel()}讯：”开头。`,
      "语言客观、中性，不使用震惊、炸裂、横扫、铁腕、清场等煽动词。",
      "标题8至24个中文字符，准确写明地点、机构、动作或核心事件。",
      "信息少时100至220字；事实完整时260至450字；不得补充来源外事实。",
    ].join("\n"),
    {
      deterministic_scores: {
        source_reliability_score: sourceScore,
        cross_check_score: crossScore,
      },
      source_counts: sourceCounts,
      evidence: evidence.slice(0, 20).map((item) => ({
        post_id: item.post.x_post_id,
        url: item.post.x_url,
        source: item.post.source_display_name,
        username: item.post.source_username,
        source_type: item.post.source_type,
        trust_tier: item.post.trust_tier,
        independence_key: item.post.independence_key,
        created_at: item.post.source_created_at,
        text: item.post.source_text,
        extraction: item.post.extraction_payload,
      })),
    },
    JUDGE_SCHEMA,
    "ice_cross_source_judgment",
    2400
  );

  const total = Math.min(
    100,
    sourceScore +
      crossScore +
      Number(ai.completeness_score || 0) +
      Number(ai.time_location_score || 0) +
      Number(ai.public_value_score || 0) +
      Number(ai.risk_score || 0)
  );
  const officialEligible = sourceCounts.official >= 1;
  const multiSourceEligible =
    sourceCounts.independent >= 2 &&
    (sourceCounts.media >= 1 || sourceCounts.organization >= 1);
  const risk =
    ai.conflict_detected || ai.legal_risk || ai.privacy_risk || ai.fabrication_risk;
  const scoreEligible =
    total >= intEnv("ICE_AUTO_PUBLISH_SCORE", 80, 0, 100) &&
    Number(ai.confidence || 0) >= intEnv("ICE_AI_CONFIDENCE", 80, 0, 100);

  let status = "pending_corroboration";
  let humanReviewStatus = "waiting";

  if (risk) {
    status = "pending_review";
    humanReviewStatus = "required";
  } else if (ai.publish && officialEligible && scoreEligible) {
    status = MODE === "dry-run" ? "pending_review" : "approved";
    humanReviewStatus = MODE === "dry-run" ? "required" : "not_required";
  } else if (ai.publish && multiSourceEligible && scoreEligible) {
    // 非官方内容即使达到80分，也必须进入 trrb.net/admin 人工审核。
    status = "pending_review";
    humanReviewStatus = "required";
  } else if (officialEligible || sourceCounts.independent >= 2) {
    status = "pending_review";
    humanReviewStatus = "required";
  }

  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${storyId}` },
    body: {
      event_type: ai.event_type || "other",
      title: ai.title || "",
      summary: ai.summary || "",
      content: ai.content || "",
      cover_image: coverImage(evidence),
      last_seen_at: evidence
        .map((item) => item.post.source_created_at)
        .filter(Boolean)
        .sort()
        .at(-1) || nowIso(),
      independent_source_count: sourceCounts.independent,
      official_source_count: sourceCounts.official,
      media_source_count: sourceCounts.media,
      organization_source_count: sourceCounts.organization,
      individual_source_count: sourceCounts.individual,
      source_reliability_score: sourceScore,
      cross_check_score: crossScore,
      completeness_score: Number(ai.completeness_score || 0),
      time_location_score: Number(ai.time_location_score || 0),
      public_value_score: Number(ai.public_value_score || 0),
      risk_score: Number(ai.risk_score || 0),
      total_score: total,
      conflict_detected: Boolean(ai.conflict_detected),
      legal_risk: Boolean(ai.legal_risk),
      privacy_risk: Boolean(ai.privacy_risk),
      fabrication_risk: Boolean(ai.fabrication_risk),
      ai_confidence: Number(ai.confidence || 0),
      ai_payload: ai,
      decision_reason: [
        ai.reason,
        `来源可靠性${sourceScore}/30`,
        `交叉印证${crossScore}/25`,
        `独立来源${sourceCounts.independent}`,
        `总分${total}/100`,
      ].join("；"),
      status,
      human_review_status: humanReviewStatus,
      scheduled_at: status === "approved" ? await scheduledAt() : null,
    },
    prefer: "return=minimal",
  });

  console.log(
    `${storyId}：${status}，总分${total}，独立来源${sourceCounts.independent}，官方${sourceCounts.official}`
  );
}


async function storiesForReview(preferredIds = []) {
  const limit = intEnv("ICE_MAX_STORIES_PER_RUN", 6, 1, 20);
  const output = [];
  const seen = new Set();

  for (const id of preferredIds) {
    if (!id || seen.has(id) || output.length >= limit) continue;
    seen.add(id);
    output.push(id);
  }

  if (output.length < limit) {
    const rows = await sb("ice_stories", {
      query: {
        select: "id,human_review_status",
        status: "in.(collecting,pending_corroboration,pending_review)",
        order: "updated_at.asc",
        limit: String(limit * 2),
      },
    });
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.human_review_status === "editing") continue;
      if (!row.id || seen.has(row.id) || output.length >= limit) continue;
      seen.add(row.id);
      output.push(row.id);
    }
  }

  return output;
}

function selfTest() {
  const checks = [];
  const assert = (condition, name) => {
    if (!condition) throw new Error(`自检失败：${name}`);
    checks.push(name);
  };
  assert(normalize("ICE arrest in New York!") === "icearrestinnewyork", "文本规范化");
  assert(maxSnowflake(["100","102","99"]) === "102", "X游标");
  assert(corroboration({ official: 1, independent: 1 }) === 18, "官方单源评分");
  assert(corroboration({ official: 0, independent: 2 }) === 21, "双独立来源评分");
  assert(xPostUrl("ICEgov","123").includes("/ICEgov/status/123"), "来源链接");
  assert(localIceRelevance("ICE announced an immigration arrest operation"), "本地相关性筛查");
  assert(!localIceRelevance("Weather forecast for New York"), "无关内容拦截");
  console.log(`ICE多信源自检通过：${checks.length}项`);
}

async function main() {
  if (args.has("self-test")) {
    selfTest();
    return;
  }
  requireEnvironment();
  if (!["collect","bootstrap","dry-run"].includes(MODE)) {
    throw new Error(`无效运行模式：${MODE}`);
  }

  const seed = await loadSeedSources();
  await syncSources(seed);
  let sources = await enabledSources();
  sources = await validateSources(sources);
  if (sources.length < 50) throw new Error(`启用ICE信源少于50个：${sources.length}`);

  const allQueries = buildQueries(sources);
  const queries = selectQueriesForRun(allQueries);
  console.log(
    `启用信源${sources.length}个，全部查询批次${allQueries.length}个，本轮执行${queries.length}个`
  );

  let collected = 0;
  for (const query of queries) collected += await collectQuery(query);

  if (MODE === "bootstrap") {
    console.log("ICE多信源初始化完成，历史帖子已忽略");
    return;
  }

  const pending = await backlog();
  const storyIds = new Set();
  for (const post of pending) {
    const storyId = await processPost(post);
    if (storyId) storyIds.add(storyId);
  }
  const reviewIds = await storiesForReview([...storyIds]);
  for (const storyId of reviewIds) await judgeStory(storyId);

  console.log(
    `运行完成：新收集${collected}条，AI处理${pending.length}条，交叉复核${reviewIds.length}个事件`
  );
}

main().catch((error) => {
  console.error("ICE多信源程序失败：", error);
  process.exitCode = 1;
});

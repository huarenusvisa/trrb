import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const ASSETS_DIR = path.join(ROOT, "assets");
const TOPIC_DIR = path.join(ROOT, "topic", "ice");
const NEWS_DIR = path.join(ROOT, "news", "ice");
const NEWS_FILE = path.join(DATA_DIR, "ice-news.json");
const STATE_FILE = path.join(DATA_DIR, "ice-state.json");
const PENDING_FILE = path.join(DATA_DIR, "ice-pending.json");
const DASHBOARD_FILE = path.join(DATA_DIR, "ice-dashboard.json");
const HOME_FILE = path.join(ROOT, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");

loadLocalEnv(path.join(ROOT, ".env.ice"));

const CONFIG = {
  xToken: firstEnv("X_BEARER_TOKEN", "X_API_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"),
  openAIKey: firstEnv("OPENAI_API_KEY"),
  openAIModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  siteUrl: normalizeSiteUrl(process.env.SITE_URL || "https://trrb.net"),
  query: process.env.ICE_QUERY || "(from:ICEgov OR from:DHSgov OR from:HSI_HQ OR from:CBP OR from:DOJCrimDiv OR from:Reuters OR from:AP OR from:FoxNews OR from:CNN OR from:NBCNews OR from:ABC OR from:CBSNews OR from:axios) (ICE OR immigration OR deportation OR detained OR arrest OR raid OR removal) -is:retweet",
  bootstrapLimit: intEnv("ICE_BOOTSTRAP_LIMIT", 30, 1, 100),
  maxNewPosts: intEnv("ICE_MAX_NEW_POSTS", 30, 1, 100),
  lookbackHours: intEnv("ICE_LOOKBACK_HOURS", 24, 1, 168),
  dedupeThreshold: floatEnv("ICE_DEDUPE_THRESHOLD", 0.72, 0.4, 0.95),
  minConfidence: intEnv("ICE_MIN_CONFIDENCE", 80, 0, 100),
  useXMedia: boolEnv("ICE_USE_X_MEDIA", true),
  maxPendingRetries: intEnv("ICE_MAX_PENDING_RETRIES", 5, 1, 20),
};

const SUBJECTIVE_TERMS = [
  "震惊", "炸裂", "疯狂", "大快人心", "罪有应得", "恶徒", "非法分子",
  "铁腕", "横扫", "重磅出击", "严打", "丧心病狂", "令人发指"
];

const SYSTEM_PROMPT = `
你是唐人日报的中文新闻编辑。你处理的是美国移民与海关执法局（ICE）官方公开信息。

硬性规则：
1. 只能使用输入材料中明确出现的事实，不得补充、猜测或虚构时间、地点、人数、身份、国籍、犯罪记录、法院结论或执法背景。
2. 使用简体中文，新闻写实风格，不表达支持或反对ICE的立场，不作政治评论。
3. arrested译为“被捕”，detained译为“被拘留”，charged译为“被指控”，indicted译为“被起诉”，convicted译为“被定罪”，sentenced译为“被判刑”，removed/deported译为“被遣返”。不得混淆这些状态。
4. 尚未定罪的人，不得称为“罪犯”“犯罪分子”或写成已经犯罪。
5. 不使用“震惊、炸裂、疯狂、铁腕、横扫、大快人心”等煽动性词语。
6. 输入事实很少时，生成brief，正文总量约80至180个中文字符；输入含完整ICE官方新闻稿时，生成article，正文总量约260至380个中文字符。不要为了凑字数重复或扩写。
7. 不复制大段英文原文，不使用Markdown，不写项目符号。
8. title准确概括核心事实；summary为35至80个中文字符；body_paragraphs为2至4段。
9. source_name固定为“美国移民与海关执法局”。
10. 资料不足、事实矛盾、涉及未成年人身份、死亡细节或无法判断法律状态时，needs_review必须为true，publishable必须为false，并说明原因。
11. enforcement_events只记录来源明确披露的ICE/HSI/ERO抓捕、拘留、遣返或其他执法事件；没有明确事件时返回空数组。
12. people_count只有在来源明确出现阿拉伯数字人数时填写；否则必须为null，禁止推算。
13. occurred_at只有在来源明确披露执法发生时间时填写ISO 8601；只有日期时使用当天00:00:00并把time_precision设为date；没有时间时为null。
14. city、state_code、state_name、location_text只能来自来源明确地点；无法确定时用空字符串。state_code使用美国两位州缩写。
15. 同一人员或同一行动只建立一个event，避免把“被捕后被拘留”等同一事件重复计算。
`;

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "summary", "body_paragraphs", "content_type", "publishable",
    "needs_review", "review_reason", "confidence", "source_name", "keywords",
    "enforcement_events"
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    body_paragraphs: {
      type: "array",
      items: { type: "string" }
    },
    content_type: { type: "string", enum: ["brief", "article"] },
    publishable: { type: "boolean" },
    needs_review: { type: "boolean" },
    review_reason: { type: "string" },
    confidence: { type: "integer" },
    source_name: { type: "string", enum: ["美国移民与海关执法局"] },
    keywords: {
      type: "array",
      items: { type: "string" }
    },
    enforcement_events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "event_type", "people_count", "occurred_at", "time_precision",
          "city", "state_code", "state_name", "location_text",
          "confidence", "source_excerpt"
        ],
        properties: {
          event_type: { type: "string", enum: ["arrest", "detention", "removal", "other"] },
          people_count: { type: ["integer", "null"] },
          occurred_at: { type: ["string", "null"] },
          time_precision: { type: "string", enum: ["second", "minute", "hour", "date", "unknown"] },
          city: { type: "string" },
          state_code: { type: "string" },
          state_name: { type: "string" },
          location_text: { type: "string" },
          confidence: { type: "integer" },
          source_excerpt: { type: "string" }
        }
      }
    }
  }
};

const EVENT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["enforcement_events"],
  properties: {
    enforcement_events: ARTICLE_SCHEMA.properties.enforcement_events
  }
};

async function main() {
  requireSecrets();
  await ensureStructure();
  await ensureHomeIntegration();

  const state = await readJson(STATE_FILE, {
    last_seen_id: "",
    last_run_at: "",
    last_success_at: "",
    last_result: { fetched: 0, published: 0, pending: 0 }
  });
  const news = await readJson(NEWS_FILE, []);
  let pending = await readJson(PENDING_FILE, []);

  // One-time metadata backfill for previously published articles.
  // Items are marked after checking so empty results are not charged repeatedly.
  const metadataBackfilledCount = await backfillRecentNewsEvents(news);

  // The feed only accepts source posts created within the configured lookback window.
  const pendingBeforeExpiry = pending.length;
  pending = pending.filter(entry => entry.post && isWithinHours(entry.post.created_at, CONFIG.lookbackHours));
  const expiredPendingCount = pendingBeforeExpiry - pending.length;

  // Remove same-event pending items before spending API credits.
  const pendingDedupe = dedupePendingByContent(pending, news);
  pending = pendingDedupe.items;

  const publishedIds = new Set(news.map(item => String(item.x_post_id || "")));
  const pendingIds = new Set(pending.map(item => String(item.x_post_id || "")));

  let publishedCount = 0;
  let pendingCount = 0;
  let duplicateSkippedCount = pendingDedupe.skipped;

  // Retry operational failures first. Manual-review entries stay untouched.
  const retryable = pending.filter(item => !item.manual_review && (item.attempts || 0) < CONFIG.maxPendingRetries);
  const untouched = pending.filter(item => item.manual_review || (item.attempts || 0) >= CONFIG.maxPendingRetries);
  const stillPending = [];

  for (const entry of retryable.slice(0, 10)) {
    if (!entry.post || publishedIds.has(String(entry.x_post_id))) continue;
    try {
      const result = await processPost(entry.post, news);
      if (result.status === "published") {
        publishedIds.add(String(entry.x_post_id));
        publishedCount += 1;
      } else {
        stillPending.push(makePendingEntry(entry.post, result.reason, true, (entry.attempts || 0) + 1));
      }
    } catch (error) {
      stillPending.push(makePendingEntry(entry.post, errorMessage(error), false, (entry.attempts || 0) + 1));
    }
  }
  pending = [...untouched, ...stillPending, ...retryable.slice(10)];

  const fetchedPosts = await fetchRecentPosts(state.last_seen_id);
  const candidatePosts = fetchedPosts.filter(post => {
    const id = String(post.id);
    return !publishedIds.has(id) && !pendingIds.has(id);
  });

  // Compare new posts with the last 24 hours of published and pending content.
  // Exact ICE.gov links, strongly similar wording, or matching names/numbers
  // are treated as one event. The first accepted item is kept.
  const references = buildDedupeReferences(news, pending);
  const newPosts = [];
  for (const post of candidatePosts) {
    const duplicate = findLikelyDuplicate(post, references);
    if (duplicate) {
      duplicateSkippedCount += 1;
      console.log(`Skipped duplicate X post ${post.id}; similar to ${duplicate.id}.`);
      continue;
    }
    newPosts.push(post);
    references.push(referenceFromPost(post));
  }

  for (const post of newPosts) {
    try {
      const result = await processPost(post, news);
      if (result.status === "published") {
        publishedIds.add(String(post.id));
        publishedCount += 1;
      } else {
        pending.push(makePendingEntry(post, result.reason, true, 1));
        pendingCount += 1;
      }
    } catch (error) {
      console.error(`Post ${post.id} failed:`, error);
      pending.push(makePendingEntry(post, errorMessage(error), false, 1));
      pendingCount += 1;
    }
  }

  news.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  pending = dedupePending(pending, publishedIds);

  const now = new Date().toISOString();
  const maxSeenId = maxSnowflake(fetchedPosts.map(post => String(post.id)));
  if (maxSeenId) state.last_seen_id = maxSnowflake([state.last_seen_id, maxSeenId]);
  state.last_run_at = now;
  if (publishedCount > 0) state.last_success_at = now;
  state.last_result = {
    fetched: fetchedPosts.length,
    candidates: candidatePosts.length,
    new_posts: newPosts.length,
    duplicate_skipped: duplicateSkippedCount,
    expired_pending: expiredPendingCount,
    metadata_backfilled: metadataBackfilledCount,
    published: publishedCount,
    pending: pendingCount,
    total_published: news.length,
    total_pending: pending.length
  };

  const dashboard = buildDashboardData(news, state, now);

  await writeJson(NEWS_FILE, news);
  await writeJson(PENDING_FILE, pending);
  await writeJson(STATE_FILE, state);
  await writeJson(DASHBOARD_FILE, dashboard);
  await updateSitemap(news, now);

  console.log(JSON.stringify(state.last_result, null, 2));
}

function requireSecrets() {
  const missing = [];
  if (!CONFIG.xToken) missing.push("X_BEARER_TOKEN");
  if (!CONFIG.openAIKey) missing.push("OPENAI_API_KEY");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function ensureStructure() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(ASSETS_DIR, { recursive: true }),
    fs.mkdir(TOPIC_DIR, { recursive: true }),
    fs.mkdir(NEWS_DIR, { recursive: true })
  ]);
  await ensureJsonFile(NEWS_FILE, []);
  await ensureJsonFile(PENDING_FILE, []);
  await ensureJsonFile(DASHBOARD_FILE, emptyDashboard());
  await ensureJsonFile(STATE_FILE, {
    last_seen_id: "",
    last_run_at: "",
    last_success_at: "",
    last_result: { fetched: 0, published: 0, pending: 0 }
  });
}

async function ensureHomeIntegration() {
  try {
    let html = await fs.readFile(HOME_FILE, "utf8");
    const scriptTag = '<script src="/assets/ice-home-widget.js" defer></script>';

    if (!html.includes("/assets/ice-home-widget.js")) {
      html = html.includes("</body>")
        ? html.replace("</body>", `  ${scriptTag}\n</body>`)
        : `${html}\n${scriptTag}\n`;
    }

    // Patch the existing ICE执法 anchor when possible. The widget also has a JS fallback.
    html = html.replace(
      /<a\b([^>]*)>([\s\S]{0,1200}?ICE执法[\s\S]{0,1200}?)<\/a>/i,
      (full, attrs, inner) => {
        let nextAttrs = attrs;
        if (/\bhref\s*=/.test(nextAttrs)) {
          nextAttrs = nextAttrs.replace(/\bhref\s*=\s*(["'])[^"']*\1/i, 'href="/topic/ice/"');
        } else {
          nextAttrs += ' href="/topic/ice/"';
        }
        return `<a${nextAttrs}>${inner}</a>`;
      }
    );

    await fs.writeFile(HOME_FILE, html, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.warn("index.html was not found; topic page will still be generated.");
  }
}

async function fetchRecentPosts(sinceId) {
  const collected = [];
  let nextToken = "";
  let pages = 0;

  do {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", CONFIG.query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("sort_order", "recency");
    url.searchParams.set("tweet.fields", "created_at,entities,attachments,lang,possibly_sensitive,public_metrics");
    url.searchParams.set("expansions", "attachments.media_keys,author_id");
    url.searchParams.set("media.fields", "url,preview_image_url,type,alt_text,width,height");
    url.searchParams.set("user.fields", "username,name");
    // X documents time-window search and since_id polling as separate patterns.
    // Use since_id after the first successful run; otherwise use a 24-hour
    // start_time with second-level precision. A local 24-hour filter is also
    // applied below, so older posts can never be published.
    if (sinceId) {
      url.searchParams.set("since_id", String(sinceId));
    } else {
      url.searchParams.set("start_time", toXApiDateTime(Date.now() - CONFIG.lookbackHours * 60 * 60 * 1000));
    }
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${CONFIG.xToken}` }
    });
    const payload = await readResponseJson(response, "X API");
    const mediaMap = new Map((payload.includes?.media || []).map(item => [item.media_key, item]));
    const userMap = new Map((payload.includes?.users || []).map(user => [String(user.id), user]));

    for (const item of payload.data || []) {
      const media = (item.attachments?.media_keys || [])
        .map(key => mediaMap.get(key))
        .filter(Boolean)
        .map(m => ({
          type: m.type,
          url: m.url || m.preview_image_url || "",
          alt_text: m.alt_text || "",
          width: m.width || 0,
          height: m.height || 0
        }));

      const author = userMap.get(String(item.author_id || "")) || {};
      collected.push({
        id: String(item.id),
        text: item.text || "",
        created_at: item.created_at || new Date().toISOString(),
        lang: item.lang || "",
        possibly_sensitive: Boolean(item.possibly_sensitive),
        entities: item.entities || {},
        media,
        author_username: author.username || "ICEgov",
        author_name: author.name || author.username || "公开来源",
        x_url: `https://x.com/${author.username || "ICEgov"}/status/${item.id}`
      });
    }

    nextToken = payload.meta?.next_token || "";
    pages += 1;
  } while (nextToken && pages < 5 && collected.length < CONFIG.maxNewPosts);

  let selected = dedupePosts(collected)
    .filter(post => isWithinHours(post.created_at, CONFIG.lookbackHours));
  selected.sort((a, b) => compareSnowflakes(b.id, a.id));

  if (!sinceId) selected = selected.slice(0, CONFIG.bootstrapLimit);
  else selected = selected.slice(0, CONFIG.maxNewPosts);

  selected.sort((a, b) => compareSnowflakes(a.id, b.id));
  return selected;
}

function sourceDisplayName(post) {
  const username = String(post.author_username || "").toLowerCase();
  const known = {
    icegov: "美国移民与海关执法局（ICE）",
    dhsgov: "美国国土安全部（DHS）",
    hsi_hq: "美国国土安全调查局（HSI）",
    cbp: "美国海关与边境保护局（CBP）",
    dojcrimdiv: "美国司法部刑事司",
    reuters: "路透社",
    ap: "美联社",
    foxnews: "Fox News",
    cnn: "CNN",
    nbcnews: "NBC News",
    abc: "ABC News",
    cbsnews: "CBS News",
    axios: "Axios"
  };
  return known[username] || post.author_name || post.author_username || "公开来源";
}

async function processPost(post, news) {
  const enrichment = await fetchIceGovEnrichment(post);
  const sourceText = buildSourceText(post, enrichment);
  const ai = await rewriteWithOpenAI(sourceText);
  const validation = validateArticle(ai, sourceText, post, enrichment);

  if (!validation.ok) {
    return { status: "pending", reason: validation.reason };
  }

  const dateParts = newYorkDateParts(post.created_at);
  const relativeUrl = `/news/ice/${dateParts.year}/${dateParts.month}/${dateParts.day}/ice-${post.id}.html`;
  const filePath = path.join(
    NEWS_DIR,
    dateParts.year,
    dateParts.month,
    dateParts.day,
    `ice-${post.id}.html`
  );

  const imageUrl = CONFIG.useXMedia ? firstUsableMedia(post.media) : "";
  const enforcementEvents = normalizeEnforcementEvents(ai.enforcement_events, sourceText);
  const item = {
    id: `ice-${post.id}`,
    x_post_id: post.id,
    title: ai.title.trim(),
    summary: ai.summary.trim(),
    content_type: ai.content_type,
    published_at: post.created_at,
    updated_at: new Date().toISOString(),
    url: relativeUrl,
    source_name: sourceDisplayName(post),
    source_url: post.x_url,
    official_url: enrichment.url || "",
    source_text: post.text.trim().slice(0, 1200),
    dedupe_key: createDedupeKey(post.text, enrichment.url || extractPrimaryIceUrl(post)),
    image_url: imageUrl,
    confidence: ai.confidence,
    keywords: ai.keywords,
    enforcement_events: enforcementEvents,
    state_codes: [...new Set(enforcementEvents.map(event => event.state_code).filter(Boolean))],
    event_metadata_checked_at: new Date().toISOString()
  };

  const html = renderArticle(item, ai.body_paragraphs, dateParts);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, html, "utf8");

  const existingIndex = news.findIndex(entry => String(entry.x_post_id) === String(post.id));
  if (existingIndex >= 0) news[existingIndex] = item;
  else news.push(item);

  return { status: "published", item };
}


async function backfillRecentNewsEvents(news) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const candidates = news
    .filter(item => !item.event_metadata_checked_at)
    .filter(item => Number.isFinite(Date.parse(item.published_at)) && Date.parse(item.published_at) >= cutoff)
    .slice(0, 10);
  let updated = 0;

  for (const item of candidates) {
    const sourceText = [
      item.source_text ? `ICE原始文字：\n${item.source_text}` : "",
      `已发布标题：${item.title || ""}`,
      `已发布摘要：${item.summary || ""}`,
      item.official_url ? `ICE官网链接：${item.official_url}` : "",
      item.source_url ? `ICE官方X链接：${item.source_url}` : ""
    ].filter(Boolean).join("\n\n");

    try {
      const extracted = await extractEventsWithOpenAI(sourceText);
      const events = normalizeEnforcementEvents(extracted.enforcement_events, sourceText);
      item.enforcement_events = events;
      item.state_codes = [...new Set(events.map(event => event.state_code).filter(Boolean))];
      item.event_metadata_checked_at = new Date().toISOString();
      updated += 1;
    } catch (error) {
      console.warn(`Could not backfill ICE event metadata for ${item.id || item.x_post_id}: ${errorMessage(error)}`);
    }
  }

  return updated;
}

async function extractEventsWithOpenAI(sourceText) {
  const payload = {
    model: CONFIG.openAIModel,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${SYSTEM_PROMPT.trim()}\n\n这次只提取enforcement_events，不改写文章。`
        }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `从以下材料提取可核实的ICE执法事件。无法明确人数、时间或地点时使用null或空字符串，不得推测。\n\n${sourceText}`
        }]
      }
    ],
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "trrb_ice_event_metadata",
        description: "ICE执法事件人数、时间与地点",
        strict: true,
        schema: EVENT_EXTRACTION_SCHEMA
      }
    }
  };

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.openAIKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 60000);
  const json = await readResponseJson(response, "OpenAI event metadata API");
  const outputText = extractOpenAIOutputText(json);
  if (!outputText) throw new Error("OpenAI returned no event metadata.");
  return JSON.parse(outputText);
}

async function fetchIceGovEnrichment(post) {
  const candidates = extractExpandedUrls(post);
  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate, {
        redirect: "follow",
        headers: {
          "User-Agent": "TRRB-ICE-NewsBot/1.1 (+https://trrb.net/topic/ice/)"
        }
      }, 20000);

      const finalUrl = response.url || candidate;
      if (!isIceGovUrl(finalUrl) || !response.ok) continue;

      const html = await response.text();
      const title = extractMeta(html, "og:title") || extractTitle(html);
      const description = extractMeta(html, "description") || extractMeta(html, "og:description");
      const articleHtml = firstMatch(html, [
        /<main\b[^>]*>([\s\S]*?)<\/main>/i,
        /<article\b[^>]*>([\s\S]*?)<\/article>/i,
        /<div\b[^>]*class=["'][^"']*(?:field--name-body|node__content|article-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      ]);
      const body = htmlToText(articleHtml || html).slice(0, 14000);

      return {
        url: finalUrl,
        title: cleanText(title).slice(0, 300),
        description: cleanText(description).slice(0, 800),
        body
      };
    } catch (error) {
      console.warn(`Could not enrich ${candidate}: ${errorMessage(error)}`);
    }
  }
  return { url: "", title: "", description: "", body: "" };
}

async function rewriteWithOpenAI(sourceText) {
  const payload = {
    model: CONFIG.openAIModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT.trim() }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `请根据以下唯一事实来源生成一篇可发布的中文新闻。\n\n${sourceText}`
        }]
      }
    ],
    max_output_tokens: 1600,
    text: {
      format: {
        type: "json_schema",
        name: "trrb_ice_article",
        description: "唐人日报ICE执法新闻结构化稿件",
        strict: true,
        schema: ARTICLE_SCHEMA
      }
    }
  };

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.openAIKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 60000);

  const json = await readResponseJson(response, "OpenAI API");
  const outputText = extractOpenAIOutputText(json);
  if (!outputText) throw new Error("OpenAI returned no output text.");

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${outputText.slice(0, 300)}`);
  }
}

function validateArticle(ai, sourceText, post, enrichment) {
  if (!ai || typeof ai !== "object") return fail("AI稿件结构无效");
  if (!ai.publishable || ai.needs_review) return fail(ai.review_reason || "AI标记为需要人工审核");
  if (Number(ai.confidence) < CONFIG.minConfidence) return fail(`可信度低于${CONFIG.minConfidence}`);

  const title = String(ai.title || "").trim();
  const summary = String(ai.summary || "").trim();
  const paragraphs = Array.isArray(ai.body_paragraphs) ? ai.body_paragraphs.map(String) : [];
  const output = `${title}\n${summary}\n${paragraphs.join("\n")}`;
  const bodyLength = countCjkAndWords(paragraphs.join(""));

  if (title.length < 8 || title.length > 60) return fail("标题长度不合格");
  if (!paragraphs.length) return fail("正文为空");
  if (ai.content_type === "brief" && (bodyLength < 55 || bodyLength > 260)) return fail("快讯正文长度异常");
  if (ai.content_type === "article" && (bodyLength < 150 || bodyLength > 650)) return fail("新闻正文长度异常");

  const subjective = SUBJECTIVE_TERMS.find(term => output.includes(term));
  if (subjective) return fail(`出现主观或煽动性词语：${subjective}`);

  const lowerSource = sourceText.toLowerCase();
  const legalChecks = [
    { zh: ["被定罪", "定罪"], en: ["convicted", "conviction", "found guilty", "pleaded guilty", "pled guilty"] },
    { zh: ["被判刑", "判处"], en: ["sentenced", "sentence of"] },
    { zh: ["被起诉"], en: ["indicted", "indictment", "charged"] },
    { zh: ["被遣返", "遣返回"], en: ["removed", "deported", "repatriated"] },
    { zh: ["被捕", "逮捕"], en: ["arrested", "arrest"] }
  ];
  for (const check of legalChecks) {
    if (check.zh.some(term => output.includes(term)) && !check.en.some(term => lowerSource.includes(term))) {
      return fail(`法律状态“${check.zh[0]}”在来源中没有对应依据`);
    }
  }

  if ((output.includes("罪犯") || output.includes("犯罪分子")) &&
      !["convicted", "found guilty", "pleaded guilty", "pled guilty"].some(term => lowerSource.includes(term))) {
    return fail("在没有定罪依据时使用了罪犯表述");
  }

  // Prevent invented Arabic-number facts. Every generated number must occur in source material.
  const sourceNumbers = new Set((sourceText.match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken));
  const outputNumbers = [...new Set((output.match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken))];
  const invented = outputNumbers.filter(number => number && !sourceNumbers.has(number));
  if (invented.length) return fail(`稿件出现来源中不存在的数字：${invented.join(", ")}`);

  if (post.possibly_sensitive) return fail("X将该帖子标记为敏感内容");
  if (!post.text.trim()) return fail("原帖没有可核实文字");

  return { ok: true, reason: "" };
}


const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
]);

function normalizeEnforcementEvents(events, sourceText) {
  if (!Array.isArray(events)) return [];
  const sourceNumbers = new Set((String(sourceText || "").match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken));
  const seen = new Set();
  const normalized = [];

  for (const raw of events.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const eventType = ["arrest", "detention", "removal", "other"].includes(raw.event_type)
      ? raw.event_type
      : "other";
    let peopleCount = Number.isInteger(raw.people_count) && raw.people_count > 0
      ? raw.people_count
      : null;
    if (peopleCount != null && !sourceNumbers.has(String(peopleCount))) peopleCount = null;

    const parsedTime = raw.occurred_at && Number.isFinite(Date.parse(raw.occurred_at))
      ? new Date(raw.occurred_at).toISOString()
      : null;
    const precision = ["second", "minute", "hour", "date", "unknown"].includes(raw.time_precision)
      ? raw.time_precision
      : (parsedTime ? "second" : "unknown");
    const stateCode = String(raw.state_code || "").trim().toUpperCase();
    const safeStateCode = US_STATE_CODES.has(stateCode) ? stateCode : "";
    const event = {
      event_type: eventType,
      people_count: peopleCount,
      occurred_at: parsedTime,
      time_precision: parsedTime ? precision : "unknown",
      city: cleanText(raw.city || "").slice(0, 100),
      state_code: safeStateCode,
      state_name: cleanText(raw.state_name || "").slice(0, 100),
      location_text: cleanText(raw.location_text || "").slice(0, 180),
      confidence: Math.max(0, Math.min(100, Number.parseInt(raw.confidence || "0", 10) || 0)),
      source_excerpt: cleanText(raw.source_excerpt || "").slice(0, 240)
    };
    const key = [event.event_type, event.people_count ?? "", event.occurred_at || "", event.state_code, event.city, event.location_text].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(event);
  }

  return normalized;
}

function emptyDashboard() {
  return {
    generated_at: "",
    timezone: "America/New_York",
    latest_sync_at: "",
    total_published: 0,
    today: {
      date: "",
      known_people: 0,
      event_count: 0,
      location_count: 0,
      unknown_people_events: 0,
      events: []
    },
    heatmap: {
      "24h": { states: [] },
      "7d": { states: [] },
      "30d": { states: [] }
    }
  };
}

function buildDashboardData(news, state, nowIso) {
  const dashboard = emptyDashboard();
  dashboard.generated_at = nowIso;
  dashboard.latest_sync_at = state.last_run_at || nowIso;
  dashboard.total_published = news.length;
  dashboard.today.date = newYorkDateKey(nowIso);

  const normalizedEvents = [];
  for (const item of news) {
    for (const event of Array.isArray(item.enforcement_events) ? item.enforcement_events : []) {
      if (!["arrest", "detention", "removal", "other"].includes(event.event_type)) continue;
      const basisTime = event.occurred_at || item.published_at;
      if (!basisTime || !Number.isFinite(Date.parse(basisTime))) continue;
      normalizedEvents.push({
        ...event,
        basis_time: new Date(basisTime).toISOString(),
        time_basis: event.occurred_at ? "执法时间" : "官方公开时间",
        article_title: item.title,
        article_url: item.url,
        published_at: item.published_at
      });
    }
  }

  const todayEvents = normalizedEvents
    .filter(event => ["arrest", "detention"].includes(event.event_type))
    .filter(event => newYorkDateKey(event.basis_time) === dashboard.today.date)
    .sort((a, b) => new Date(b.basis_time) - new Date(a.basis_time));

  dashboard.today.known_people = todayEvents.reduce((sum, event) => sum + (event.people_count || 0), 0);
  dashboard.today.event_count = todayEvents.length;
  dashboard.today.location_count = new Set(todayEvents.map(event => event.state_code || event.location_text).filter(Boolean)).size;
  dashboard.today.unknown_people_events = todayEvents.filter(event => event.people_count == null).length;
  dashboard.today.events = todayEvents.slice(0, 20);

  for (const [label, hours] of [["24h", 24], ["7d", 24 * 7], ["30d", 24 * 30]]) {
    const cutoff = Date.parse(nowIso) - hours * 60 * 60 * 1000;
    const map = new Map();
    for (const event of normalizedEvents) {
      if (!event.state_code || Date.parse(event.basis_time) < cutoff) continue;
      const entry = map.get(event.state_code) || {
        code: event.state_code,
        name: event.state_name || event.state_code,
        events: 0,
        people: 0,
        unknown_people_events: 0
      };
      entry.events += 1;
      if (event.people_count == null) entry.unknown_people_events += 1;
      else entry.people += event.people_count;
      map.set(event.state_code, entry);
    }
    dashboard.heatmap[label].states = [...map.values()].sort((a, b) => b.events - a.events || b.people - a.people);
  }

  return dashboard;
}

function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function renderArticle(item, paragraphs, dateParts) {
  const articleDate = `${Number(dateParts.month)}月${Number(dateParts.day)}日`;
  const body = paragraphs.map((paragraph, index) => {
    const prefix = index === 0 ? `唐人日报${articleDate}讯：` : "";
    return `<p>${escapeHtml(prefix + paragraph.trim())}</p>`;
  }).join("\n");

  const image = item.image_url
    ? `<figure class="article-image"><img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>图片来源：ICE官方X账号公开内容</figcaption></figure>`
    : "";

  const officialLink = item.official_url
    ? `<a href="${escapeAttr(item.official_url)}" target="_blank" rel="noopener noreferrer">ICE官方网站原始通报</a>`
    : "";
  const sourceLinks = [
    `<a href="${escapeAttr(item.source_url)}" target="_blank" rel="noopener noreferrer">查看ICE官方X原帖</a>`,
    officialLink
  ].filter(Boolean).join("<span>·</span>");

  const canonical = `${CONFIG.siteUrl}${item.url}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.summary,
    datePublished: item.published_at,
    dateModified: item.updated_at,
    mainEntityOfPage: canonical,
    publisher: { "@type": "Organization", name: "唐人日报", url: CONFIG.siteUrl },
    author: { "@type": "Organization", name: "唐人日报编辑部" },
    image: item.image_url ? [item.image_url] : undefined
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(item.title)} - 唐人日报</title>
  <meta name="description" content="${escapeAttr(item.summary)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="stylesheet" href="/assets/ice-topic.css">
  <script type="application/ld+json">${safeJsonForHtml(jsonLd)}</script>
</head>
<body>
  <header class="trrb-header">
    <div class="trrb-header-inner">
      <a class="trrb-brand" href="/">唐人日报</a>
      <a class="trrb-channel" href="/topic/ice/">ICE执法追踪</a>
    </div>
  </header>

  <main class="article-shell">
    <nav class="breadcrumb"><a href="/">首页</a><span>›</span><a href="/topic/ice/">ICE执法</a></nav>
    <article class="news-article">
      <div class="article-kicker">ICE执法追踪</div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="article-meta">
        <time datetime="${escapeAttr(item.published_at)}">${escapeHtml(formatChineseDateTime(item.published_at))}</time>
        <span>来源：美国移民与海关执法局</span>
      </div>
      <p class="article-summary">${escapeHtml(item.summary)}</p>
      ${image}
      <div class="article-body">${body}</div>
      <aside class="source-box">
        <strong>原始信息</strong>
        <div class="source-links">${sourceLinks}</div>
        <p>本文根据ICE公开资料整理。案件中的逮捕、指控或起诉不等同于法院定罪。</p>
      </aside>
    </article>
    <div class="back-topic"><a href="/topic/ice/">返回ICE执法全部新闻</a></div>
  </main>
</body>
</html>`;
}

async function updateSitemap(news, nowIso) {
  const topicUrl = `${CONFIG.siteUrl}/topic/ice/`;
  const newest = news.slice(0, Math.max(50, CONFIG.maxNewPosts));
  const additions = [
    { loc: topicUrl, lastmod: nowIso.slice(0, 10) },
    ...newest.map(item => ({ loc: `${CONFIG.siteUrl}${item.url}`, lastmod: item.updated_at.slice(0, 10) }))
  ];

  let xml;
  try {
    xml = await fs.readFile(SITEMAP_FILE, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';
  }

  for (const entry of additions) {
    const escapedLoc = escapeXml(entry.loc);
    const locPattern = new RegExp(`<url>\\s*<loc>${escapeRegExp(escapedLoc)}<\\/loc>[\\s\\S]*?<\\/url>`, "i");
    const block = `  <url>\n    <loc>${escapedLoc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`;
    if (locPattern.test(xml)) xml = xml.replace(locPattern, block);
    else xml = xml.replace(/<\/urlset>/i, `${block}\n</urlset>`);
  }

  await fs.writeFile(SITEMAP_FILE, xml, "utf8");
}

function buildSourceText(post, enrichment) {
  const parts = [
    `X账号：@ICEgov`,
    `X帖子ID：${post.id}`,
    `X发布时间（UTC）：${post.created_at}`,
    `X原帖链接：${post.x_url}`,
    `X原文：\n${post.text.trim()}`
  ];
  if (enrichment.url) {
    parts.push(
      `ICE官网链接：${enrichment.url}`,
      `ICE官网标题：${enrichment.title}`,
      `ICE官网摘要：${enrichment.description}`,
      `ICE官网正文摘取：\n${enrichment.body}`
    );
  } else {
    parts.push("未发现或未能读取ICE.gov完整新闻稿。只能依据X原帖写快讯，不得扩写未知事实。");
  }
  return parts.join("\n\n");
}

function extractExpandedUrls(post) {
  const urls = [];
  for (const item of post.entities?.urls || []) {
    const candidate = item.unwound_url || item.expanded_url || item.url;
    if (candidate) urls.push(candidate);
  }
  const matches = post.text.match(/https?:\/\/[^\s]+/g) || [];
  urls.push(...matches);
  return [...new Set(urls)].filter(url => /^https?:\/\//i.test(url));
}

function isIceGovUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ice.gov" || hostname.endsWith(".ice.gov");
  } catch {
    return false;
  }
}

function extractOpenAIOutputText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  for (const item of json.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text.trim();
    }
  }
  return "";
}

function makePendingEntry(post, reason, manualReview, attempts) {
  return {
    id: `pending-${post.id}`,
    x_post_id: String(post.id),
    reason: String(reason || "未知原因").slice(0, 500),
    manual_review: Boolean(manualReview),
    attempts,
    created_at: new Date().toISOString(),
    post
  };
}

function dedupePending(items, publishedIds) {
  const map = new Map();
  for (const item of items) {
    const id = String(item.x_post_id || "");
    if (!id || publishedIds.has(id)) continue;
    const previous = map.get(id);
    if (!previous || (item.attempts || 0) >= (previous.attempts || 0)) map.set(id, item);
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}


const DEDUPE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "after", "before",
  "their", "they", "them", "his", "her", "its", "our", "your", "you", "are", "was",
  "were", "has", "have", "had", "will", "would", "could", "should", "about", "against",
  "through", "during", "today", "yesterday", "tomorrow", "new", "more", "most",
  "ice", "icegov", "hsi", "ero", "dhs", "uscis", "official", "officers", "agents",
  "u", "s", "us", "news", "update", "read", "learn", "details", "information"
]);

const GENERIC_NAME_PHRASES = new Set([
  "United States", "Homeland Security", "Immigration Customs Enforcement",
  "U S Immigration", "ICE HSI", "ICE ERO", "Department Homeland Security"
].map(value => value.toLowerCase()));

function isWithinHours(value, hours) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -5 * 60 * 1000 && age <= hours * 60 * 60 * 1000;
}

function extractPrimaryIceUrl(post) {
  for (const candidate of extractExpandedUrls(post)) {
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname === "ice.gov" || parsed.hostname.endsWith(".ice.gov")) {
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString().replace(/\/+$/, "");
      }
    } catch {}
  }
  return "";
}

function createDedupeKey(text, officialUrl = "") {
  const normalizedUrl = normalizeComparableUrl(officialUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return `text:${crypto.createHash("sha256").update(normalizeDedupeText(text)).digest("hex").slice(0, 24)}`;
}

function normalizeComparableUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|campaign$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return "";
  }
}

function normalizeDedupeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\p{L}\p{N}_-]+/gu, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[^\p{L}\p{N}%$'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  const normalized = normalizeDedupeText(value);
  const rawTokens = normalized.match(/[\p{Script=Han}]|[\p{L}\p{N}%$'-]{2,}/gu) || [];
  return new Set(rawTokens.filter(token => !DEDUPE_STOPWORDS.has(token)));
}

function extractNumberSet(value) {
  return new Set((String(value || "").match(/\b\d[\d,.%-]*\b/g) || []).map(normalizeNumberToken));
}

function extractNameSet(value) {
  const matches = String(value || "").match(/\b(?:[A-Z][A-Za-z'’-]{1,})(?:\s+(?:[A-Z][A-Za-z'’-]{1,})){1,3}\b/g) || [];
  return new Set(matches
    .map(name => name.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(name => !GENERIC_NAME_PHRASES.has(name)));
}

function intersectionSize(a, b) {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  const intersection = intersectionSize(a, b);
  return intersection / (a.size + b.size - intersection);
}

function ngramSet(value, size = 3) {
  const normalized = normalizeDedupeText(value).replace(/\s+/g, "");
  const set = new Set();
  if (normalized.length < size) {
    if (normalized) set.add(normalized);
    return set;
  }
  for (let i = 0; i <= normalized.length - size; i += 1) {
    set.add(normalized.slice(i, i + size));
  }
  return set;
}

function diceSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
}

function referenceFromPost(post) {
  return {
    id: `x:${post.id}`,
    text: post.text || "",
    officialUrl: extractPrimaryIceUrl(post),
    createdAt: post.created_at || ""
  };
}

function referenceFromNews(item) {
  return {
    id: `news:${item.x_post_id || item.id || "unknown"}`,
    text: [
      item.source_text || "",
      item.title || "",
      item.summary || "",
      Array.isArray(item.keywords) ? item.keywords.join(" ") : ""
    ].join(" "),
    officialUrl: item.official_url || "",
    createdAt: item.published_at || item.updated_at || ""
  };
}

function referenceFromPending(item) {
  return item?.post ? {
    id: `pending:${item.x_post_id || item.post.id || "unknown"}`,
    text: item.post.text || "",
    officialUrl: extractPrimaryIceUrl(item.post),
    createdAt: item.post.created_at || item.created_at || ""
  } : null;
}

function buildDedupeReferences(news, pending) {
  const references = [];
  for (const item of news) {
    if (isWithinHours(item.published_at, CONFIG.lookbackHours)) references.push(referenceFromNews(item));
  }
  for (const item of pending) {
    const reference = referenceFromPending(item);
    if (reference && isWithinHours(reference.createdAt, CONFIG.lookbackHours)) references.push(reference);
  }
  return references;
}

function isLikelyDuplicateReference(a, b) {
  const aUrl = normalizeComparableUrl(a.officialUrl);
  const bUrl = normalizeComparableUrl(b.officialUrl);
  if (aUrl && bUrl && aUrl === bUrl) return true;

  const aText = normalizeDedupeText(a.text);
  const bText = normalizeDedupeText(b.text);
  if (!aText || !bText) return false;
  if (aText === bText) return true;

  const tokenScore = jaccardSimilarity(tokenSet(aText), tokenSet(bText));
  const ngramScore = diceSimilarity(ngramSet(aText), ngramSet(bText));
  if (tokenScore >= CONFIG.dedupeThreshold || ngramScore >= 0.84) return true;

  const aNames = extractNameSet(a.text);
  const bNames = extractNameSet(b.text);
  const sharedNames = intersectionSize(aNames, bNames);

  const aNumbers = extractNumberSet(a.text);
  const bNumbers = extractNumberSet(b.text);
  const sharedNumbers = intersectionSize(aNumbers, bNumbers);

  if (sharedNames >= 1 && sharedNumbers >= 1 && tokenScore >= 0.36) return true;
  if (sharedNames >= 2 && tokenScore >= 0.40) return true;
  if (sharedNumbers >= 2 && tokenScore >= 0.50) return true;

  return false;
}

function findLikelyDuplicate(post, references) {
  const candidate = referenceFromPost(post);
  return references.find(reference => isLikelyDuplicateReference(candidate, reference)) || null;
}

function dedupePendingByContent(items, news) {
  const references = news
    .filter(item => isWithinHours(item.published_at, CONFIG.lookbackHours))
    .map(referenceFromNews);
  const kept = [];
  let skipped = 0;

  // Keep the newest pending entry when two pending posts describe the same event.
  const sorted = [...items].sort((a, b) =>
    new Date(b.post?.created_at || b.created_at || 0) - new Date(a.post?.created_at || a.created_at || 0)
  );

  for (const item of sorted) {
    const reference = referenceFromPending(item);
    if (!reference) continue;
    const duplicate = references.find(existing => isLikelyDuplicateReference(reference, existing));
    if (duplicate) {
      skipped += 1;
      console.log(`Removed duplicate pending item ${item.x_post_id}; similar to ${duplicate.id}.`);
      continue;
    }
    kept.push(item);
    references.push(reference);
  }

  return { items: kept, skipped };
}

function dedupePosts(posts) {
  const map = new Map();
  for (const post of posts) map.set(String(post.id), post);
  return [...map.values()];
}

function firstUsableMedia(media = []) {
  const item = media.find(entry => entry.url && ["photo", "video", "animated_gif"].includes(entry.type));
  return item?.url || "";
}

function newYorkDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: map.year, month: map.month, day: map.day };
}

function formatChineseDateTime(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${Number(map.year)}/${Number(map.month)}/${Number(map.day)} ${map.hour}:${map.minute}:${map.second}`;
}

function toXApiDateTime(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseJson(response, label) {
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label} returned non-JSON response (${response.status}): ${text.slice(0, 300)}`); }
  if (!response.ok) {
    const detail = json?.detail || json?.error?.message || json?.title || text.slice(0, 300);
    throw new Error(`${label} request failed (${response.status}): ${detail}`);
  }
  return json;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw new Error(`Cannot read JSON ${file}: ${errorMessage(error)}`);
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}

async function ensureJsonFile(file, fallback) {
  try { await fs.access(file); }
  catch { await writeJson(file, fallback); }
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMeta(html, key) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  ];
  return firstMatch(html, patterns);
}

function extractTitle(html) {
  return firstMatch(html, [/<title\b[^>]*>([\s\S]*?)<\/title>/i]);
}

function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“"
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => named[name.toLowerCase()] ?? full);
}

function cleanText(value) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function normalizeNumberToken(value) {
  return String(value || "").replace(/,/g, "").trim();
}

function countCjkAndWords(value) {
  const text = String(value || "").trim();
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}

function fail(reason) { return { ok: false, reason }; }

function maxSnowflake(values) {
  const valid = values.filter(value => /^\d+$/.test(String(value || "")));
  if (!valid.length) return "";
  return valid.reduce((max, value) => compareSnowflakes(String(value), String(max)) > 0 ? String(value) : String(max), valid[0]);
}

function compareSnowflakes(a, b) {
  try {
    const aa = BigInt(String(a || "0"));
    const bb = BigInt(String(b || "0"));
    return aa === bb ? 0 : aa > bb ? 1 : -1;
  } catch {
    return String(a).localeCompare(String(b));
  }
}

function firstEnv(...names) {
  for (const name of names) {
    if (process.env[name]?.trim()) return process.env[name].trim();
  }
  return "";
}

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function floatEnv(name, fallback, min, max) {
  const value = Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function loadLocalEnv(file) {
  try {
    const raw = requireReadFileSync(file);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

function requireReadFileSync(file) {
  // Avoid an extra dependency and keep .env loading optional.
  return fsSync.readFileSync(file, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function escapeAttr(value) { return escapeHtml(value); }
function escapeXml(value) { return escapeHtml(value); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function safeJsonForHtml(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }

// Start only after all top-level constants (state maps and dedupe sets) are initialized.
await main();

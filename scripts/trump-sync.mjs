import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { upsertAutomatedArticle, upsertNewsCandidate, writeAutomationLog } from "./supabase-news.mjs";
import { accountsForTopic, sourceByAccount } from "./source-registry.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const TOPIC_DIR = path.join(ROOT, "topic", "trump");
const NEWS_DIR = path.join(ROOT, "news", "trump");
const NEWS_FILE = path.join(DATA_DIR, "trump-news.json");
const STATE_FILE = path.join(DATA_DIR, "trump-state.json");
const PENDING_FILE = path.join(DATA_DIR, "trump-pending.json");
const HOME_FILE = path.join(ROOT, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");

loadLocalEnv(path.join(ROOT, ".env.trump"));

const PRIMARY_ACCOUNTS = parseAccounts(
  process.env.TRUMP_PRIMARY_ACCOUNTS || "realDonaldTrump"
);
const AUTO_ACCOUNTS = mergeAccounts(
  parseAccounts(process.env.TRUMP_AUTO_ACCOUNTS || "realDonaldTrump,WhiteHouse,POTUS,PressSec,RapidResponse47,Reuters,AP,FoxNews,CNN,NBCNews,ABC,CBSNews,axios,politico,NewsNation,nytimes,washingtonpost"),
  accountsForTopic("trump", ROOT, ["A", "B"])
);
const REVIEW_ACCOUNTS = parseAccounts(
  process.env.TRUMP_REVIEW_ACCOUNTS || "Breaking911,CollinRugg"
);

const CONFIG = {
  xToken: firstEnv("X_BEARER_TOKEN", "X_API_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"),
  openAIKey: firstEnv("OPENAI_API_KEY"),
  openAIModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  siteUrl: normalizeSiteUrl(process.env.SITE_URL || "https://trrb.net"),
  queryOverride: String(process.env.TRUMP_QUERY || "").trim(),
  primaryAccounts: PRIMARY_ACCOUNTS,
  autoAccounts: AUTO_ACCOUNTS,
  reviewAccounts: REVIEW_ACCOUNTS,
  bootstrapLimit: intEnv("TRUMP_BOOTSTRAP_LIMIT", 60, 1, 300),
  maxProcessPerRun: intEnv("TRUMP_MAX_PROCESS_PER_RUN", 18, 1, 100),
  maxPages: intEnv("TRUMP_MAX_PAGES", 3, 1, 20),
  maxResultsPerQuery: intEnv("TRUMP_MAX_RESULTS_PER_QUERY", 50, 10, 100),
  lookbackHours: intEnv("TRUMP_LOOKBACK_HOURS", 48, 1, 168),
  minConfidence: intEnv("TRUMP_MIN_CONFIDENCE", 83, 0, 100),
  minRelevance: intEnv("TRUMP_MIN_RELEVANCE", 72, 0, 100),
  minCandidateScore: intEnv("TRUMP_MIN_CANDIDATE_SCORE", 50, 0, 100),
  maxPendingRetries: intEnv("TRUMP_MAX_PENDING_RETRIES", 5, 1, 20),
  pendingRetentionDays: intEnv("TRUMP_PENDING_RETENTION_DAYS", 30, 1, 365),
  pendingLimit: intEnv("TRUMP_PENDING_LIMIT", 500, 50, 5000),
  useXMedia: boolEnv("TRUMP_USE_X_MEDIA", true),
};

CONFIG.queryLanes = buildTrumpQueryLanes();

const CATEGORY_VALUES = [
  "白宫动态",
  "移民",
  "关税",
  "外交",
  "司法",
  "国会",
  "经济",
  "选举",
  "其他",
];

const VERIFIED_VALUES = ["official", "trusted_media", "unverified"];

const SUBJECTIVE_TERMS = [
  "震惊",
  "炸裂",
  "疯狂",
  "大快人心",
  "彻底翻车",
  "惊天",
  "铁腕",
  "横扫",
  "重磅出击",
  "严打",
  "丧心病狂",
  "令人发指",
];

const SYSTEM_PROMPT = `
你是唐人日报的中文新闻编辑。输入材料来自X平台公开帖子，主题是美国总统唐纳德·特朗普及其政府、政策、公开讲话、司法案件或选举活动。

硬性规则：
1. 只能使用输入帖子中明确出现的事实，不得自行补充背景、原因、动机、数字、日期、地点或法律结论。
2. 使用简体中文，新闻写实风格，不表达支持或反对特朗普的立场。
3. 标题准确克制，不使用“震惊、炸裂、疯狂、惊天、彻底翻车、铁腕、横扫”等情绪词。
4. summary为45至110个中文字符；body_paragraphs为2至3段，正文总量约160至360个中文字符。输入信息不足时宁可写短，不得凑字数。
5. 不复制大段英文原文，不使用Markdown，不写项目符号。
6. 涉及诉讼、调查、指控或刑事案件时，必须区分“被调查、被指控、被起诉、被定罪、被判刑”，不得混淆。
7. 对政策、行政命令、法律或法院裁决的描述，仅能写帖子明确说明的内容；没有正式文件链接时，不得声称已经生效。
8. 纯观点、辱骂、募款、广告、竞选口号、没有具体事实的信息，publishable必须为false，needs_review必须为true。
9. 官方账号对自身行动或声明的直接发布可标记official；路透、AP等成熟媒体的事实报道可标记trusted_media；匿名爆料或无法核实的信息标记unverified。
10. 若来源属于review或radar模式，即使内容看起来可信，也应将needs_review设为true。
11. relevance_score为0至100，衡量帖子是否包含特朗普本人、白宫、特朗普政府政策、正式讲话、司法案件、国会互动、外交、经济或选举的具体新闻事实；仅提到Trump标签、表达立场或发布表情包时不得高于55。
12. confidence为0至100的整数。资料不足、事实矛盾、上下文不完整或可能误导时，confidence应低于83。
13. title、summary和body_paragraphs不得加入输入中不存在的阿拉伯数字。
14. category只能从指定枚举中选择。
`.trim();

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "body_paragraphs",
    "category",
    "importance",
    "relevance_score",
    "publishable",
    "needs_review",
    "review_reason",
    "confidence",
    "verified_level",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    body_paragraphs: {
      type: "array",
      items: { type: "string" },
    },
    category: { type: "string", enum: CATEGORY_VALUES },
    importance: { type: "integer", minimum: 1, maximum: 10 },
    relevance_score: { type: "integer", minimum: 0, maximum: 100 },
    publishable: { type: "boolean" },
    needs_review: { type: "boolean" },
    review_reason: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    verified_level: { type: "string", enum: VERIFIED_VALUES },
  },
};

export async function main() {
  requireSecrets();
  await ensureStructure();
  await ensureHomeIntegration();

  const state = await readJson(STATE_FILE, defaultState());
  const news = await readJson(NEWS_FILE, []);
  let pending = expirePending(
    await readJson(PENDING_FILE, []),
    CONFIG.pendingRetentionDays
  );

  const publishedIds = new Set(news.map((item) => String(item.x_post_id || "")));
  const pendingIds = new Set(pending.map((item) => String(item.x_post_id || "")));

  const fetched = await fetchRecentPosts(state);
  const newPosts = fetched.posts.filter((post) => {
    const id = String(post.id);
    return !publishedIds.has(id) && !pendingIds.has(id);
  });

  // 新帖子全部先登记，避免推进游标后出现漏抓。超出本轮额度的帖子进入队列，下轮继续处理。
  for (const post of newPosts) {
    pending.push(makePendingEntry(post, "queue", "等待自动处理", 0));
    pendingIds.add(String(post.id));
  }

  pending = dedupePending(pending, publishedIds);

  const retryable = pending
    .filter((entry) => entry.kind !== "review")
    .filter((entry) => (entry.attempts || 0) < CONFIG.maxPendingRetries)
    .sort((a, b) => compareSnowflakes(a.x_post_id, b.x_post_id));

  const toProcess = retryable.slice(0, CONFIG.maxProcessPerRun);
  const processingIds = new Set(toProcess.map((entry) => String(entry.x_post_id)));
  const untouched = pending.filter((entry) => !processingIds.has(String(entry.x_post_id)));
  const nextPending = [...untouched];

  let publishedCount = 0;
  let reviewCount = 0;
  let retryCount = 0;
  let duplicateCount = 0;

  for (const entry of toProcess) {
    try {
      const result = await processPost(entry.post, news);

      if (result.status === "published") {
        publishedIds.add(String(entry.x_post_id));
        publishedCount += 1;
      } else if (result.status === "duplicate") {
        publishedIds.add(String(entry.x_post_id));
        duplicateCount += 1;
      } else {
        nextPending.push(
          makePendingEntry(
            entry.post,
            "review",
            result.reason || "需要人工复核",
            (entry.attempts || 0) + 1,
            result.ai || null
          )
        );
        reviewCount += 1;
      }
    } catch (error) {
      nextPending.push(
        makePendingEntry(
          entry.post,
          "retry",
          errorMessage(error),
          (entry.attempts || 0) + 1
        )
      );
      retryCount += 1;
    }
  }

  news.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  pending = trimPending(
    dedupePending(nextPending, publishedIds),
    CONFIG.pendingLimit
  );

  const newestId = fetched.newestId || maxSnowflake(fetched.posts.map((post) => post.id));
  const nextState = {
    ...state,
    last_seen_id: newestId ? maxSnowflake([state.last_seen_id, newestId]) : state.last_seen_id,
    query_cursors: fetched.queryCursors,
    last_run_at: new Date().toISOString(),
    last_content_at: publishedCount > 0 ? new Date().toISOString() : state.last_content_at,
    last_success_at: new Date().toISOString(),
    last_error: "",
    last_result: {
      fetched: fetched.posts.length,
      discovered: newPosts.length,
      processed: toProcess.length,
      published: publishedCount,
      review: reviewCount,
      retry: retryCount,
      duplicates: duplicateCount,
      total_published: news.length,
      total_pending: pending.length,
      query_lanes: fetched.laneStats,
    },
  };

  // 每个搜索通道使用独立游标；成功轮询后统一写入，避免某个高流量通道覆盖其他通道的进度。
  const writeNeeded = true;
  await writeJson(NEWS_FILE, news);
  await writeJson(PENDING_FILE, pending);
  await writeAutomationLog({
    pipeline: "trump-radar-v4",
    fetched: fetched.posts.length,
    processed: toProcess.length,
    published: publishedCount,
    drafted: reviewCount,
    duplicates: duplicateCount,
    failed: retryCount,
    details: { lane_stats: fetched.laneStats || [], total_news: news.length, total_pending: pending.length }
  });
  await updateSitemap(news, new Date().toISOString());
  await writeJson(STATE_FILE, nextState);

  console.log(
    JSON.stringify(
      {
        ...nextState.last_result,
        query_lanes: fetched.laneStats,
        wrote_files: writeNeeded,
      },
      null,
      2
    )
  );
}

function defaultState() {
  return {
    last_seen_id: "",
    query_cursors: {},
    last_run_at: "",
    last_success_at: "",
    last_content_at: "",
    last_error: "",
    last_result: {
      fetched: 0,
      discovered: 0,
      processed: 0,
      published: 0,
      review: 0,
      retry: 0,
      duplicates: 0,
      total_published: 0,
      total_pending: 0,
    },
  };
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
    fs.mkdir(TOPIC_DIR, { recursive: true }),
    fs.mkdir(NEWS_DIR, { recursive: true }),
  ]);
  await ensureJsonFile(NEWS_FILE, []);
  await ensureJsonFile(PENDING_FILE, []);
  await ensureJsonFile(STATE_FILE, defaultState());
}

async function ensureHomeIntegration() {
  let html;
  try {
    html = await fs.readFile(HOME_FILE, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const scriptTag = '<script src="/assets/trump-home-widget.js" defer></script>';
  if (!html.includes("/assets/trump-home-widget.js")) {
    html = html.includes("</body>")
      ? html.replace("</body>", `    ${scriptTag}\n</body>`)
      : `${html}\n${scriptTag}\n`;
  }

  const updateTrumpAnchor = (fragment) => fragment.replace(
    /<a\b([^>]*)>([\s\S]{0,600}?特朗普[\s\S]{0,600}?)<\/a>/i,
    (full, attrs, inner) => {
      let nextAttrs = attrs;
      if (/\bhref\s*=/.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(
          /\bhref\s*=\s*(["'])[^"']*\1/i,
          'href="/topic/trump/"'
        );
      } else {
        nextAttrs += ' href="/topic/trump/"';
      }
      return `<a${nextAttrs}>${inner}</a>`;
    }
  );

  // 只修改“专题聚焦”区域，避免首页其他特朗普新闻标题被误改成专题链接。
  let topicSectionUpdated = false;
  html = html.replace(
    /(<section\b[^>]*class\s*=\s*(["'])[^"']*\btopics\b[^"']*\2[^>]*>)([\s\S]*?)(<\/section>)/i,
    (full, open, quote, body, close) => {
      const updatedBody = updateTrumpAnchor(body);
      topicSectionUpdated = updatedBody !== body;
      return `${open}${updatedBody}${close}`;
    }
  );

  // 兼容其他模板：仅允许显式data-trump-live元素作为后备目标。
  if (!topicSectionUpdated) {
    html = html.replace(
      /<a\b([^>]*\bdata-trump-live\b[^>]*)>([\s\S]*?)<\/a>/i,
      (full, attrs, inner) => updateTrumpAnchor(`<a${attrs}>${inner}</a>`)
    );
  }

  await fs.writeFile(HOME_FILE, html, "utf8");
}

export function buildTrumpQueryLanes() {
  if (CONFIG.queryOverride) {
    return [{ id: "override", label: "自定义搜索", query: validateTrumpQuery(CONFIG.queryOverride) }];
  }

  const officialNames = new Set(["realdonaldtrump", "whitehouse", "potus", "presssec", "rapidresponse47"]);
  const officialAccounts = [...new Set([
    ...CONFIG.primaryAccounts,
    ...CONFIG.autoAccounts.filter(account => officialNames.has(account.toLowerCase()))
  ])];
  const mediaAccounts = [...new Set(CONFIG.autoAccounts)]
    .filter(account => !officialNames.has(account.toLowerCase()));
  const lanes = [];

  if (officialAccounts.length) {
    lanes.push({
      id: "official",
      label: "特朗普与白宫官方",
      query: validateTrumpQuery(`(${officialAccounts.map(account => `from:${account}`).join(" OR ")}) -is:retweet lang:en`),
    });
  }

  const mediaTerms = '(Trump OR "Donald Trump" OR "President Trump" OR "Trump administration" OR "White House")';
  for (const [index, accounts] of chunkTrumpAccounts(mediaAccounts, mediaTerms, 450).entries()) {
    lanes.push({
      id: `trusted-${index + 1}`,
      label: "主流媒体",
      query: validateTrumpQuery(`((${accounts.map(account => `from:${account}`).join(" OR ")}) ${mediaTerms}) -is:retweet -is:reply lang:en`),
    });
  }

  if (CONFIG.reviewAccounts.length) {
    for (const [index, accounts] of chunkTrumpAccounts(CONFIG.reviewAccounts, mediaTerms, 450).entries()) {
      lanes.push({
        id: `review-${index + 1}`,
        label: "观察账号",
        query: validateTrumpQuery(`((${accounts.map(account => `from:${account}`).join(" OR ")}) ${mediaTerms}) -is:retweet -is:reply lang:en`),
      });
    }
  }

  lanes.push({
    id: "radar",
    label: "全网雷达",
    query: validateTrumpQuery('(\"President Trump\" OR \"Trump administration\" OR \"Trump announced\" OR \"Trump signed\" OR \"Trump said\" OR \"Trump ordered\" OR \"White House announced\" OR \"Donald Trump\") -is:retweet -is:reply lang:en'),
  });
  return lanes;
}

function validateTrumpQuery(query) {
  const value = String(query || "").trim();
  if (!value) throw new Error("Trump X query is empty.");
  if (value.length > 500) throw new Error(`Trump X query is too long (${value.length} characters).`);
  return value;
}

function chunkTrumpAccounts(accounts, terms, targetLength) {
  const chunks = [];
  let current = [];
  for (const account of accounts) {
    const trial = [...current, account];
    const query = `((${trial.map(value => `from:${value}`).join(" OR ")}) ${terms}) -is:retweet -is:reply lang:en`;
    if (current.length && query.length > targetLength) {
      chunks.push(current);
      current = [account];
    } else {
      current = trial;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function sourceProfileForTrump(username) {
  const value = String(username || "").toLowerCase();
  if (CONFIG.primaryAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "auto", tier: "official", weight: 100 };
  }
  if (["whitehouse", "potus", "presssec", "rapidresponse47"].includes(value)) {
    return { mode: "auto", tier: "official", weight: 98 };
  }
  if (CONFIG.autoAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "auto", tier: "trusted_media", weight: 88 };
  }
  if (CONFIG.reviewAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "review", tier: "review_source", weight: 62 };
  }
  return { mode: "review", tier: "other_source", weight: 45 };
}

function scoreTrumpCandidate(post) {
  const text = String(post.text || "");
  const matched = [];
  let score = Math.round(Number(post.source_weight || 0) * 0.38);
  const tests = [
    [/(?:\bTrump\b|Donald Trump|President Trump)/i, 30, "特朗普"],
    [/(?:White House|Trump administration|POTUS|President of the United States)/i, 18, "白宫/政府"],
    [/(?:announc(?:ed|es|ing)|sign(?:ed|s|ing)|order(?:ed|s|ing)|said|meeting|speech|executive order|policy|tariff|immigration|court|Congress|Senate|House|election|campaign|sanction|ceasefire|budget)/i, 25, "具体事件"],
    [/(?:today|tonight|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|July|August|September|October|November|December|January|February|March|April|May|June|\d)/i, 8, "时间/数字"],
  ];
  for (const [regex, points, label] of tests) {
    if (regex.test(text)) {
      score += points;
      matched.push(label);
    }
  }
  const metrics = post.public_metrics || {};
  const engagement = Number(metrics.like_count || 0) + Number(metrics.retweet_count || 0) * 2 + Number(metrics.reply_count || 0);
  if (engagement >= 5000) score += 8;
  else if (engagement >= 500) score += 5;
  else if (engagement >= 50) score += 2;
  if (post.source_tier === "official" && matched.length) score = Math.max(score, 78);
  if (post.source_tier === "trusted_media" && matched.includes("特朗普") && matched.includes("具体事件")) score = Math.max(score, 74);
  return { score: Math.max(0, Math.min(100, score)), matched_terms: matched };
}

export async function fetchRecentPosts(stateOrSinceId = {}) {
  const state = typeof stateOrSinceId === "string"
    ? { last_seen_id: stateOrSinceId, query_cursors: {} }
    : (stateOrSinceId || {});
  const previousCursors = state.query_cursors && typeof state.query_cursors === "object"
    ? state.query_cursors
    : {};
  const nextCursors = { ...previousCursors };
  const collected = [];
  const laneStats = [];
  const laneErrors = [];
  let successfulLanes = 0;

  for (const lane of CONFIG.queryLanes) {
    const legacyCursor = lane.id === "official" ? String(state.last_seen_id || "") : "";
    const cursor = String(previousCursors[lane.id] || legacyCursor || "");
    try {
      const result = await fetchTrumpQueryLane(lane, cursor);
      collected.push(...result.posts);
      if (result.cursor && !result.truncated) nextCursors[lane.id] = result.cursor;
      laneStats.push({ id: lane.id, label: lane.label, fetched: result.posts.length, truncated: result.truncated });
      successfulLanes += 1;
    } catch (error) {
      const status = Number(error?.status || 0);
      const message = errorMessage(error);
      laneErrors.push({ id: lane.id, status, message });
      laneStats.push({ id: lane.id, label: lane.label, fetched: 0, status, error: message });
      console.error(`Trump query lane ${lane.id} failed:`, message);
    }
  }

  if (!successfulLanes) {
    const transientStatuses = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
    const allTransient = laneErrors.length > 0 && laneErrors.every(item => transientStatuses.has(item.status));
    if (allTransient) {
      console.warn("All Trump X search lanes are temporarily unavailable; preserving cursors and continuing with the existing pending queue.");
      return {
        posts: [],
        newestId: "",
        queryCursors: nextCursors,
        laneStats,
        xUnavailable: true,
      };
    }
    const summary = laneErrors.map(item => `${item.id}:${item.status || "network"}`).join(", ");
    throw new Error(`All Trump X search lanes failed (${summary}).`);
  }

  let posts = dedupePosts(collected)
    .filter(post => Number(post.candidate_score || 0) >= CONFIG.minCandidateScore);
  // 初次启用也将全部候选写入pending池，不因bootstrap截断而漏掉已抓到的帖子。
  posts.sort((a, b) => compareSnowflakes(a.id, b.id));

  return {
    posts,
    newestId: maxSnowflake(posts.map(post => post.id)),
    queryCursors: nextCursors,
    laneStats,
  };
}

async function fetchTrumpQueryLane(lane, sinceId) {
  const collected = [];
  let nextToken = "";
  let pages = 0;
  let newestId = "";
  let truncated = false;

  do {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", lane.query);
    url.searchParams.set("max_results", String(CONFIG.maxResultsPerQuery));
    url.searchParams.set("sort_order", "recency");
    url.searchParams.set("tweet.fields", "created_at,entities,attachments,lang,possibly_sensitive,public_metrics,author_id");
    url.searchParams.set("expansions", "attachments.media_keys,author_id");
    url.searchParams.set("media.fields", "url,preview_image_url,type,alt_text,width,height");
    url.searchParams.set("user.fields", "username,name,verified,verified_type,public_metrics");
    if (sinceId) {
      url.searchParams.set("since_id", String(sinceId));
    } else {
      url.searchParams.set("start_time", toXApiDateTime(Date.now() - CONFIG.lookbackHours * 60 * 60 * 1000));
    }
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const response = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${CONFIG.xToken}` } },
      30000,
      3
    );
    const payload = await readResponseJson(response, `X API (${lane.id})`);
    if (!newestId) newestId = String(payload.meta?.newest_id || "");
    const userMap = new Map((payload.includes?.users || []).map(user => [String(user.id), user]));
    const mediaMap = new Map((payload.includes?.media || []).map(item => [item.media_key, item]));

    for (const item of payload.data || []) {
      const author = userMap.get(String(item.author_id || ""));
      if (!author?.username) continue;
      const profile = sourceProfileForTrump(author.username);
      const media = (item.attachments?.media_keys || [])
        .map(key => mediaMap.get(key))
        .filter(Boolean)
        .map(entry => ({
          type: entry.type,
          url: entry.url || entry.preview_image_url || "",
          alt_text: entry.alt_text || "",
          width: entry.width || 0,
          height: entry.height || 0,
        }));
      const post = {
        id: String(item.id),
        text: String(item.text || ""),
        created_at: item.created_at || new Date().toISOString(),
        lang: item.lang || "",
        possibly_sensitive: Boolean(item.possibly_sensitive),
        entities: item.entities || {},
        media,
        public_metrics: item.public_metrics || {},
        author: {
          id: String(author.id || ""),
          name: String(author.name || author.username),
          username: String(author.username),
          verified: Boolean(author.verified),
          verified_type: String(author.verified_type || ""),
        },
        source_mode: profile.mode,
        source_tier: profile.tier,
        source_weight: profile.weight,
        query_lane: lane.id,
        query_label: lane.label,
        x_url: `https://x.com/${author.username}/status/${item.id}`,
      };
      const scored = scoreTrumpCandidate(post);
      post.candidate_score = scored.score;
      post.matched_terms = scored.matched_terms;
      collected.push(post);
    }

    nextToken = String(payload.meta?.next_token || "");
    pages += 1;
    if (nextToken && pages >= CONFIG.maxPages) {
      truncated = true;
      break;
    }
  } while (nextToken);

  return { posts: collected, cursor: newestId || maxSnowflake(collected.map(post => post.id)), truncated };
}

async function processPost(post, news) {
  const sourceText = buildSourceText(post);
  const ai = await rewriteWithOpenAI(sourceText, post);
  const validation = validateArticle(ai, sourceText, post);

  if (!validation.ok) {
    await syncTrumpCmsArticle(post, ai, "draft", validation.reason);
    return { status: "review", reason: validation.reason, ai };
  }

  if (post.source_mode === "review") {
    const reason = ai.review_reason || "该来源按规则需要人工复核";
    await syncTrumpCmsArticle(post, ai, "draft", reason);
    return { status: "review", reason, ai };
  }

  if (!ai.publishable || ai.needs_review || ai.confidence < CONFIG.minConfidence) {
    const reason = ai.review_reason || `未达到自动发布标准（confidence=${ai.confidence}）`;
    await syncTrumpCmsArticle(post, ai, "draft", reason);
    return { status: "review", reason, ai };
  }

  const contentHash = createContentHash(ai.title, ai.summary);
  const duplicate = findContentDuplicate(news, ai.title, ai.summary, post.created_at);
  if (duplicate) {
    return {
      status: "duplicate",
      reason: `与已发布内容重复：${duplicate.id}`,
    };
  }

  const dateParts = newYorkDateParts(post.created_at);
  const relativeUrl = `/news/trump/${dateParts.year}/${dateParts.month}/${dateParts.day}/trump-${post.id}.html`;
  const filePath = path.join(
    NEWS_DIR,
    dateParts.year,
    dateParts.month,
    dateParts.day,
    `trump-${post.id}.html`
  );

  const imageUrl = CONFIG.useXMedia ? firstUsableMedia(post.media) : "";
  const item = {
    id: `trump-${post.id}`,
    x_post_id: post.id,
    title: cleanText(ai.title),
    summary: cleanText(ai.summary),
    body_paragraphs: ai.body_paragraphs.map(cleanText),
    category: ai.category,
    importance: ai.importance,
    relevance_score: ai.relevance_score,
    published_at: post.created_at,
    updated_at: new Date().toISOString(),
    url: relativeUrl,
    source_name: post.author.name,
    source_username: post.author.username,
    source_url: post.x_url,
    image_url: imageUrl,
    confidence: ai.confidence,
    verified_level: ai.verified_level,
    source_mode: post.source_mode,
    source_tier: post.source_tier,
    source_weight: post.source_weight,
    candidate_score: post.candidate_score,
    matched_terms: post.matched_terms || [],
    query_lane: post.query_lane || "",
    content_hash: contentHash,
  };

  const html = renderArticle(item, dateParts);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, html, "utf8");

  const existingIndex = news.findIndex(
    (entry) => String(entry.x_post_id) === String(post.id)
  );
  if (existingIndex >= 0) news[existingIndex] = item;
  else news.push(item);

  await syncTrumpCmsArticle(post, ai, "published", "");
  return { status: "published", item };
}

async function syncTrumpCmsArticle(post, ai, status, reviewReason) {
  const articleResult = await upsertAutomatedArticle({
    externalId: `x-trump-${post.id}`,
    automationSource: "trump-radar-v4",
    title: cleanText(ai?.title || "特朗普动态"),
    summary: cleanText(ai?.summary || ""),
    bodyParagraphs: Array.isArray(ai?.body_paragraphs) ? ai.body_paragraphs.map(cleanText) : [],
    categoryName: "特朗普动态",
    primarySection: "特朗普动态",
    relatedSections: [],
    coverImage: CONFIG.useXMedia ? firstUsableMedia(post.media) : "",
    sourceUrl: post.x_url,
    sourceName: post.author?.name || post.author_name || "公开来源",
    sourceAccount: post.author?.username || post.author_username || "",
    sourceLevel: post.source_tier || ai?.verified_level || "",
    confidence: ai?.confidence || 0,
    reviewReason,
    status,
    publishedAt: post.created_at,
    countInIceStats: false,
    tags: [ai?.category, "特朗普"].filter(Boolean),
    riskFlags: ai?.needs_review ? ["needs_review"] : [],
  });
  await upsertNewsCandidate({
    externalId: `x-trump-${post.id}`,
    pipeline: "trump-radar-v4",
    sourceUrl: post.x_url,
    sourceAccount: post.author?.username || post.author_username || "",
    sourceName: post.author?.name || post.author_name || "公开来源",
    sourceLevel: post.source_tier || ai?.verified_level || "",
    rawText: post.text || "",
    rawPayload: { id: post.id, created_at: post.created_at, query_lane: post.query_lane || "", media: post.media || [] },
    aiPayload: ai || {},
    proposedSection: "特朗普动态",
    confidence: ai?.confidence || 0,
    decision: status === "published" ? "published" : "draft",
    decisionReason: reviewReason || "",
    articleId: articleResult.article?.id || null,
    collectedAt: post.created_at || new Date().toISOString(),
    processedAt: new Date().toISOString(),
  });
  return articleResult;
}

async function rewriteWithOpenAI(sourceText, post) {
  const payload = {
    model: CONFIG.openAIModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `来源模式：${post.source_mode}
来源层级：${post.source_tier}
来源权重：${post.source_weight}
候选评分：${post.candidate_score}
搜索通道：${post.query_label || post.query_lane || "X雷达"}

请先判断是否属于特朗普实时新闻，再根据以下材料生成中文新闻稿。只能依据材料本身，不得补充外部事实。

${sourceText}`,
          },
        ],
      },
    ],
    max_output_tokens: 1800,
    text: {
      format: {
        type: "json_schema",
        name: "trrb_trump_news",
        description: "特朗普实时动态中文新闻结构",
        strict: true,
        schema: ARTICLE_SCHEMA,
      },
    },
  };

  const response = await fetchWithRetry(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONFIG.openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    60000,
    3
  );

  const json = await readResponseJson(response, "OpenAI Responses API");
  const outputText = extractOpenAIOutputText(json);
  if (!outputText) throw new Error("OpenAI returned no output_text.");

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(`OpenAI结构化输出无法解析：${errorMessage(error)}`);
  }
  return parsed;
}

export function validateArticle(ai, sourceText, post) {
  const fail = (reason) => ({ ok: false, reason });
  if (!ai || typeof ai !== "object") return fail("AI输出不是对象");

  const title = cleanText(ai.title || "");
  const summary = cleanText(ai.summary || "");
  const paragraphs = Array.isArray(ai.body_paragraphs)
    ? ai.body_paragraphs.map(cleanText).filter(Boolean)
    : [];
  const allOutput = `${title}\n${summary}\n${paragraphs.join("\n")}`;

  if (title.length < 8 || title.length > 80) return fail("标题长度不合格");
  if (summary.length < 25 || summary.length > 180) return fail("摘要长度不合格");
  if (paragraphs.length < 2 || paragraphs.length > 3) return fail("正文段落数不合格");
  const bodyLength = paragraphs.join("").length;
  if (bodyLength < 90 || bodyLength > 650) return fail("正文长度不合格");
  if (!CATEGORY_VALUES.includes(ai.category)) return fail("分类不在允许范围");
  if (!VERIFIED_VALUES.includes(ai.verified_level)) return fail("核实级别不合法");
  if (!Number.isInteger(ai.importance) || ai.importance < 1 || ai.importance > 10) {
    return fail("重要程度不合法");
  }
  if (!Number.isInteger(ai.relevance_score) || ai.relevance_score < CONFIG.minRelevance || ai.relevance_score > 100) {
    return fail(`特朗普新闻相关度低于${CONFIG.minRelevance}`);
  }
  if (!Number.isInteger(ai.confidence) || ai.confidence < 0 || ai.confidence > 100) {
    return fail("置信度不合法");
  }
  if (SUBJECTIVE_TERMS.some((term) => allOutput.includes(term))) {
    return fail("稿件包含禁止使用的情绪词");
  }
  if (post.possibly_sensitive) return fail("X将该帖子标记为敏感内容");
  if (!String(post.text || "").trim()) return fail("原帖没有可核实文字");

  const sourceNumbers = extractGroundedNumbers(post.text);
  const outputNumbers = [
    ...new Set((allOutput.match(/\d[\d,.:%$%-]*/g) || []).map(normalizeNumberToken)),
  ];
  const invented = outputNumbers.filter(
    (number) => number && !sourceNumbers.has(number)
  );
  if (invented.length) {
    return fail(`稿件出现来源中不存在的数字：${invented.join(", ")}`);
  }

  if (post.source_mode === "auto" && ai.verified_level === "unverified") {
    return fail("自动来源却被模型判断为未核实");
  }

  return { ok: true, reason: "" };
}

function renderArticle(item, dateParts) {
  const articleDate = `${Number(dateParts.month)}月${Number(dateParts.day)}日`;
  const body = item.body_paragraphs
    .map((paragraph, index) => {
      const prefix = index === 0 ? `唐人日报${articleDate}讯：` : "";
      return `<p>${escapeHtml(prefix + paragraph)}</p>`;
    })
    .join("\n");

  const image = item.image_url
    ? `<figure class="article-image"><img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>图片来源：${escapeHtml(item.source_name)}公开X内容</figcaption></figure>`
    : "";

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
    image: item.image_url ? [item.image_url] : undefined,
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(item.title)} - 唐人日报</title>
  <meta name="description" content="${escapeAttr(item.summary)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="stylesheet" href="/assets/trump-topic.css">
  <script type="application/ld+json">${safeJsonForHtml(jsonLd)}</script>
</head>
<body>
  <header class="trrb-header">
    <div class="trrb-header-inner">
      <a class="trrb-brand" href="/">唐人日报</a>
      <a class="trrb-channel" href="/topic/trump/">特朗普实时动态</a>
    </div>
  </header>

  <main class="article-shell">
    <nav class="breadcrumb"><a href="/">首页</a><span>›</span><a href="/topic/trump/">特朗普实时动态</a></nav>
    <article class="news-article">
      <div class="article-kicker">${escapeHtml(item.category)}</div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="article-meta">
        <time datetime="${escapeAttr(item.published_at)}">${escapeHtml(formatChineseDateTime(item.published_at))}</time>
        <span>来源：${escapeHtml(item.source_name)}</span>
      </div>
      <p class="article-summary">${escapeHtml(item.summary)}</p>
      ${image}
      <div class="article-body">${body}</div>
      <aside class="source-box">
        <strong>原始信息</strong>
        <div class="source-links"><a href="${escapeAttr(item.source_url)}" target="_blank" rel="noopener noreferrer">查看X原帖</a></div>
        <p>本文根据公开信息整理。政策、行政命令、法律和司法文件的效力，以相关机构正式文件为准。</p>
      </aside>
    </article>
    <div class="back-topic"><a href="/topic/trump/">返回特朗普实时动态</a></div>
  </main>
</body>
</html>`;
}

async function updateSitemap(news, nowIso) {
  const topicUrl = `${CONFIG.siteUrl}/topic/trump/`;
  const newest = news.slice(0, 100);
  const additions = [
    { loc: topicUrl, lastmod: nowIso.slice(0, 10) },
    ...newest.map((item) => ({
      loc: `${CONFIG.siteUrl}${item.url}`,
      lastmod: String(item.updated_at || item.published_at).slice(0, 10),
    })),
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
    const locPattern = new RegExp(
      `<url>\\s*<loc>${escapeRegExp(escapedLoc)}<\\/loc>[\\s\\S]*?<\\/url>`,
      "i"
    );
    const block = `  <url>\n    <loc>${escapedLoc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`;
    if (locPattern.test(xml)) xml = xml.replace(locPattern, block);
    else xml = xml.replace(/<\/urlset>/i, `${block}\n</urlset>`);
  }

  await fs.writeFile(SITEMAP_FILE, xml, "utf8");
}

function buildSourceText(post) {
  return [
    `X账号：@${post.author.username}`,
    `账号名称：${post.author.name}`,
    `来源模式：${post.source_mode}`,
    `来源层级：${post.source_tier || "other_source"}`,
    `来源权重：${post.source_weight || 0}`,
    `搜索通道：${post.query_label || post.query_lane || "X雷达"}`,
    `候选评分：${post.candidate_score || 0}`,
    `匹配要素：${(post.matched_terms || []).join("、") || "未标注"}`,
    `X帖子ID：${post.id}`,
    `X发布时间（UTC）：${post.created_at}`,
    `X原帖链接：${post.x_url}`,
    `X原文：\n${post.text.trim()}`,
  ].join("\n\n");
}
function sourceModeForUsername(username) {
  const value = String(username || "").toLowerCase();
  // primary账号始终视为自动来源，避免用户只修改PRIMARY列表却忘记同步AUTO列表时漏抓。
  if (CONFIG.primaryAccounts.some((account) => account.toLowerCase() === value)) return "auto";
  if (CONFIG.autoAccounts.some((account) => account.toLowerCase() === value)) return "auto";
  if (CONFIG.reviewAccounts.some((account) => account.toLowerCase() === value)) return "review";
  return "review";
}

export function buildDefaultQuery(primaryAccounts, autoAccounts, reviewAccounts) {
  const primary = [...new Set(primaryAccounts.map(stripAt).filter(Boolean))];
  const primarySet = new Set(primary.map((value) => value.toLowerCase()));
  const secondary = [...new Set([...autoAccounts, ...reviewAccounts].map(stripAt).filter(Boolean))]
    .filter((value) => !primarySet.has(value.toLowerCase()));

  const parts = [];
  if (primary.length) {
    parts.push(`(${primary.map((account) => `from:${account}`).join(" OR ")})`);
  }
  if (secondary.length) {
    const sources = secondary.map((account) => `from:${account}`).join(" OR ");
    parts.push(`((${sources}) (Trump OR \"Donald Trump\" OR \"President Trump\"))`);
  }

  if (!parts.length) throw new Error("Trump source account list is empty.");
  const query = `(${parts.join(" OR ")}) -is:retweet -is:reply`;
  if (query.length > 500) {
    throw new Error(`TRUMP_QUERY is too long (${query.length} characters).`);
  }
  return query;
}

function makePendingEntry(post, kind, reason, attempts, ai = null) {
  return {
    id: `pending-trump-${post.id}`,
    x_post_id: String(post.id),
    kind,
    reason: String(reason || "未知原因").slice(0, 500),
    attempts,
    created_at: new Date().toISOString(),
    source_mode: post?.source_mode || "",
    source_tier: post?.source_tier || "",
    source_weight: post?.source_weight || 0,
    candidate_score: post?.candidate_score || 0,
    query_lane: post?.query_lane || "",
    ai,
    post,
  };
}

function expirePending(items, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const created = Date.parse(item.created_at || item.post?.created_at || "");
    return !Number.isFinite(created) || created >= cutoff;
  });
}

function trimPending(items, limit) {
  const operational = items.filter((item) => item.kind !== "review");
  const reviews = items
    .filter((item) => item.kind === "review")
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
  const remaining = Math.max(0, limit - operational.length);
  return [...operational, ...reviews.slice(0, remaining)];
}

function dedupePending(items, publishedIds) {
  const map = new Map();
  for (const item of items) {
    const id = String(item.x_post_id || item.post?.id || "");
    if (!id || publishedIds.has(id)) continue;
    const previous = map.get(id);
    if (!previous) {
      map.set(id, item);
      continue;
    }
    const rank = { review: 3, retry: 2, queue: 1 };
    const currentRank = rank[item.kind] || 0;
    const previousRank = rank[previous.kind] || 0;
    if (currentRank > previousRank || (item.attempts || 0) > (previous.attempts || 0)) {
      map.set(id, item);
    }
  }
  return [...map.values()].sort((a, b) => compareSnowflakes(a.x_post_id, b.x_post_id));
}

function findContentDuplicate(news, title, summary, publishedAt) {
  const cutoff = Date.parse(publishedAt) - 48 * 60 * 60 * 1000;
  const candidateHash = createContentHash(title, summary);
  const candidateTokens = contentTokens(`${title} ${summary}`);
  for (const item of news) {
    const timestamp = Date.parse(item.published_at || "");
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
    if (item.content_hash && item.content_hash === candidateHash) return item;
    const score = jaccard(candidateTokens, contentTokens(`${item.title || ""} ${item.summary || ""}`));
    // 仅合并非常接近的改写，避免把同主题下涉及不同地点、人物或政策的帖子误判为重复。
    if (score >= 0.92) return item;
  }
  return null;
}

export function contentTokens(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, " ")
    .trim();
  const tokens = new Set();
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > 1) tokens.add(word);
  }
  const cjk = [...text.replace(/[^\u3400-\u9fff]/g, "")];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    tokens.add(cjk[index] + cjk[index + 1]);
  }
  return tokens;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function createContentHash(title, summary) {
  return crypto
    .createHash("sha256")
    .update(`${cleanText(title).toLowerCase()}|${cleanText(summary).toLowerCase()}`)
    .digest("hex");
}

function dedupePosts(posts) {
  const map = new Map();
  for (const post of posts) map.set(String(post.id), post);
  return [...map.values()];
}

function firstUsableMedia(media = []) {
  const item = media.find(
    (entry) => entry.url && ["photo", "video", "animated_gif"].includes(entry.type)
  );
  return item?.url || "";
}

function extractOpenAIOutputText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  for (const item of json.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text.trim();
      }
    }
  }
  return "";
}

async function fetchWithRetry(url, options = {}, timeoutMs = 30000, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (
        response.status === 429 ||
        response.status === 408 ||
        response.status >= 500
      ) {
        if (attempt >= attempts) return response;
        const retryAfter = Number.parseInt(response.headers.get("retry-after") || "0", 10);
        await response.text().catch(() => "");
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) throw error;
      await sleep(1000 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Request failed.");
}

async function readResponseJson(response, label) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `${label} returned non-JSON response (${response.status}): ${text.slice(0, 300)}`
    );
  }
  if (!response.ok) {
    const detail =
      json?.detail ||
      json?.error?.message ||
      json?.errors?.[0]?.detail ||
      json?.title ||
      text.slice(0, 300);
    const error = new Error(`${label} request failed (${response.status}): ${detail}`);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after") || "";
    throw error;
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
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, fallback);
  }
}

function loadLocalEnv(file) {
  try {
    const text = fsSync.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // 本地环境文件可选。
  }
}

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function mergeAccounts(...groups) {
  return [...new Set(groups.flat().map(v => String(v || "").replace(/^@/, "").trim()).filter(Boolean))];
}

function parseAccounts(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map(stripAt)
        .filter(Boolean)
    ),
  ];
}

function stripAt(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function boolEnv(name, fallback) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractGroundedNumbers(value) {
  const text = String(value || "");
  const numbers = new Set(
    (text.match(/\d[\d,.:%$%-]*/g) || []).map(normalizeNumberToken)
  );

  const months = {
    january: "1", february: "2", march: "3", april: "4", may: "5", june: "6",
    july: "7", august: "8", september: "9", october: "10", november: "11", december: "12"
  };
  for (const [name, number] of Object.entries(months)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) numbers.add(number);
  }

  const smallNumberWords = {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11",
    twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16",
    seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20"
  };
  for (const [name, number] of Object.entries(smallNumberWords)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) numbers.add(number);
  }

  return numbers;
}

function normalizeNumberToken(value) {
  return String(value || "").replace(/,/g, "").trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function newYorkDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
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
    hour12: false,
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(map.year)}/${Number(map.month)}/${Number(map.day)} ${map.hour}:${map.minute}:${map.second}`;
}

function toXApiDateTime(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isWithinHours(value, hours) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp >= Date.now() - hours * 60 * 60 * 1000;
}

export function compareSnowflakes(a, b) {
  try {
    const left = BigInt(String(a || "0"));
    const right = BigInt(String(b || "0"));
    return left < right ? -1 : left > right ? 1 : 0;
  } catch {
    return String(a || "").localeCompare(String(b || ""));
  }
}

function maxSnowflake(values) {
  return values.filter(Boolean).reduce((max, value) => {
    return compareSnowflakes(value, max) > 0 ? String(value) : String(max || "");
  }, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "请求超时";
  return String(error?.message || error || "未知错误").slice(0, 800);
}


const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(async (error) => {
    const message = errorMessage(error);
    console.error(message);
    try {
      const state = await readJson(STATE_FILE, defaultState());
      await writeJson(STATE_FILE, {
        ...state,
        last_error: message,
      });
    } catch (stateError) {
      console.error(`Could not write failure state: ${errorMessage(stateError)}`);
    }
    process.exitCode = 1;
  });
}

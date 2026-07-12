import path from "node:path";
import {
  DATA_DIR, readJson, writeJsonAtomic, dedupeByKey, isoNow, sleep
} from "./ice-utils.mjs";

const CANDIDATES_FILE = path.join(DATA_DIR, "ice-candidates.json");
const STATE_FILE = path.join(DATA_DIR, "ice-state.json");

const CONFIG = {
  token: firstEnv("X_BEARER_TOKEN", "X_API_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"),
  lookbackHours: intEnv("ICE_LOOKBACK_HOURS", 48, 1, 168),
  maxPages: intEnv("ICE_MAX_PAGES_PER_QUERY", 2, 1, 5),
  maxResults: intEnv("ICE_MAX_RESULTS_PER_QUERY", 50, 10, 100),
  maxCandidates: intEnv("ICE_MAX_NEW_POSTS", 120, 1, 500),
};

const LANES = [
  {
    id: "official",
    label: "ICE与HSI官方",
    query: '(from:ICEgov OR from:HSI_HQ OR from:DHSgov OR from:CBP) -is:retweet -is:reply lang:en'
  },
  {
    id: "media",
    label: "主流媒体",
    query: '((from:Reuters OR from:AP OR from:CNN OR from:NBCNews OR from:ABC OR from:CBSNews OR from:axios OR from:politico) (ICE OR "immigration agents" OR deportation OR detained OR arrested)) -is:retweet -is:reply lang:en'
  },
  {
    id: "radar-en",
    label: "英文公开雷达",
    query: '("ICE agents" OR "ICE raid" OR "ICE arrested" OR "ICE detained" OR "Immigration and Customs Enforcement") -is:retweet -is:reply lang:en'
  },
  {
    id: "radar-es",
    label: "西语社区雷达",
    query: '("agentes de ICE" OR "redada de ICE" OR "detenido por ICE" OR "arrestado por ICE" OR "deportación de ICE") -is:retweet -is:reply lang:es'
  }
];

export async function fetchIceCandidates() {
  if (!CONFIG.token) throw new Error("Missing X_BEARER_TOKEN.");

  const state = await readJson(STATE_FILE, {
    query_cursors: {},
    last_fetch_at: "",
    last_fetch_result: {}
  });

  const collected = [];
  const laneStats = [];
  const nextCursors = { ...(state.query_cursors || {}) };

  for (const lane of LANES) {
    try {
      const result = await fetchLane(lane, String(nextCursors[lane.id] || ""));
      collected.push(...result.posts);
      if (result.newestId) nextCursors[lane.id] = result.newestId;
      laneStats.push({ id: lane.id, fetched: result.posts.length });
    } catch (error) {
      laneStats.push({ id: lane.id, fetched: 0, error: error.message });
    }
  }

  const ranked = dedupeByKey(collected)
    .map(post => ({ ...post, candidate_score: scoreCandidate(post) }))
    .filter(post => post.candidate_score >= 50)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, CONFIG.maxCandidates);

  const existing = await readJson(CANDIDATES_FILE, []);
  const merged = dedupeByKey([...ranked, ...existing])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 500);

  await writeJsonAtomic(CANDIDATES_FILE, merged);
  await writeJsonAtomic(STATE_FILE, {
    ...state,
    query_cursors: nextCursors,
    last_fetch_at: isoNow(),
    last_fetch_result: {
      fetched: collected.length,
      accepted: ranked.length,
      total_candidates: merged.length,
      lanes: laneStats
    }
  });

  return { candidates: merged, laneStats };
}

async function fetchLane(lane, sinceId) {
  const posts = [];
  let nextToken = "";
  let newestId = "";

  for (let page = 0; page < CONFIG.maxPages; page += 1) {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", lane.query);
    url.searchParams.set("max_results", String(CONFIG.maxResults));
    url.searchParams.set("sort_order", "recency");
    url.searchParams.set("tweet.fields", "created_at,entities,attachments,lang,possibly_sensitive,public_metrics,author_id");
    url.searchParams.set("expansions", "attachments.media_keys,author_id");
    url.searchParams.set("media.fields", "url,preview_image_url,type,alt_text,width,height");
    url.searchParams.set("user.fields", "username,name,verified,verified_type");
    if (sinceId) url.searchParams.set("since_id", sinceId);
    else url.searchParams.set("start_time", new Date(Date.now() - CONFIG.lookbackHours * 3600000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const payload = await fetchX(url);
    newestId ||= String(payload.meta?.newest_id || "");

    const mediaMap = new Map((payload.includes?.media || []).map(item => [item.media_key, item]));
    const userMap = new Map((payload.includes?.users || []).map(item => [String(item.id), item]));

    for (const tweet of payload.data || []) {
      const author = userMap.get(String(tweet.author_id || "")) || {};
      if (!author.username) continue;
      posts.push({
        id: String(tweet.id),
        x_post_id: String(tweet.id),
        text: String(tweet.text || ""),
        created_at: tweet.created_at || isoNow(),
        source_url: `https://x.com/${author.username}/status/${tweet.id}`,
        source_account: author.username,
        source_name: author.name || author.username,
        source_lane: lane.id,
        source_label: lane.label,
        lang: tweet.lang || "",
        possibly_sensitive: Boolean(tweet.possibly_sensitive),
        public_metrics: tweet.public_metrics || {},
        media: (tweet.attachments?.media_keys || [])
          .map(key => mediaMap.get(key))
          .filter(Boolean)
          .map(item => ({
            type: item.type,
            url: item.url || item.preview_image_url || "",
            width: item.width || 0,
            height: item.height || 0,
            alt_text: item.alt_text || ""
          }))
      });
    }

    nextToken = String(payload.meta?.next_token || "");
    if (!nextToken) break;
  }

  return { posts, newestId };
}

async function fetchX(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${CONFIG.token}` }
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (response.ok) return json;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`X API ${response.status}: ${text.slice(0, 300)}`);
      }
      lastError = new Error(`X API ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(attempt * 5000);
  }
  throw lastError || new Error("X API failed.");
}

function scoreCandidate(post) {
  const text = post.text.toLowerCase();
  let score = 0;
  if (/\bice\b|immigration and customs enforcement/.test(text)) score += 35;
  if (/\bhsi\b|\bero\b|homeland security investigations/.test(text)) score += 20;
  if (/arrest|detain|raid|deport|remov|custody|operation|redada|detenido|arrestado/.test(text)) score += 30;
  if (/immigration|migrant|noncitizen|undocumented/.test(text)) score += 10;
  if (post.source_lane === "official") score += 20;
  if (post.source_lane === "media") score += 12;
  return Math.min(100, score);
}

function firstEnv(...names) {
  return names.map(name => process.env[name]).find(value => String(value || "").trim())?.trim() || "";
}

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  fetchIceCandidates()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

import path from "node:path";
import {
  DATA_DIR, readJson, writeJsonAtomic, dedupeByKey, normalizeBriefTitle,
  normalizeSummary, firstUsableMedia, isoNow
} from "./ice-utils.mjs";

const CANDIDATES_FILE = path.join(DATA_DIR, "ice-candidates.json");
const NEWS_FILE = path.join(DATA_DIR, "ice-news.json");
const PENDING_FILE = path.join(DATA_DIR, "ice-pending.json");
const STATE_FILE = path.join(DATA_DIR, "ice-state.json");

const CONFIG = {
  key: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  maxPerRun: intEnv("ICE_MAX_PROCESS_PER_RUN", 18, 1, 50)
};

export async function publishIceCandidates() {
  if (!CONFIG.key) throw new Error("Missing OPENAI_API_KEY.");

  const candidates = await readJson(CANDIDATES_FILE, []);
  const news = await readJson(NEWS_FILE, []);
  const pending = await readJson(PENDING_FILE, []);
  const state = await readJson(STATE_FILE, {});

  const publishedIds = new Set(news.map(item => String(item.x_post_id || "")));
  const pendingIds = new Set(pending.map(item => String(item.x_post_id || "")));
  const queue = candidates
    .filter(item => !publishedIds.has(String(item.x_post_id)))
    .filter(item => !pendingIds.has(String(item.x_post_id)))
    .slice(0, CONFIG.maxPerRun);

  const newNews = [];
  const newPending = [];

  for (const candidate of queue) {
    try {
      const edited = await editCandidate(candidate);
      const imageUrl = firstUsableMedia(candidate.media);
      const contentType = imageUrl && edited.content_type === "article" ? "article" : "brief";

      if (!edited.publishable || edited.needs_review || edited.confidence < 80) {
        newPending.push(makePending(candidate, edited.review_reason || "需要人工审核", edited));
        continue;
      }

      const title = contentType === "brief"
        ? normalizeBriefTitle(edited.title)
        : String(edited.title || "").trim();

      const summary = normalizeSummary(edited.summary, contentType === "brief" ? 110 : 160);

      newNews.push({
        id: `ice-${candidate.x_post_id}`,
        x_post_id: candidate.x_post_id,
        title,
        summary,
        content_type: contentType,
        image_url: contentType === "article" ? imageUrl : "",
        source_name: sourceDisplayName(candidate),
        source_url: candidate.source_url,
        url: candidate.source_url,
        published_at: candidate.created_at,
        updated_at: isoNow(),
        category: edited.category || "其他",
        confidence: edited.confidence,
        keywords: edited.keywords || [],
        enforcement_events: normalizeEvents(edited.enforcement_events),
        state_codes: [...new Set(normalizeEvents(edited.enforcement_events).map(e => e.state_code).filter(Boolean))]
      });
    } catch (error) {
      newPending.push(makePending(candidate, error.message, null));
    }
  }

  const mergedNews = dedupeByKey([...newNews, ...news])
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  const mergedPending = dedupeByKey([...newPending, ...pending])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 500);

  const processedIds = new Set(queue.map(item => String(item.x_post_id)));
  const remainingCandidates = candidates.filter(item => !processedIds.has(String(item.x_post_id)));

  await writeJsonAtomic(NEWS_FILE, mergedNews);
  await writeJsonAtomic(PENDING_FILE, mergedPending);
  await writeJsonAtomic(CANDIDATES_FILE, remainingCandidates);
  await writeJsonAtomic(STATE_FILE, {
    ...state,
    last_publish_at: isoNow(),
    last_publish_result: {
      processed: queue.length,
      published: newNews.length,
      pending: newPending.length,
      total_news: mergedNews.length,
      total_pending: mergedPending.length
    }
  });

  return { published: newNews.length, pending: newPending.length };
}

async function editCandidate(candidate) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: CONFIG.model,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: `你是唐人日报ICE新闻编辑。只能使用用户提供的X帖子事实，禁止补充外部知识。
无图或事实较少时使用brief，标题必须8至18个中文字符，摘要25至110个中文字符。
有真实新闻图片且事实完整时可使用article。
不得把被捕、拘留、被指控、被起诉和被定罪混淆。
不使用震惊、炸裂、铁腕、横扫等主观词。
无法核实或事实不足时publishable=false且needs_review=true。`
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: `来源：${candidate.source_name} @${candidate.source_account}
发布时间：${candidate.created_at}
原帖：${candidate.text}
是否有媒体：${firstUsableMedia(candidate.media) ? "是" : "否"}`
          }]
        }
      ],
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "ice_article",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "title", "summary", "content_type", "category", "publishable",
              "needs_review", "review_reason", "confidence", "keywords",
              "enforcement_events"
            ],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              content_type: { type: "string", enum: ["brief", "article"] },
              category: { type: "string" },
              publishable: { type: "boolean" },
              needs_review: { type: "boolean" },
              review_reason: { type: "string" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              keywords: { type: "array", items: { type: "string" } },
              enforcement_events: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["event_type", "people_count", "occurred_at", "city", "state_code", "location_text"],
                  properties: {
                    event_type: { type: "string", enum: ["arrest", "detention", "removal", "other"] },
                    people_count: { type: ["integer", "null"] },
                    occurred_at: { type: ["string", "null"] },
                    city: { type: "string" },
                    state_code: { type: "string" },
                    location_text: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI ${response.status}`);
  const text = payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no structured output.");
  return JSON.parse(text);
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.slice(0, 10).map(event => ({
    event_type: ["arrest", "detention", "removal", "other"].includes(event?.event_type) ? event.event_type : "other",
    people_count: Number.isInteger(event?.people_count) && event.people_count > 0 ? event.people_count : null,
    occurred_at: event?.occurred_at && Number.isFinite(Date.parse(event.occurred_at))
      ? new Date(event.occurred_at).toISOString()
      : null,
    city: String(event?.city || "").trim(),
    state_code: /^[A-Z]{2}$/.test(String(event?.state_code || "").trim().toUpperCase())
      ? String(event.state_code).trim().toUpperCase()
      : "",
    location_text: String(event?.location_text || "").trim()
  }));
}

function sourceDisplayName(candidate) {
  const known = {
    ICEgov: "美国移民与海关执法局（ICE）",
    HSI_HQ: "美国国土安全调查局（HSI）",
    DHSgov: "美国国土安全部（DHS）",
    CBP: "美国海关与边境保护局（CBP）"
  };
  return known[candidate.source_account] || candidate.source_name || candidate.source_account || "公开来源";
}

function makePending(candidate, reason, ai) {
  return {
    id: `pending-${candidate.x_post_id}`,
    x_post_id: candidate.x_post_id,
    reason: String(reason || "需要人工审核").slice(0, 500),
    created_at: isoNow(),
    candidate,
    ai
  };
}

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  publishIceCandidates()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

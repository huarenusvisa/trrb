const { rest } = require("./_shared/supabase-admin");

const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
const MANUAL_FORCE = "force";
const MANUAL_EXCLUDE = "exclude";

const CATEGORY_WEIGHT = {
  "美国时政": 42,
  "ICE执法动态": 38,
  "ICE执法": 38,
  "移民美国": 34,
  "美国警情": 30,
  "热门头条": 28,
  "唐人财经": 20,
  "重要新闻": 18,
  "重点新闻": 18
};

const HIGH_IMPACT_RULES = [
  [/特朗普|川普|白宫|总统|国会|参议院|众议院|最高法院|大法官|州长|行政令|弹劾|大选|中期选举|选举/, 34],
  [/ICE|移民与海关执法局|移民及海关执法局|国土安全部|DHS|遣返|驱逐|庇护|绿卡|签证|移民法官/, 30],
  [/突发|刚刚|宣布|通过|否决|裁定|判决|逮捕|拘留|枪击|爆炸|死亡|重大|紧急|禁令|新规|政策/, 24],
  [/华人|中国公民|中国留学生|纽约|洛杉矶|旧金山|法拉盛/, 10]
];

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function timeOf(row) {
  const value = Date.parse(row?.published_at || row?.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

function overrideOf(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return String(metadata.homepage_focus_override || "auto").trim().toLowerCase();
}

function hasRealImage(row) {
  const image = String(row?.cover_image || "").trim();
  return Boolean(image && !image.includes("image-placeholder") && !image.includes("category-placeholders"));
}

function scoreRow(row, now = Date.now()) {
  const override = overrideOf(row);
  if (override === MANUAL_EXCLUDE) return -100000;
  if (!hasRealImage(row)) return -50000;

  const published = timeOf(row);
  const ageHours = published ? Math.max(0, (now - published) / 3600000) : 96;
  let score = Math.max(0, 96 - ageHours) * 1.35;

  if (override === MANUAL_FORCE || row?.is_featured === true) score += 10000;
  if (row?.is_breaking === true) score += 220;
  score += Math.min(160, Math.max(0, Number(row?.rank_score || 0)) * 2);

  const category = String(row?.category_name || "").trim();
  score += CATEGORY_WEIGHT[category] || 12;

  const text = [row?.title, row?.summary, row?.category_name].filter(Boolean).join(" ");
  for (const [rule, weight] of HIGH_IMPACT_RULES) {
    if (rule.test(text)) score += weight;
  }

  if (String(row?.topic_key || "").trim()) score += 12;
  return score;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  try {
    const cutoff = new Date(Date.now() - HOME_MAX_AGE_MS).toISOString();
    const rows = await rest("articles", {
      query: {
        select: "id,title,slug,summary,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,is_featured,is_breaking,rank_score,metadata",
        status: "eq.published",
        visibility: "eq.public",
        published_at: `gte.${cutoff}`,
        order: "published_at.desc.nullslast,created_at.desc",
        limit: "160"
      }
    });

    const now = Date.now();
    const articles = (Array.isArray(rows) ? rows : [])
      .filter((row) => timeOf(row) >= now - HOME_MAX_AGE_MS)
      .map((row) => ({ ...row, homepage_focus_score: Math.round(scoreRow(row, now)) }))
      .filter((row) => row.homepage_focus_score > -1000)
      .sort((a, b) => b.homepage_focus_score - a.homepage_focus_score || timeOf(b) - timeOf(a))
      .slice(0, 5);

    return response(200, {
      mode: "homepage-focus",
      label: "今日要闻",
      generated_at: new Date().toISOString(),
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("Public homepage focus error:", error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

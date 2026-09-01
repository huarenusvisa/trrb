const { rest } = require("./_shared/supabase-admin");

const HOME_MAX_AGE_HOURS = 96;
const HOME_MAX_AGE_MS = HOME_MAX_AGE_HOURS * 60 * 60 * 1000;
const MIN_LONGFORM_CHARS = 1500;
const PREFERRED_LONGFORM_CHARS = 2200;
const MANUAL_FORCE = "force";
const MANUAL_EXCLUDE = "exclude";

const HIGH_IMPACT_RULES = [
  [/特朗普|川普|白宫|总统|国会|参议院|众议院|最高法院|大法官|州长|行政令|弹劾|大选|中期选举|选举/, 40],
  [/法案|预算|关税|外交|国家安全|联邦政府|内阁|国务卿|国防部长|司法部长|财政部长/, 26],
  [/突发|宣布|通过|否决|裁定|判决|重大|紧急|禁令|新规|政策/, 20]
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

function textLength(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, "")
    .trim()
    .length;
}

function isManualFocus(row) {
  return overrideOf(row) === MANUAL_FORCE;
}

function isEligibleLongform(row) {
  if (isManualFocus(row)) return true;
  return String(row?.category_name || "").trim() === "美国时政" &&
    textLength(row?.content) >= MIN_LONGFORM_CHARS;
}

function scoreRow(row, now = Date.now()) {
  if (!isEligibleLongform(row)) return -100000;

  const override = overrideOf(row);
  if (override === MANUAL_EXCLUDE) return -100000;

  const published = timeOf(row);
  const ageHours = published ? Math.max(0, (now - published) / 3600000) : HOME_MAX_AGE_HOURS;
  const length = textLength(row?.content);
  let score = Math.max(0, HOME_MAX_AGE_HOURS - ageHours) * 1.25;

  if (override === MANUAL_FORCE) score += 10000;
  if (row?.is_breaking === true) score += 180;
  score += Math.min(120, Math.max(0, Number(row?.rank_score || 0)) * 2);
  score += 55;

  if (length >= PREFERRED_LONGFORM_CHARS) score += 60;
  else score += Math.round(((length - MIN_LONGFORM_CHARS) / Math.max(1, PREFERRED_LONGFORM_CHARS - MIN_LONGFORM_CHARS)) * 40);

  const text = [row?.title, row?.summary, row?.category_name].filter(Boolean).join(" ");
  for (const [rule, weight] of HIGH_IMPACT_RULES) {
    if (rule.test(text)) score += weight;
  }

  if (String(row?.topic_key || "").trim()) score += 10;
  return score;
}

function publicArticle(row) {
  const { content, ...article } = row;
  return {
    ...article,
    longform_chars: textLength(content),
    homepage_focus_source: isManualFocus(row) ? "editor" : "美国时政"
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  try {
    const cutoff = new Date(Date.now() - HOME_MAX_AGE_MS).toISOString();
    const select = "id,title,slug,summary,content,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,is_featured,is_breaking,rank_score,metadata";
    const baseQuery = {
      select,
      status: "eq.published",
      visibility: "eq.public",
      published_at: `gte.${cutoff}`,
      order: "published_at.desc.nullslast,created_at.desc"
    };
    const [politicsRows, editorRows] = await Promise.all([
      rest("articles", {
        query: {
          ...baseQuery,
          category_name: "eq.美国时政",
          limit: "200"
        }
      }),
      rest("articles", {
        query: {
          ...baseQuery,
          metadata: `cs.{"homepage_focus_override":"${MANUAL_FORCE}"}`,
          limit: "50"
        }
      })
    ]);
    const rows = [];
    const seen = new Set();
    for (const row of [...(Array.isArray(politicsRows) ? politicsRows : []), ...(Array.isArray(editorRows) ? editorRows : [])]) {
      const key = String(row?.id || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }

    const now = Date.now();
    const articles = (Array.isArray(rows) ? rows : [])
      .filter((row) => timeOf(row) >= now - HOME_MAX_AGE_MS)
      .filter(isEligibleLongform)
      .map((row) => ({ ...row, homepage_focus_score: Math.round(scoreRow(row, now)) }))
      .filter((row) => row.homepage_focus_score > -1000)
      .sort((a, b) => timeOf(b) - timeOf(a) || b.homepage_focus_score - a.homepage_focus_score)
      .slice(0, 5)
      .map(publicArticle);

    return response(200, {
      mode: "homepage-focus",
      label: "今日要闻",
      source_category: "美国时政（编辑可手动加入重大新闻）",
      min_longform_chars: MIN_LONGFORM_CHARS,
      max_age_hours: HOME_MAX_AGE_HOURS,
      sort: "published_at.desc,created_at.desc",
      generated_at: new Date().toISOString(),
      count: articles.length,
      candidate_count: rows.length,
      articles
    });
  } catch (error) {
    console.error("Public homepage focus error:", error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

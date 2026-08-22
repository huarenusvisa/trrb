import crypto from "node:crypto";

export const OFFICIAL_FEEDS = Object.freeze([
  {
    key: "fed-monetary",
    name: "美国联邦储备委员会",
    shortName: "美联储",
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    home: "https://www.federalreserve.gov",
    allowedHosts: ["federalreserve.gov", "www.federalreserve.gov"],
    tag: "MACRO",
  },
  {
    key: "fed-speeches",
    name: "美国联邦储备委员会",
    shortName: "美联储",
    url: "https://www.federalreserve.gov/feeds/speeches_and_testimony.xml",
    home: "https://www.federalreserve.gov",
    allowedHosts: ["federalreserve.gov", "www.federalreserve.gov"],
    tag: "MACRO",
  },
  {
    key: "sec-releases",
    name: "美国证券交易委员会",
    shortName: "SEC",
    url: "https://www.sec.gov/news/pressreleases.rss",
    home: "https://www.sec.gov",
    allowedHosts: ["sec.gov", "www.sec.gov"],
    tag: "REGULATION",
  },
  {
    key: "bls-employment",
    name: "美国劳工统计局",
    shortName: "BLS",
    url: "https://www.bls.gov/feed/empsit.rss",
    home: "https://www.bls.gov",
    allowedHosts: ["bls.gov", "www.bls.gov"],
    tag: "MACRO",
  },
  {
    key: "bls-cpi",
    name: "美国劳工统计局",
    shortName: "BLS",
    url: "https://www.bls.gov/feed/cpi.rss",
    home: "https://www.bls.gov",
    allowedHosts: ["bls.gov", "www.bls.gov"],
    tag: "MACRO",
  },
  {
    key: "bls-ppi",
    name: "美国劳工统计局",
    shortName: "BLS",
    url: "https://www.bls.gov/feed/ppi.rss",
    home: "https://www.bls.gov",
    allowedHosts: ["bls.gov", "www.bls.gov"],
    tag: "MACRO",
  },
]);

export const DEFAULT_X_HANDLES = Object.freeze([
  "USTreasury",
  "BEA_News",
]);

export function cleanText(value, max = 8_000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function decodeXml(value) {
  return cleanText(value, 20_000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

export function stripHtml(value, max = 8_000) {
  return cleanText(
    decodeXml(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]{2,}/g, " "),
    max,
  );
}

export function extractOfficialPageText(html, max = 12_000) {
  const source = String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const candidates = [
    source.match(/<div\b[^>]*id=["']article["'][^>]*>([\s\S]*?)<div\b[^>]*id=["']lastUpdate["']/i)?.[1],
    source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1],
    source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1],
    source.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1],
  ].filter(Boolean);
  const best = candidates
    .map((candidate) => stripHtml(candidate, max))
    .sort((a, b) => b.length - a.length)[0] || "";
  return cleanText(best, max);
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function atomLink(block) {
  const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  if (alternate) return decodeXml(alternate[1]);
  const any = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return any ? decodeXml(any[1]) : "";
}

export function safeOfficialUrl(value, source) {
  try {
    const url = new URL(cleanText(value, 2_000), source.home);
    if (url.protocol !== "https:") return "";
    if (!source.allowedHosts.includes(url.hostname.toLowerCase())) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function parseOfficialFeed(xml, source) {
  const blocks = [
    ...(String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || []),
    ...(String(xml || "").match(/<entry\b[\s\S]*?<\/entry>/gi) || []),
  ];
  return blocks.flatMap((block) => {
    const title = stripHtml(tag(block, ["title"]), 500);
    const rawLink = tag(block, ["link"]) || atomLink(block) || tag(block, ["guid", "id"]);
    const url = safeOfficialUrl(rawLink, source);
    const description = stripHtml(tag(block, ["description", "summary", "content", "content:encoded"]), 8_000);
    const publishedRaw = tag(block, ["pubDate", "published", "updated", "dc:date"]);
    const publishedStamp = Date.parse(publishedRaw);
    if (!title || !url || !publishedRaw || !Number.isFinite(publishedStamp)) return [];
    const publishedAt = new Date(publishedStamp).toISOString();
    return [{
      platform: "official_feed",
      sourceKey: source.key,
      sourceName: source.name,
      sourceAccount: source.shortName,
      tag: source.tag,
      title,
      description,
      url,
      publishedAt,
      rawId: tag(block, ["guid", "id"]) || url,
    }];
  });
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function itemIdentity(item) {
  if (item.platform === "x" && /^\d+$/.test(String(item.rawId || ""))) {
    return {
      externalId: `niulai-finance:x:${item.rawId}`,
      sourcePostId: String(item.rawId),
      slug: `niulai-x-${item.rawId}`,
    };
  }
  const digest = sha256(`${item.sourceKey}|${item.rawId || item.url}`).slice(0, 32);
  return {
    externalId: `niulai-finance:official:${digest}`,
    sourcePostId: digest,
    slug: `niulai-${item.sourceKey}-${digest.slice(0, 20)}`,
  };
}

export function parseHandleList(value) {
  const raw = cleanText(value, 2_000);
  const handles = raw ? raw.split(/[\s,]+/) : DEFAULT_X_HANDLES;
  return [...new Set(handles
    .map((handle) => handle.replace(/^@/, ""))
    .filter((handle) => /^[A-Za-z0-9_]{1,15}$/.test(handle)))]
    .slice(0, 20);
}

export function buildXQuery(handles) {
  const parts = parseHandleList(handles).map((handle) => `from:${handle}`);
  return parts.length ? `(${parts.join(" OR ")}) -is:retweet -is:reply` : "";
}

export function isRecent(item, now = Date.now(), lookbackHours = 72) {
  const stamp = Date.parse(item?.publishedAt || "");
  return Number.isFinite(stamp) && stamp <= now + 5 * 60_000 && stamp >= now - lookbackHours * 3_600_000;
}

export function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = itemIdentity(item).externalId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

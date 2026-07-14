#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const OFFICIAL_ACCOUNT = /^(dhsgov|icegov|ero[a-z0-9_]+)$/i;
const URGENT_TERMS = /shoot|shot|gunfire|officer[- ]involved|fired (?:his|her|their|a) weapon|killed|died|death|fatal|serious injur|hospitalized|crash|vehicle pursuit|chase|use of force|assault|attack|explosion|emergency|riot|standoff|hostage|major operation|large[- ]scale operation|mass arrest/i;

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}

function nowIso() {
  return new Date().toISOString();
}

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.message || body?.detail || body?.raw || "未知错误"}`);
  }
  return body;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function candidateStories() {
  const rows = await sb("ice_stories", {
    query: {
      select: "*",
      status: "in.(pending_review,pending_corroboration,collecting)",
      order: "updated_at.desc",
      limit: "100"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function evidenceFor(storyId) {
  const links = await sb("ice_story_evidence", {
    query: {
      select: "post_id",
      story_id: `eq.${storyId}`,
      order: "created_at.asc",
      limit: "100"
    }
  });
  if (!Array.isArray(links) || !links.length) return [];
  const ids = links.map((item) => item.post_id).filter(Boolean);
  if (!ids.length) return [];
  const rows = await sb("ice_posts", {
    query: {
      select: "*",
      id: `in.(${ids.join(",")})`,
      limit: "100"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

function isCoveredOfficial(post) {
  if (post?.source_type !== "official") return false;
  const username = String(post?.source_username || "");
  const name = String(post?.source_display_name || "");
  return OFFICIAL_ACCOUNT.test(username) || /Department of Homeland Security|Immigration and Customs Enforcement|Enforcement and Removal Operations/i.test(name);
}

function isMajorUrgent(story, evidence) {
  const text = [
    story.title,
    story.summary,
    story.content,
    story.decision_reason,
    ...evidence.map((post) => post.source_text)
  ].filter(Boolean).join("\n");

  if (URGENT_TERMS.test(text)) return true;

  const eventType = String(story.event_type || "").toLowerCase();
  const count = Math.max(0, ...evidence.map((post) => Number(post.people_count || 0)));
  return count >= 10 && ["arrest", "raid", "deportation", "removal_flight"].includes(eventType);
}

function hasHardBlock(story) {
  // The user explicitly allows legal risk to be bypassed for major official breaking news.
  // Conflict, privacy and fabrication risks still block automatic publication.
  return Boolean(story.conflict_detected || story.privacy_risk || story.fabrication_risk);
}

async function promote(story, evidence) {
  const officialPosts = evidence.filter(isCoveredOfficial);
  if (!officialPosts.length) return false;
  if (!isMajorUrgent(story, officialPosts)) return false;
  if (hasHardBlock(story)) return false;
  if (!String(story.title || "").trim() || !String(story.content || "").trim()) return false;
  if (story.human_review_status === "editing") return false;

  const urgentSources = [...new Set(officialPosts.map((post) => String(post.source_username || "")).filter(Boolean))];
  const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  const time = nowIso();

  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${story.id}` },
    body: {
      status: "approved",
      human_review_status: "not_required",
      scheduled_at: time,
      ai_payload: {
        ...payload,
        official_urgent: true,
        official_urgent_sources: urgentSources,
        official_urgent_promoted_at: time,
        legal_risk_bypassed: Boolean(story.legal_risk)
      },
      decision_reason: `${story.decision_reason || ""}；DHS/ICE官方重大突发事件立即发布${story.legal_risk ? "（仅绕过法律风险拦截）" : ""}`,
      updated_at: time
    },
    prefer: "return=minimal"
  });
  return true;
}

async function main() {
  requireEnv();
  const stories = await candidateStories();
  let promoted = 0;
  let hardBlocked = 0;

  for (const story of stories) {
    const evidence = await evidenceFor(story.id);
    if (hasHardBlock(story) && evidence.some(isCoveredOfficial) && isMajorUrgent(story, evidence)) {
      hardBlocked += 1;
      continue;
    }
    if (await promote(story, evidence)) promoted += 1;
  }

  console.log(JSON.stringify({
    promoter: "ice-official-urgent-v1",
    candidates: stories.length,
    promoted,
    hard_blocked_conflict_privacy_or_fabrication: hardBlocked
  }, null, 2));
}

main().catch((error) => {
  console.error("DHS/ICE官方重大突发事件提升失败：", error);
  process.exitCode = 1;
});

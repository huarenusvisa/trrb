#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.raw || `Supabase ${response.status}`);
  return payload;
}

async function main() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);

  const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
  const rejected = await sb("ice_stories", {
    query: {
      select: "id,status,human_review_status,article_id,reviewer_email,reviewed_at,updated_at,decision_reason",
      status: "eq.rejected",
      reviewer_email: "eq.system-dedupe@trrb.net",
      updated_at: `gte.${cutoff}`,
      order: "updated_at.desc",
      limit: "100"
    }
  });

  let restored = 0;
  for (const story of Array.isArray(rejected) ? rejected : []) {
    if (story.article_id) continue;
    const logs = await sb("ice_review_logs", {
      query: {
        select: "id,action,to_status,reviewer_email,created_at",
        story_id: `eq.${story.id}`,
        action: "in.(approve_schedule,publish_now,manual_publish_override)",
        order: "created_at.desc",
        limit: "1"
      }
    });
    const approval = Array.isArray(logs) ? logs[0] : null;
    if (!approval) continue;

    const now = new Date().toISOString();
    await sb("ice_stories", {
      method: "PATCH",
      query: { id: `eq.${story.id}` },
      body: {
        status: "approved",
        human_review_status: "approved",
        scheduled_at: now,
        reviewer_email: approval.reviewer_email || story.reviewer_email,
        reviewed_at: approval.created_at || story.reviewed_at || now,
        decision_reason: String(story.decision_reason || "").replace(/；超过[^；]*自动移出审核队列/g, "").replace(/；与数据库已发布文章高度相似且无独立新增事实[^；]*/g, ""),
        updated_at: now
      },
      prefer: "return=minimal"
    });
    restored += 1;
  }

  console.log(JSON.stringify({ stage: "restore-human-approved-v1", scanned: Array.isArray(rejected) ? rejected.length : 0, restored }, null, 2));
}

main().catch((error) => {
  console.error("恢复人工批准ICE稿件失败：", error);
  process.exitCode = 1;
});
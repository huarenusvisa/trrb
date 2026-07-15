#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(ROOT, "data", "ice-v2-source-policy.json");

function normalizeHandle(value) {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function normalizePostType(post = {}) {
  const refs = Array.isArray(post.referenced_tweets) ? post.referenced_tweets : [];
  if (post.in_reply_to_user_id || refs.some((item) => item?.type === "replied_to")) return "reply";
  if (refs.some((item) => item?.type === "retweeted")) return "repost";
  if (refs.some((item) => item?.type === "quoted")) return "quote_comment";
  if (/^\s*@(?:[A-Za-z0-9_]{1,15})(?:\s+@(?:[A-Za-z0-9_]{1,15}))*\s+/u.test(String(post.text || ""))) return "comment";
  return "original";
}

function buildSourceMap(policy) {
  return new Map((policy.sources || []).map((source) => [normalizeHandle(source.handle), source]));
}

function validatePolicy(policy) {
  const errors = [];
  if (policy?.policy?.default_action !== "deny") errors.push("default_action必须为deny");
  const allowed = new Set(policy?.policy?.allow_source_classes || []);
  const denied = new Set(policy?.policy?.deny_source_classes || []);
  const handles = new Set();

  for (const source of policy.sources || []) {
    const handle = normalizeHandle(source.handle);
    if (!source.key) errors.push("信源缺少key");
    if (!handle) errors.push(`${source.key || "unknown"}缺少handle`);
    if (handles.has(handle)) errors.push(`重复handle：${handle}`);
    handles.add(handle);
    if (!allowed.has(source.class)) errors.push(`${handle}使用未允许的class：${source.class}`);
    if (denied.has(source.class)) errors.push(`${handle}错误使用被禁止class：${source.class}`);
    if (source.enabled && !source.verified) errors.push(`${handle}启用前必须verified=true`);
    if (!Array.isArray(source.topics) || !source.topics.length) errors.push(`${handle}缺少topics`);
  }

  for (const slot of policy.role_slots || []) {
    if (slot.enabled && slot.verification_required) errors.push(`${slot.key}仍需验证，不得启用`);
    if (!allowed.has(slot.class)) errors.push(`${slot.key}使用未允许的class`);
  }

  return errors;
}

function evaluatePost(policy, post) {
  const sourceMap = buildSourceMap(policy);
  const handle = normalizeHandle(post?.author_username || post?.username || post?.source_username);
  const source = sourceMap.get(handle);
  if (!source) return { accepted: false, reason: "source_not_whitelisted", handle };
  if (!source.enabled || !source.verified) return { accepted: false, reason: "source_disabled_or_unverified", handle, source };
  if (!(policy.policy.allow_source_classes || []).includes(source.class)) return { accepted: false, reason: "source_class_not_allowed", handle, source };
  if ((policy.policy.deny_source_classes || []).includes(source.class)) return { accepted: false, reason: "source_class_denied", handle, source };

  const postType = normalizePostType(post);
  if (!(policy.policy.allowed_post_types || []).includes(postType)) {
    return { accepted: false, reason: `post_type_${postType}_denied`, handle, source, post_type: postType };
  }

  return {
    accepted: true,
    reason: "accepted",
    handle,
    source,
    post_type: postType,
    priority: Number(source.priority || 0)
  };
}

async function loadPolicy() {
  return JSON.parse(await fs.readFile(POLICY_PATH, "utf8"));
}

async function main() {
  const policy = await loadPolicy();
  const errors = validatePolicy(policy);
  if (errors.length) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({
    ok: true,
    version: policy.version,
    enabled_sources: (policy.sources || []).filter((source) => source.enabled).length,
    source_classes: [...new Set((policy.sources || []).map((source) => source.class))],
    default_action: policy.policy.default_action
  }, null, 2));
}

export {
  normalizeHandle,
  normalizePostType,
  buildSourceMap,
  validatePolicy,
  evaluatePost,
  loadPolicy
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

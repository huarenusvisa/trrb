import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePostType,
  validatePolicy,
  evaluatePost,
  loadPolicy
} from "./ice-v2-source-policy.mjs";

const policy = await loadPolicy();

test("source policy is valid and defaults to deny", () => {
  assert.deepEqual(validatePolicy(policy), []);
  assert.equal(policy.policy.default_action, "deny");
});

test("official original post is accepted", () => {
  const result = evaluatePost(policy, {
    author_username: "ICEgov",
    text: "ICE announced an enforcement operation.",
    referenced_tweets: []
  });
  assert.equal(result.accepted, true);
  assert.equal(result.source.class, "official_agency");
});

test("approved newsroom original post is accepted", () => {
  const result = evaluatePost(policy, {
    author_username: "Reuters",
    text: "Reuters reports a new immigration enforcement action.",
    referenced_tweets: []
  });
  assert.equal(result.accepted, true);
  assert.equal(result.source.class, "newsroom");
});

test("personal blogger is denied even when verified", () => {
  const result = evaluatePost(policy, {
    author_username: "UnmaskTheSys",
    text: "Breaking ICE news",
    referenced_tweets: []
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "source_not_whitelisted");
});

test("reply, repost and quote-comment are denied", () => {
  assert.equal(normalizePostType({ in_reply_to_user_id: "1", text: "reply" }), "reply");
  assert.equal(normalizePostType({ referenced_tweets: [{ type: "retweeted" }] }), "repost");
  assert.equal(normalizePostType({ referenced_tweets: [{ type: "quoted" }] }), "quote_comment");
  assert.equal(evaluatePost(policy, {
    author_username: "DHSgov",
    text: "@ICEgov response",
    referenced_tweets: []
  }).accepted, false);
});

test("unknown source is denied by default", () => {
  const result = evaluatePost(policy, {
    author_username: "RandomVerifiedAccount",
    text: "ICE update",
    referenced_tweets: []
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "source_not_whitelisted");
});

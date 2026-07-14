import test from "node:test";
import assert from "node:assert/strict";
import { loadPolicy } from "./ice-v2-source-policy.mjs";
import {
  selectedSources,
  sourceQuery,
  acceptTweet,
  eventFingerprint
} from "./ice-v2-collector-core.mjs";
import { sourceType, searchUrl } from "./ice-v2-collect.mjs";

const policy = await loadPolicy();

test("official collector excludes newsroom sources", () => {
  const sources = selectedSources(policy, "official");
  assert.ok(sources.length > 20);
  assert.equal(sources.some((source) => source.class === "newsroom"), false);
});

test("media collector contains only newsroom sources", () => {
  const sources = selectedSources(policy, "media");
  assert.ok(sources.length >= 10);
  assert.equal(sources.every((source) => source.class === "newsroom"), true);
});

test("query excludes replies and reposts", () => {
  const source = selectedSources(policy, "official")[0];
  const query = sourceQuery(source);
  assert.match(query, /-is:reply/);
  assert.match(query, /-is:retweet/);
});

test("whitelisted official original immigration post is accepted", () => {
  const source = policy.sources.find((item) => item.handle === "ICEgov");
  const decision = acceptTweet(policy, source, {
    id: "100",
    text: "ICE announced an immigration arrest and removal operation.",
    created_at: "2026-07-14T12:00:00Z",
    referenced_tweets: []
  }, { username: "ICEgov" });
  assert.equal(decision.accepted, true);
});

test("reply and unrelated post are rejected", () => {
  const source = policy.sources.find((item) => item.handle === "WhiteHouse");
  const reply = acceptTweet(policy, source, {
    id: "101",
    text: "@someone ICE policy comment",
    in_reply_to_user_id: "1",
    referenced_tweets: [{ type: "replied_to", id: "1" }]
  }, { username: "WhiteHouse" });
  const unrelated = acceptTweet(policy, source, {
    id: "102",
    text: "The President welcomed the championship team today.",
    referenced_tweets: []
  }, { username: "WhiteHouse" });
  assert.equal(reply.accepted, false);
  assert.equal(unrelated.accepted, false);
});

test("source types remain compatible with existing database", () => {
  assert.equal(sourceType({ class: "newsroom" }), "major_media");
  assert.equal(sourceType({ class: "official_agency" }), "official");
});

test("cursor and event fingerprint are stable", () => {
  const source = policy.sources.find((item) => item.handle === "ICEgov");
  const url = searchUrl(source, { last_seen_id: "123" });
  assert.equal(url.searchParams.get("since_id"), "123");
  const tweet = { text: "ICE arrested one person in New York", created_at: "2026-07-14T12:00:00Z" };
  assert.equal(eventFingerprint(tweet, source), eventFingerprint(tweet, source));
});

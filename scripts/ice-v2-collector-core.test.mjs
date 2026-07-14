import test from "node:test";
import assert from "node:assert/strict";
import { loadPolicy } from "./ice-v2-source-policy.mjs";
import {
  acceptTweet,
  eventFingerprint,
  immigrationRelevant,
  selectedSources,
  sourceQuery
} from "./ice-v2-collector-core.mjs";
import { exportRegistry } from "./ice-v2-registry-export.mjs";

const policy = await loadPolicy();

test("official collector excludes newsrooms and personal sources", () => {
  const sources = selectedSources(policy, "official");
  assert.ok(sources.length >= 30);
  assert.ok(sources.every((source) => source.class !== "newsroom"));
  assert.ok(sources.every((source) => !["individual", "blogger", "commentator"].includes(source.class)));
});

test("newsroom collector includes only approved newsrooms", () => {
  const sources = selectedSources(policy, "newsroom");
  assert.ok(sources.length >= 8);
  assert.ok(sources.every((source) => source.class === "newsroom"));
});

test("queries explicitly reject replies and reposts", () => {
  const source = selectedSources(policy, "agency")[0];
  const query = sourceQuery(source);
  assert.match(query, /^from:/);
  assert.match(query, /-is:reply/);
  assert.match(query, /-is:retweet/);
});

test("personal account cannot pass the whitelist", () => {
  const source = { handle: "RandomBlogger", topics: ["ice"] };
  const result = acceptTweet(policy, source, {
    id: "1",
    text: "ICE announced an arrest operation",
    referenced_tweets: []
  }, { username: "RandomBlogger" });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "source_not_whitelisted");
});

test("approved source original immigration post is accepted", () => {
  const source = policy.sources.find((item) => item.handle === "ICEgov");
  const result = acceptTweet(policy, source, {
    id: "2",
    text: "ICE announced a removal operation in New York",
    referenced_tweets: []
  }, { username: "ICEgov" });
  assert.equal(result.accepted, true);
});

test("approved source unrelated post is rejected", () => {
  const source = policy.sources.find((item) => item.handle === "WhiteHouse");
  assert.equal(immigrationRelevant("The President hosted a sports team today", source), false);
});

test("event fingerprint is deterministic", () => {
  const source = policy.sources.find((item) => item.handle === "ERONewYork");
  const tweet = { created_at: "2026-07-14T12:00:00Z", text: "ERO New York announced an arrest and removal case" };
  assert.equal(eventFingerprint(tweet, source), eventFingerprint(tweet, source));
  assert.equal(eventFingerprint(tweet, source).length, 40);
});

test("legacy registry contains only v2 approved sources", () => {
  const registry = exportRegistry(policy);
  assert.ok(registry.length >= 45);
  assert.ok(registry.every((item) => item.enabled));
  assert.ok(registry.every((item) => ["official", "major_media"].includes(item.type)));
  assert.equal(registry.some((item) => item.username === "UnmaskTheSys"), false);
});

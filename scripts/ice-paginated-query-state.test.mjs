import test from "node:test";
import assert from "node:assert/strict";
import { collectPaginatedPages, persistBeforeState, resumableWindow } from "./ice-paginated-query-state.mjs";

test("three full 20-item pages retain the terminal token and fixed window", async () => {
  const requested = [];
  const result = await collectPaginatedPages({
    maxPages: 3,
    startToken: "",
    fetchPage: async (token) => {
      requested.push(token);
      const page = requested.length;
      return { data: Array.from({ length: 20 }, (_, index) => ({ id: `${page}-${index}` })), meta: { next_token: `token-${page}` } };
    }
  });
  assert.equal(result.pages.length, 3);
  assert.equal(result.pages.flatMap((page) => page.data).length, 60);
  assert.equal(result.completed, false);
  assert.equal(result.nextToken, "token-3");
  const resumed = resumableWindow({ last_result: { completed: false, continuation_token: result.nextToken, window_start: "2026-11-27T00:00:00.000Z" } }, "new-window");
  assert.deepEqual(resumed, { windowStart: "2026-11-27T00:00:00.000Z", startToken: "token-3", resumed: true });
});

test("a short final page completes the same pagination window", async () => {
  const result = await collectPaginatedPages({
    maxPages: 3,
    startToken: "token-3",
    fetchPage: async () => ({ data: Array.from({ length: 7 }, (_, index) => ({ id: `last-${index}` })), meta: {} })
  });
  assert.equal(result.pages.length, 1);
  assert.equal(result.completed, true);
  assert.equal(result.nextToken, "");
});

test("state never advances when database persistence fails", async () => {
  let saved = false;
  await assert.rejects(() => persistBeforeState({
    rows: [{ id: "1" }],
    persistRows: async () => { throw new Error("database unavailable"); },
    saveState: async () => { saved = true; },
    previousState: { last_seen_id: "old" },
    stateBase: { query_key: "q", query_text: "query", last_result: { handle: "discovery-other" } },
    latestSeenId: "new",
    windowStart: "window",
    nextToken: "",
    pages: 1,
    found: 1,
    resumed: false,
    now: "now"
  }), /database unavailable/);
  assert.equal(saved, false);
});

test("incomplete persistence keeps last_seen_id and records continuation token", async () => {
  let state;
  const result = await persistBeforeState({
    rows: [{ id: "1" }],
    persistRows: async (rows) => rows.length,
    saveState: async (value) => { state = value; },
    previousState: { last_seen_id: "old", last_success_at: "prior" },
    stateBase: { query_key: "q", query_text: "query", last_result: { handle: "discovery-other", rotation_slot: 3 } },
    latestSeenId: "new",
    windowStart: "window",
    nextToken: "token-3",
    pages: 3,
    found: 60,
    resumed: false,
    now: "now"
  });
  assert.equal(result.completed, false);
  assert.equal(state.last_seen_id, "old");
  assert.equal(state.last_success_at, "prior");
  assert.equal(state.last_result.continuation_token, "token-3");
  assert.equal(state.last_result.completed, false);
});

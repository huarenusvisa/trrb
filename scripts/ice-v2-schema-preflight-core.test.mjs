import test from "node:test";
import assert from "node:assert/strict";
import { requiredTables, validateEnvironment, validateSchemaResults, summarizePreflight } from "./ice-v2-schema-preflight-core.mjs";

test("requires all production secrets", () => {
  const result = validateEnvironment({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ["OPENAI_API_KEY", "X_BEARER_TOKEN"]);
});

test("accepts complete environment", () => {
  const result = validateEnvironment({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", X_BEARER_TOKEN: "x", OPENAI_API_KEY: "o" });
  assert.equal(result.ok, true);
});

test("detects missing database columns", () => {
  const results = {};
  for (const [table, columns] of Object.entries(requiredTables())) results[table] = { ok: true, columns };
  results.ice_stories = { ok: true, columns: ["id", "event_fingerprint"] };
  const schema = validateSchemaResults(results);
  assert.equal(schema.ok, false);
  assert.equal(schema.failures[0].table, "ice_stories");
  assert.ok(schema.failures[0].columns.includes("human_review_status"));
});

test("passes complete schema and environment", () => {
  const results = {};
  for (const [table, columns] of Object.entries(requiredTables())) results[table] = { ok: true, columns };
  const summary = summarizePreflight({ environment: { ok: true, missing: [] }, schema: validateSchemaResults(results) });
  assert.equal(summary.ok, true);
});

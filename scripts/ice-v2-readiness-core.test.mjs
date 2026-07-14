import test from "node:test";
import assert from "node:assert/strict";
import { inspectPolicy, readinessResult } from "./ice-v2-readiness-core.mjs";

const official = Array.from({ length: 10 }, (_, index) => ({ handle: `agency${index}`, class: "official_agency", enabled: true, verified: true }));
const newsroom = Array.from({ length: 5 }, (_, index) => ({ handle: `media${index}`, class: "newsroom", enabled: true, verified: true }));

test("readiness accepts sufficient official and newsroom sources", () => {
  const result = inspectPolicy({ sources: [...official, ...newsroom] });
  assert.equal(result.official, 10);
  assert.equal(result.newsroom, 5);
  assert.deepEqual(result.banned, []);
});

test("readiness rejects enabled personal sources", () => {
  const result = inspectPolicy({ sources: [...official, ...newsroom, { handle: "SomeBlogger", class: "blogger", enabled: true, verified: true }] });
  assert.deepEqual(result.banned, ["SomeBlogger"]);
});

test("readiness reports insufficient source groups", () => {
  const result = readinessResult({ policy: { sources: [] }, root: process.cwd() });
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((value) => value.includes("官方白名单过少")));
  assert.ok(result.errors.some((value) => value.includes("正规媒体白名单过少")));
});

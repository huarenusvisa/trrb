#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { isHotCategory, promptFor, usable } from "./ai-cover-backfill.mjs";

test("AI cover backfill is restricted to China Hot Headlines", () => {
  assert.equal(isHotCategory("热门头条"), true);
  assert.equal(isHotCategory("中国热门头条"), true);
  assert.equal(isHotCategory("美国时政"), false);
  assert.equal(isHotCategory("美国警情"), false);
  assert.equal(isHotCategory("ICE执法动态"), false);
  assert.equal(isHotCategory("重要新闻"), false);
});

test("workflow starts the cover queue on August 24, 2026 and ignores older archives", async () => {
  const fs = await import("node:fs");
  const workflow = fs.readFileSync(new URL("../.github/workflows/ai-cover-backfill.yml", import.meta.url), "utf8");
  assert.match(workflow, /AI_COVER_START_AT:\s*"2026-08-24T00:00:00Z"/);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
});

test("only truly missing or placeholder covers enter the AI queue", () => {
  assert.equal(usable(""), false);
  assert.equal(usable("./image-placeholder.svg"), false);
  assert.equal(usable("./assets/category-placeholders/hot.svg"), false);
  assert.equal(usable("https://example.com/source-photo.jpg"), true);
  assert.equal(usable("https://example.com/editorial-cover.webp"), true);
});

test("generated-cover prompt requests a clean 16:9 editorial photograph", () => {
  const prompt = promptFor({ title: "广西玉林街头发生持刀伤人事件", summary: "犯罪嫌疑人已被控制。", category_name: "热门头条" });
  assert.match(prompt, /16:9/);
  assert.match(prompt, /exclusively for the China Hot Headlines section/);
  assert.match(prompt, /photojournalistic/);
  assert.match(prompt, /no logos/);
  assert.match(prompt, /no text/);
  assert.match(prompt, /no gore/);
});

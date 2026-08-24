#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { promptFor, usable } from "./ai-cover-backfill.mjs";

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
  assert.match(prompt, /photojournalistic/);
  assert.match(prompt, /no logos/);
  assert.match(prompt, /no text/);
  assert.match(prompt, /no gore/);
});

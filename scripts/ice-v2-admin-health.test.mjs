import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../admin/ice-review-v2.js", import.meta.url), "utf8");

test("admin loads authenticated ICE v2 health endpoint", () => {
  assert.match(source, /\.netlify\/functions\/ice-v2-health/);
  assert.match(source, /Authorization:\s*`Bearer \$\{await token\(\)\}`/);
});

test("admin renders official and newsroom health separately", () => {
  assert.match(source, /count\("official", "healthy"\)/);
  assert.match(source, /count\("newsroom", "healthy"\)/);
  assert.match(source, /官方超时/);
  assert.match(source, /媒体失败/);
});

test("admin exposes queue metrics and per-source status", () => {
  assert.match(source, /posts_collected/);
  assert.match(source, /stories_waiting_corroboration/);
  assert.match(source, /ice-v2-source-table/);
  assert.match(source, /last_success_at/);
  assert.match(source, /last_error/);
});

test("admin preserves staff publication control", () => {
  assert.match(source, /人工立即发布/);
  assert.match(source, /法律风险及是否发布由工作人员最终判断/);
});

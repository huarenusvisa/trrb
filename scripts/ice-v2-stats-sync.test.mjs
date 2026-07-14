import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../topic/ice/index.html", import.meta.url), "utf8");
const enhanced = fs.readFileSync(new URL("../topic/ice/ice-stats-enhanced.js", import.meta.url), "utf8");
const guard = fs.readFileSync(new URL("../topic/ice/ice-stats-guard.js", import.meta.url), "utf8");

test("loads enhanced statistics before the main ICE renderer", () => {
  assert.ok(html.indexOf("ice-stats-enhanced.js") < html.indexOf("ice.js"));
  assert.ok(html.indexOf("ice-stats-guard.js") > html.indexOf("ice.js"));
});

test("keeps all three time ranges", () => {
  for (const range of ["24h", "7d", "30d"]) {
    assert.match(html, new RegExp(`data-range=\\"${range}\\"`));
    assert.ok(enhanced.includes(`"${range}"`));
    assert.ok(guard.includes(`"${range}"`));
  }
});

test("caps suspicious single-event population values", () => {
  assert.match(enhanced, /MAX_SINGLE_EVENT\s*=\s*500/);
  assert.match(guard, /MAX_SINGLE_EVENT\s*=\s*500/);
  assert.match(enhanced, /value\s*>\s*MAX_SINGLE_EVENT/);
  assert.match(guard, /value\s*>\s*MAX_SINGLE_EVENT/);
});

test("removes dates times ZIP codes and A-numbers before extracting people counts", () => {
  for (const source of [enhanced, guard]) {
    assert.match(source, /20\\d\{2\}/);
    assert.match(source, /\\d\{5\}/);
    assert.match(source, /A#\?\\s\*\\d\+/);
  }
});

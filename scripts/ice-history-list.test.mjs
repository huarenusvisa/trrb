#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../topic/ice/index.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../topic/ice/ice.js", import.meta.url), "utf8");

assert.match(html, /data-range="all"[\s\S]*历史发布/);
assert.match(html, /ice\.js\?v=20260910-people-large-v1/);
assert.match(script, /visibility", "eq\.public"/);
assert.match(script, /async function fetchIceHistory/);
assert.match(script, /offset", String\(offset\)/);
assert.match(script, /currentRange === "all"/);
assert.match(script, /historyLoaded \? mergeArticles\(latest, allData\) : latest/);
assert.match(script, /button\.setAttribute\("aria-busy", "true"\)/);

console.log("ICE公开历史列表支持安全分页、全部历史和后台增量刷新");

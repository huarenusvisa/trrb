import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("特朗普专题规范入口不会被目录规则重定向到自身", () => {
  const redirects = read("_redirects");
  assert.doesNotMatch(redirects, /^\/trump\/\s+\/trump\s+301!/m);
});

test("内部index重写不会再次被Edge重定向回规范入口", () => {
  const edge = read("netlify/edge-functions/01-trump-route-canonical.ts");
  assert.doesNotMatch(edge, /["']\/trump\/index\.html["']/);
  assert.match(edge, /["']\/trump\/["']/);
  assert.match(edge, /["']\/topic\/trump["']/);
});

test("规范入口继续内部重写到真实专题页面", () => {
  const config = read("netlify.toml");
  assert.match(config, /from\s*=\s*["']\/trump["'][\s\S]{0,100}to\s*=\s*["']\/trump\/index\.html["'][\s\S]{0,80}status\s*=\s*200/);
});

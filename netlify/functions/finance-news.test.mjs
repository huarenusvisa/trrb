import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

function load(fetch, { expireFreshImmediately = false } = {}) {
  let source = readFileSync(new URL("./finance-news.ts", import.meta.url), "utf8");
  if (expireFreshImmediately) source = source.replace("Date.now() + 120_000", "Date.now() - 1");
  source = source
    .replace("export default async", "globalThis.handler = async")
    .replace("export const config", "const config");
  const context = vm.createContext({
    URL, Request, Response, AbortController, setTimeout, clearTimeout, console, fetch
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context.handler;
}

const article = {
  id: "finance-1",
  slug: "finance-one",
  title: "美股市场反弹",
  summary: "市场消息",
  category_name: "牛来财经",
  published_at: "2026-11-27T12:00:00.000Z"
};

test("one upstream timeout no longer fails the whole finance response", async () => {
  let calls = 0;
  const handler = load(async (input) => {
    calls += 1;
    const url = new URL(String(input));
    if (url.searchParams.get("q") === "美股") throw new DOMException("aborted", "AbortError");
    return Response.json({ articles: [article] });
  });
  const response = await handler(new Request("https://trrb.net/api/finance/news?limit=1"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.partial, true);
  assert.equal(body.articles.length, 1);
  assert.ok(calls >= 6, "failed source is retried once while the other sources complete");
});

test("a prior good response is served stale when every refresh source fails", async () => {
  let fail = false;
  const handler = load(async () => {
    if (fail) throw new TypeError("origin reset");
    return Response.json({ articles: [article] });
  }, { expireFreshImmediately: true });
  const first = await handler(new Request("https://trrb.net/api/finance/news?limit=1"));
  assert.equal(first.status, 200);
  fail = true;
  const second = await handler(new Request("https://trrb.net/api/finance/news?limit=1"));
  const body = await second.json();
  assert.equal(second.status, 200);
  assert.equal(body.stale, true);
  assert.equal(body.cached, true);
  assert.equal(body.articles.length, 1);
});

test("cold start still returns 502 when all bounded retries fail", async () => {
  const handler = load(async () => { throw new TypeError("origin reset"); });
  const response = await handler(new Request("https://trrb.net/api/finance/news?limit=1"));
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.match(body.error, /all finance sources failed/);
});

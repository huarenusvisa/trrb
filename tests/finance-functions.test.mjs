import test from "node:test";
import assert from "node:assert/strict";

globalThis.Netlify = { env: { get: () => "" } };
const { default: marketData } = await import("../netlify/functions/finance-market-data.ts");

async function body(response) {
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  return response.json();
}

test("public finance status is explicit about development mode", async () => {
  const response = await marketData(new Request("https://example.test/api/finance/status"));
  const data = await body(response);
  assert.equal(response.status, 200);
  assert.equal(data.mode, "demo");
  assert.equal(data.providerConfigured, false);
  assert.equal(data.publicDisplayGate, "development-only");
});

test("search endpoint returns exchange-aware Hong Kong and China securities", async () => {
  const hongKong = await body(await marketData(new Request("https://example.test/api/finance/search?q=%E8%85%BE%E8%AE%AF&market=hk")));
  const china = await body(await marketData(new Request("https://example.test/api/finance/search?q=%E5%AE%81%E5%BE%B7%E6%97%B6%E4%BB%A3&market=cn")));
  assert.equal(hongKong.items[0].symbol, "0700");
  assert.equal(hongKong.items[0].exchange, "HKEX");
  assert.equal(china.items[0].symbol, "300750");
  assert.equal(china.items[0].exchange, "SZSE");
});

test("quote endpoint returns a usable detail contract and series", async () => {
  const response = await marketData(new Request("https://example.test/api/finance/quote?symbol=9988&exchange=HKEX&type=Common%20Stock"));
  const data = await body(response);
  assert.equal(response.status, 200);
  assert.equal(data.quote.symbol, "9988");
  assert.equal(data.quote.currency, "HKD");
  assert.equal(data.quote.route, "stock");
  assert.ok(data.series.length >= 48);
  assert.ok(Number.isFinite(data.quote.price));
});

test("development mode never fabricates an unknown security", async () => {
  const response = await marketData(new Request("https://example.test/api/finance/quote?symbol=NOT-A-REAL-SYMBOL"));
  const data = await body(response);
  assert.equal(response.status, 404);
  assert.match(data.error, /不会生成或替代行情/);
});

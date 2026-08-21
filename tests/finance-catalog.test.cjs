const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../netlify/functions/_shared/finance-catalog.js");

test("demo catalog covers every agreed securities market", () => {
  const result = catalog.coverage();
  for (const group of ["us", "china", "etf", "hk", "cn", "fund"]) assert.ok(result[group] > 0, `${group} coverage missing`);
  assert.equal(result.total, catalog.INSTRUMENTS.length);
});

test("search supports tickers, Chinese names and market filters", () => {
  assert.equal(catalog.searchCatalog("AAPL")[0].symbol, "AAPL");
  assert.equal(catalog.searchCatalog("腾讯")[0].symbol, "0700");
  assert.equal(catalog.searchCatalog("宁德时代", { market: "cn" })[0].symbol, "300750");
  assert.ok(catalog.searchCatalog("ETF", { market: "etf" }).every((item) => item.route === "fund"));
});

test("same symbol identity remains exchange and type aware", () => {
  const item = catalog.findInstrument({ symbol: "9988", exchange: "HKEX" });
  assert.ok(item);
  assert.match(catalog.instrumentId(item), /^9988\|XHKG\|COMMON STOCK$/);
});

test("demo quotes and series are deterministic and internally consistent", () => {
  const item = catalog.findInstrument({ symbol: "600519", exchange: "SSE" });
  const first = catalog.demoQuote(item);
  const second = catalog.demoQuote(item);
  assert.deepEqual(first, second);
  assert.ok(first.high >= first.price);
  assert.ok(first.low <= first.price);
  const series = catalog.demoSeries(item, 64);
  assert.equal(series.length, 64);
  assert.ok(series.every((point) => Number.isFinite(point.close)));
});

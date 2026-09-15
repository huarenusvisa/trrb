import assert from "node:assert/strict";
import { normalizeCandidate, pickCategory, pickContact, pickLocation, pickPrice } from "./secondhand-daily-ingest.mjs";

assert.equal(pickCategory("九成新双人沙发"), "home");
assert.equal(pickCategory("宝宝婴儿车低价转让"), "baby");
assert.equal(pickContact("短信 917 555 1212"), "917-555-1212");
assert.equal(pickLocation("法拉盛自取").state_code, "NY");
assert.equal(pickPrice("价格 $80 可议").price, 80);
assert.deepEqual(pickPrice("免费自取"), { price: 0, explicit: true });
assert.deepEqual(pickPrice("价格请联系卖家协商"), { price: 0, explicit: false });

const source = { key: "fixture", name: "测试来源", origin: "https://example.com" };
const html = `<!doctype html><title>九成新双人沙发 - 华人论坛</title><h1>九成新双人沙发</h1>
  <div>发布于: 2026/08/25</div><div>所在地区: 法拉盛</div><div>详细描述 搬家出售九成新双人沙发，$80，自取。电话917-555-1212
  <img src="https://example.com/upload/sofa.jpg"> 联系时请一定说明</div>`;
const url = "https://example.com/f/page_viewtopic/t_123.html";
const candidate = normalizeCandidate(source, url, html, new Date("2026-08-26T00:00:00Z"));
assert.equal(candidate.payload.category_slug, "moving");
assert.equal(candidate.payload.price, 80);
assert.equal(candidate.payload.location_label, "法拉盛 · NY");
assert.equal(candidate.errors.length, 0);

// The fixture clock stays fixed; production must still reject stale listings.
assert.deepEqual(normalizeCandidate(source, url, html, new Date("2026-09-08T00:00:00Z")).errors, []);
assert.deepEqual(normalizeCandidate(source, url, html, new Date("2026-09-08T00:00:00.001Z")).errors, ["stale_or_missing_date"]);
assert.deepEqual(normalizeCandidate(source, url, html, new Date("2026-09-15T00:00:00Z")).errors, ["stale_or_missing_date"]);
assert.deepEqual(normalizeCandidate(source, url, html, new Date("2026-08-23T00:00:00Z")).errors, ["stale_or_missing_date"]);

console.log("secondhand daily ingest tests: PASS");

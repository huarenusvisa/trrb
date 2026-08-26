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
  <div>发布于: 2026/08/25</div><div>所在地区: 法拉盛</div><div>详细描述 搬家出售九成新双人沙发，$80，自取。电话917-555-1212 联系时请一定说明</div>
  <img src="https://example.com/upload/sofa.jpg">`;
const candidate = normalizeCandidate(source, "https://example.com/f/page_viewtopic/t_123.html", html);
assert.equal(candidate.payload.category_slug, "moving");
assert.equal(candidate.payload.price, 80);
assert.equal(candidate.payload.location_label, "法拉盛 · NY");
assert.equal(candidate.errors.length, 0);

console.log("secondhand daily ingest tests: PASS");

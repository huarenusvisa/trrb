import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildXQuery,
  dedupeItems,
  extractOfficialPageText,
  isRecent,
  itemIdentity,
  parseHandleList,
  parseOfficialFeed,
  safeOfficialUrl,
} from "../scripts/lib/niulai-finance-sources.mjs";

const source = {
  key: "fed-test",
  name: "美国联邦储备委员会",
  shortName: "美联储",
  home: "https://www.federalreserve.gov",
  allowedHosts: ["www.federalreserve.gov"],
  tag: "MACRO",
};

test("parses a trusted official RSS item and normalizes content", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[FOMC &amp; policy update]]></title>
    <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260821a.htm</link>
    <description><![CDATA[<p>Policy &amp; implementation details.</p>]]></description>
    <pubDate>Fri, 21 Aug 2026 18:00:00 GMT</pubDate>
    <guid>fed-1</guid>
  </item></channel></rss>`;
  const [item] = parseOfficialFeed(xml, source);
  assert.equal(item.title, "FOMC & policy update");
  assert.match(item.description, /Policy & implementation details/);
  assert.equal(item.publishedAt, "2026-08-21T18:00:00.000Z");
  assert.equal(item.sourceAccount, "美联储");
});

test("rejects untrusted, insecure, and invalid-date feed entries", () => {
  assert.equal(safeOfficialUrl("https://example.com/fake", source), "");
  assert.equal(safeOfficialUrl("http://www.federalreserve.gov/fake", source), "");
  const xml = `<rss><channel><item><title>Bad date</title><link>https://www.federalreserve.gov/a</link><pubDate>not-a-date</pubDate></item></channel></rss>`;
  assert.deepEqual(parseOfficialFeed(xml, source), []);
});

test("extracts the official article body without scripts or page chrome", () => {
  const html = `<html><script>ignore me</script><div id="article"><h1>Policy update</h1><p>The committee released its decision.</p></div><div id="lastUpdate">today</div></html>`;
  const text = extractOfficialPageText(html);
  assert.match(text, /Policy update/);
  assert.match(text, /committee released its decision/);
  assert.doesNotMatch(text, /ignore me|lastUpdate/);
});

test("creates deterministic IDs and deduplicates repeated official items", () => {
  const item = { platform: "official_feed", sourceKey: "fed-test", rawId: "fed-1", url: "https://www.federalreserve.gov/a" };
  assert.deepEqual(itemIdentity(item), itemIdentity({ ...item }));
  assert.equal(dedupeItems([item, { ...item }]).length, 1);
  assert.equal(itemIdentity({ platform: "x", rawId: "123456" }).externalId, "niulai-finance:x:123456");
});

test("builds an official-account-only X query", () => {
  assert.deepEqual(parseHandleList("@federalreserve, SEC_News bad-account @SEC_News"), ["federalreserve", "SEC_News"]);
  const query = buildXQuery("@federalreserve SEC_News");
  assert.equal(query, "(from:federalreserve OR from:SEC_News) -is:retweet -is:reply");
});

test("recency gate rejects future and stale entries", () => {
  const now = Date.parse("2026-08-21T20:00:00Z");
  assert.equal(isRecent({ publishedAt: "2026-08-21T19:00:00Z" }, now, 72), true);
  assert.equal(isRecent({ publishedAt: "2026-08-10T19:00:00Z" }, now, 72), false);
  assert.equal(isRecent({ publishedAt: "2026-08-21T21:00:00Z" }, now, 72), false);
});

test("official finance ingestion stops at the existing human-review draft gate", () => {
  const ingest = fs.readFileSync(new URL("../scripts/niulai-finance-ingest.mjs", import.meta.url), "utf8");
  const workflow = fs.readFileSync(new URL("../.github/workflows/niulai-finance-ingest.yml", import.meta.url), "utf8");
  assert.match(ingest, /status:\s*["']draft["']/);
  assert.match(ingest, /visibility:\s*["']private["']/);
  assert.match(ingest, /review_status:\s*["']pending_review["']/);
  assert.match(ingest, /automatic_publish:\s*false/);
  assert.doesNotMatch(ingest, /official_source_auto_published/);
  assert.match(workflow, /collect-translate-draft:/);
  assert.match(workflow, /后台待审中文草稿/);
});

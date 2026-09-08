const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PRIMARY_WINDOW_MS,
  selectDigestArticles,
  buildDigestEmail
} = require("./newsletter-digest-core");

const NOW = Date.parse("2026-09-08T16:00:00.000Z");

function article(index, overrides = {}) {
  return {
    id: String(index),
    title: `新闻 ${index}`,
    summary: `摘要 ${index}`,
    category_name: ["美国时政", "美国警情", "移民美国", "热门头条"][index % 4],
    status: "published",
    visibility: "public",
    published_at: new Date(NOW - index * 30 * 60 * 1000).toISOString(),
    is_breaking: false,
    rank_score: index,
    ...overrides
  };
}

test("selects a diverse 10-20 item digest from eligible public articles", () => {
  const rows = Array.from({ length: 30 }, (_, index) => article(index + 1));
  const result = selectDigestArticles(rows, { nowMs: NOW });
  assert.equal(result.ready, true);
  assert.equal(result.selected.length, 15);
  assert.ok(result.selected.length >= 10 && result.selected.length <= 20);
  assert.ok(new Set(result.selected.map((item) => item.category_name)).size >= 3);
});

test("rejects drafts, private, future, stale and duplicate articles", () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, index) => article(index + 1)),
    article(100, { status: "draft" }),
    article(101, { visibility: "private" }),
    article(102, { published_at: new Date(NOW + 1000).toISOString() }),
    article(103, { published_at: new Date(NOW - 80 * 60 * 60 * 1000).toISOString() }),
    article(104, { category_name: "重要新闻" }),
    article(1, { title: "重复项" })
  ];
  const result = selectDigestArticles(rows, { nowMs: NOW });
  assert.equal(result.ready, true);
  assert.equal(result.selected.length, 12);
  assert.equal(new Set(result.selected.map((item) => item.id)).size, 12);
});

test("uses the 72-hour fallback only when the daily window has fewer than ten articles", () => {
  const recent = Array.from({ length: 8 }, (_, index) => article(index + 1));
  const older = Array.from({ length: 6 }, (_, index) => article(index + 50, {
    published_at: new Date(NOW - PRIMARY_WINDOW_MS - (index + 1) * 60 * 60 * 1000).toISOString()
  }));
  const result = selectDigestArticles([...recent, ...older], { nowMs: NOW });
  assert.equal(result.ready, true);
  assert.equal(result.usedFallbackWindow, true);
  assert.equal(result.selected.length, 14);
});

test("does not mark a digest ready when fewer than ten eligible articles exist", () => {
  const result = selectDigestArticles(Array.from({ length: 9 }, (_, index) => article(index + 1)), { nowMs: NOW });
  assert.equal(result.ready, false);
  assert.equal(result.selected.length, 9);
});

test("builds escaped provider-ready HTML and text without recipient data", () => {
  const email = buildDigestEmail([article(1, { title: "<script>alert(1)</script>" })], {
    issueDate: "2026-09-08"
  });
  assert.equal(email.subject, "唐人日报每日快报｜2026-09-08");
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.text, /https:\/\/trrb\.net\/article\.html\?id=1/);
  assert.equal(Object.hasOwn(email, "to"), false);
});

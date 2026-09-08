const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("./newsletter-digest-preview");

const NOW = Date.parse("2026-09-08T16:00:00.000Z");

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    title: `已发布新闻 ${index + 1}`,
    summary: "摘要",
    category_name: index % 2 ? "美国时政" : "移民美国",
    status: "published",
    visibility: "public",
    published_at: new Date(NOW - index * 60 * 1000).toISOString(),
    rank_score: index
  }));
}

test("returns an authenticated preview and never enables dispatch", async () => {
  let query;
  const handler = createHandler({
    now: () => NOW,
    authenticateStaff: async () => ({ user: { id: "staff" } }),
    rest: async (_table, options) => {
      query = options.query;
      return rows(20);
    }
  });
  const result = await handler({ httpMethod: "GET", headers: {} });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.preview_only, true);
  assert.equal(body.dispatch_enabled, false);
  assert.equal(body.ready, true);
  assert.equal(body.article_count, 15);
  assert.equal(query.status, "eq.published");
  assert.equal(query.visibility, "eq.public");
  assert.equal(query.limit, "160");
});

test("requires a staff session", async () => {
  const handler = createHandler({
    now: () => NOW,
    authenticateStaff: async () => {
      const error = new Error("缺少后台登录凭证");
      error.statusCode = 401;
      throw error;
    },
    rest: async () => rows(20)
  });
  const result = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(result.statusCode, 401);
});

test("rejects methods that could accidentally be used as a send trigger", async () => {
  const handler = createHandler({ authenticateStaff: async () => ({}), rest: async () => rows(20) });
  const result = await handler({ httpMethod: "POST", headers: {} });
  assert.equal(result.statusCode, 405);
});

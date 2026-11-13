import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const endpoint = new URL("../netlify/functions/admin-articles.js", import.meta.url);
const require = createRequire(endpoint);
const code = fs.readFileSync(endpoint, "utf8");

function publisher({ authorized = true, existing = [], readError } = {}) {
  const writes = [];
  const logs = [];
  const actor = { user: { id: "10000000-0000-4000-8000-000000000001", email: "editor@example.test" }, admin: {} };
  const exports = {};
  vm.runInNewContext(code, {
    exports, URL,
    console: { error(_message, details) { logs.push(details); } },
    require(path) {
      if (path !== "./_shared/supabase-admin") return require(path);
      return {
        safeText: (value, max) => String(value ?? "").trim().slice(0, max),
        async authenticateAdmin() {
          if (!authorized) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
          return actor;
        },
        async rest(_table, options) {
          if (options.method === "POST") {
            if (options.body.status === "published" && existing.some(row => row.title === options.body.title)) {
              throw Object.assign(new Error("duplicate published article title"), { statusCode: 409 });
            }
            writes.push(options.body);
            return [options.body];
          }
          if (readError) throw readError;
          return writes.filter(row => `eq.${row.id}` === options.query?.id);
        }
      };
    }
  }, { filename: endpoint.pathname });
  const request = body => exports.handler({ httpMethod: "POST", headers: { "x-nf-request-id": "test-request" }, body });
  return {
    writes,
    logs,
    request,
    save(input) {
      return request(JSON.stringify({ action: "save_article", category_name: "美国时政", status: "published", ...input }));
    }
  };
}

test("manual publisher accepts short titles and bodies while preserving requested visibility", async () => {
  const api = publisher();
  for (const status of ["published", "draft", "hidden"]) {
    const result = await api.save({ title: "白宫", content: "白宫公布日程。", status });
    assert.equal(result.statusCode, 200);
    const article = JSON.parse(result.body).article;
    assert.equal(article.content, "白宫公布日程。");
    assert.equal(article.status, status);
    assert.equal(article.visibility, status === "published" ? "public" : "private");
  }
  assert.equal(api.writes.length, 3);
});

test("malformed request bodies return 400 after authentication with no article writes", async () => {
  const api = publisher();
  for (const body of ["{", "null", "[]", '"text"', '{"action":{"toString":null}}', '{"action":"invalid"}']) {
    assert.equal((await api.request(body)).statusCode, 400);
  }
  assert.equal(api.writes.length, 0);
  assert.equal(api.logs.length, 0);
  assert.equal((await publisher({ authorized: false }).request("{")).statusCode, 401);
});

test("unexpected request failures are correlated by operation without logging the request body", async () => {
  const api = publisher({ readError: new Error("synthetic upstream failure") });
  const response = await api.request(JSON.stringify({ action: "bootstrap", content: "do not log me" }));
  assert.equal(response.statusCode, 500);
  assert.equal(api.logs.length, 1);
  assert.equal(api.logs[0].operation, "bootstrap");
  assert.equal(api.logs[0].requestId, "test-request");
  assert.equal(api.logs[0].status, 500);
  assert.doesNotMatch(JSON.stringify(api.logs), /do not log me/);
});

test("removing length gates does not bypass empty, authorization, category or duplicate checks", async () => {
  for (const input of [{ title: " ", content: "正文" }, { title: "标题", content: " " }]) {
    const api = publisher();
    assert.equal((await api.save(input)).statusCode, 400);
    assert.equal(api.writes.length, 0);
  }
  const unauthorized = publisher({ authorized: false });
  assert.equal((await unauthorized.save({ title: "白宫", content: "白宫公布日程。" })).statusCode, 401);
  assert.equal(unauthorized.writes.length, 0);
  const category = publisher();
  assert.equal((await category.save({ title: "白宫公布日程", content: "白宫公布日程。", category_name: "中国热门头条" })).statusCode, 400);
  assert.equal(category.writes.length, 0);
  const duplicate = publisher({ existing: [{ id: "existing", title: "白宫公布下一周公开活动日程" }] });
  assert.equal((await duplicate.save({ title: "白宫公布下一周公开活动日程", content: "活动日程已公布。" })).statusCode, 409);
  assert.equal(duplicate.writes.length, 0);
});

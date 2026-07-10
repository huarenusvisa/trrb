import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_PATH = path.resolve("scripts/trump-sync.mjs");

test("review-list source never auto-publishes even when AI marks it publishable", async () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "trrb-trump-review-"));
  await fs.writeFile(path.join(temp, "index.html"), '<html><body><a href="#">特朗普 <span>动态</span></a></body></html>');
  await fs.writeFile(path.join(temp, "sitemap.xml"), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');

  process.chdir(temp);
  Object.assign(process.env, {
    X_BEARER_TOKEN: "test-x",
    OPENAI_API_KEY: "test-ai",
    OPENAI_MODEL: "gpt-4.1-mini",
    SITE_URL: "https://trrb.net",
    TRUMP_PRIMARY_ACCOUNTS: "realDonaldTrump",
    TRUMP_AUTO_ACCOUNTS: "realDonaldTrump",
    TRUMP_REVIEW_ACCOUNTS: "CNN",
    TRUMP_BOOTSTRAP_LIMIT: "10",
    TRUMP_MAX_PROCESS_PER_RUN: "10",
    TRUMP_LOOKBACK_HOURS: "24",
  });

  const id = "2078000000000000001";
  const createdAt = new Date().toISOString();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.x.com/2/tweets/search/recent")) {
      return new Response(JSON.stringify({
        data: [{
          id,
          text: "CNN reported that President Trump discussed a policy meeting in Washington and further details may follow.",
          created_at: createdAt,
          author_id: "2",
          lang: "en",
          possibly_sensitive: false,
        }],
        includes: { users: [{ id: "2", name: "CNN", username: "CNN", verified: true }] },
        meta: { newest_id: id, oldest_id: id, result_count: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.openai.com/v1/responses") {
      const ai = {
        title: "媒体称特朗普讨论华盛顿政策会议安排",
        summary: "媒体公开帖子称，特朗普讨论了在华盛顿举行政策会议的安排，但没有提供完整议程。",
        body_paragraphs: [
          "媒体公开帖子称，特朗普讨论了在华盛顿举行政策会议的安排。帖子没有说明完整议程，也没有列出所有与会人员。",
          "该信息目前来自媒体帖文本身，后续安排仍需等待相关机构或当事方发布更多可核实内容。",
        ],
        category: "白宫动态",
        importance: 5,
        publishable: true,
        needs_review: false,
        review_reason: "",
        confidence: 90,
        verified_level: "trusted_media",
      };
      return new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(ai) }] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const { main } = await import(`${pathToFileURL(SCRIPT_PATH).href}?review=${Date.now()}`);
    await main();
    const news = JSON.parse(await fs.readFile(path.join(temp, "data/trump-news.json"), "utf8"));
    const pending = JSON.parse(await fs.readFile(path.join(temp, "data/trump-pending.json"), "utf8"));
    assert.equal(news.length, 0);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].kind, "review");
    assert.equal(pending[0].x_post_id, id);
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await fs.rm(temp, { recursive: true, force: true });
  }
});

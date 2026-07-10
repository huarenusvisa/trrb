import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_PATH = path.resolve("scripts/trump-sync.mjs");

async function withTempSite(run) {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "trrb-trump-recovery-"));
  await fs.mkdir(path.join(temp, "data"), { recursive: true });
  await fs.writeFile(
    path.join(temp, "index.html"),
    '<html><body><section class="topics"><a href="#">特朗普 <span>动态</span></a></section></body></html>'
  );
  await fs.writeFile(
    path.join(temp, "sitemap.xml"),
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
  );

  process.chdir(temp);
  Object.assign(process.env, {
    X_BEARER_TOKEN: "test-x",
    OPENAI_API_KEY: "test-ai",
    OPENAI_MODEL: "gpt-4.1-mini",
    SITE_URL: "https://trrb.net",
    TRUMP_PRIMARY_ACCOUNTS: "CustomTrump",
    TRUMP_AUTO_ACCOUNTS: "OtherAccount",
    TRUMP_REVIEW_ACCOUNTS: "none",
    TRUMP_BOOTSTRAP_LIMIT: "10",
    TRUMP_MAX_PROCESS_PER_RUN: "10",
    TRUMP_MAX_PAGES: "10",
    TRUMP_LOOKBACK_HOURS: "1",
  });

  try {
    await run(temp);
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test("polling keeps posts older than bootstrap lookback and primary account is auto source", async () => {
  await withTempSite(async (temp) => {
    const oldId = "2079000000000000000";
    const newId = "2079000000000000001";
    const createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(path.join(temp, "data/trump-state.json"), JSON.stringify({
      last_seen_id: oldId,
      last_success_at: "",
      last_content_at: "",
      last_error: "",
      last_result: {},
    }));
    await fs.writeFile(path.join(temp, "data/trump-news.json"), "[]");
    await fs.writeFile(path.join(temp, "data/trump-pending.json"), "[]");

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.x.com/2/tweets/search/recent")) {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("since_id"), oldId);
        assert.equal(parsed.searchParams.has("start_time"), false);
        return new Response(JSON.stringify({
          data: [{
            id: newId,
            text: "President Trump announced a public meeting in Washington and said details will follow.",
            created_at: createdAt,
            author_id: "1",
            lang: "en",
            possibly_sensitive: false,
          }],
          includes: { users: [{ id: "1", name: "Custom Trump", username: "CustomTrump", verified: true }] },
          meta: { newest_id: newId, oldest_id: newId, result_count: 1 },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "https://api.openai.com/v1/responses") {
        const ai = {
          title: "特朗普宣布将在华盛顿举行公开会议",
          summary: "特朗普通过公开帖子表示，将在华盛顿举行会议，并称后续细节将继续公布。",
          body_paragraphs: [
            "特朗普在公开帖子中宣布，将在华盛顿举行一场公开会议。帖子没有列出完整议程，也没有说明全部与会人员。",
            "该帖表示，后续细节将继续公布。目前材料没有提供更多可核实内容，具体安排仍以随后公开的信息为准。",
          ],
          category: "白宫动态",
          importance: 5,
          publishable: true,
          needs_review: false,
          review_reason: "",
          confidence: 93,
          verified_level: "official",
        };
        return new Response(JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(ai) }] }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const { main } = await import(`${pathToFileURL(SCRIPT_PATH).href}?outage=${Date.now()}`);
    await main();

    const news = JSON.parse(await fs.readFile(path.join(temp, "data/trump-news.json"), "utf8"));
    const state = JSON.parse(await fs.readFile(path.join(temp, "data/trump-state.json"), "utf8"));
    assert.equal(news.length, 1);
    assert.equal(news[0].x_post_id, newId);
    assert.equal(state.last_seen_id, newId);
  });
});

test("cursor recovers when content was saved before a previous state write failure", async () => {
  await withTempSite(async (temp) => {
    const oldId = "2079100000000000000";
    const newId = "2079100000000000001";
    const now = new Date().toISOString();
    const item = {
      id: `trump-${newId}`,
      x_post_id: newId,
      title: "特朗普公开会议动态",
      summary: "特朗普公开帖子披露会议安排，相关细节仍待后续信息确认。",
      body_paragraphs: ["第一段测试内容。", "第二段测试内容。"],
      category: "白宫动态",
      importance: 5,
      published_at: now,
      updated_at: now,
      url: `/news/trump/2026/07/10/trump-${newId}.html`,
      source_name: "Custom Trump",
      source_username: "CustomTrump",
      source_url: `https://x.com/CustomTrump/status/${newId}`,
      image_url: "",
      confidence: 93,
      verified_level: "official",
      content_hash: "test",
    };
    await fs.writeFile(path.join(temp, "data/trump-state.json"), JSON.stringify({
      last_seen_id: oldId,
      last_success_at: "",
      last_content_at: "",
      last_error: "",
      last_result: {},
    }));
    await fs.writeFile(path.join(temp, "data/trump-news.json"), JSON.stringify([item]));
    await fs.writeFile(path.join(temp, "data/trump-pending.json"), "[]");

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (!url.startsWith("https://api.x.com/2/tweets/search/recent")) {
        throw new Error(`OpenAI must not be called during cursor recovery: ${url}`);
      }
      return new Response(JSON.stringify({
        data: [{
          id: newId,
          text: "President Trump announced a public meeting.",
          created_at: now,
          author_id: "1",
          lang: "en",
          possibly_sensitive: false,
        }],
        includes: { users: [{ id: "1", name: "Custom Trump", username: "CustomTrump", verified: true }] },
        meta: { newest_id: newId, oldest_id: newId, result_count: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const { main } = await import(`${pathToFileURL(SCRIPT_PATH).href}?cursor=${Date.now()}`);
    await main();

    const state = JSON.parse(await fs.readFile(path.join(temp, "data/trump-state.json"), "utf8"));
    const sitemap = await fs.readFile(path.join(temp, "sitemap.xml"), "utf8");
    assert.equal(state.last_seen_id, newId);
    assert.match(sitemap, new RegExp(`trump-${newId}\\.html`));
  });
});

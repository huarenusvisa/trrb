import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_PATH = path.resolve("scripts/trump-sync.mjs");

test("full pipeline writes feed, article, state, home link and sitemap with mocked APIs", async () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const envNames = [
    "X_BEARER_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "SITE_URL",
    "TRUMP_PRIMARY_ACCOUNTS",
    "TRUMP_AUTO_ACCOUNTS",
    "TRUMP_REVIEW_ACCOUNTS",
    "TRUMP_BOOTSTRAP_LIMIT",
    "TRUMP_MAX_PROCESS_PER_RUN",
    "TRUMP_LOOKBACK_HOURS",
  ];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "trrb-trump-test-"));
  await fs.mkdir(path.join(temp, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(temp, "index.html"),
    '<!doctype html><html><body><a href="/news/example.html">特朗普发布测试新闻</a><section class="topics"><a href="#">特朗普 <span>最新动态与政策解读</span></a></section></body></html>',
    "utf8"
  );
  await fs.writeFile(
    path.join(temp, "sitemap.xml"),
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    "utf8"
  );

  process.chdir(temp);
  process.env.X_BEARER_TOKEN = "test-x-token";
  process.env.OPENAI_API_KEY = "test-openai-token";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.SITE_URL = "https://trrb.net";
  process.env.TRUMP_PRIMARY_ACCOUNTS = "realDonaldTrump";
  process.env.TRUMP_AUTO_ACCOUNTS = "realDonaldTrump";
  process.env.TRUMP_REVIEW_ACCOUNTS = "";
  process.env.TRUMP_BOOTSTRAP_LIMIT = "10";
  process.env.TRUMP_MAX_PROCESS_PER_RUN = "10";
  process.env.TRUMP_LOOKBACK_HOURS = "24";

  const postId = "2076000000000000001";
  const createdAt = new Date().toISOString();
  const ai = {
    title: "特朗普公布下一场公开政策会议安排",
    summary: "特朗普通过公开帖子表示，将在华盛顿举行政策会议，并称相关安排将由团队继续公布。",
    body_paragraphs: [
      "特朗普在公开帖子中表示，将在华盛顿举行一场政策会议。帖子说明会议将围绕政府工作展开，但没有列出完整议程。",
      "该帖称，相关安排将由团队继续公布。目前公开材料没有提供更多可核实细节，具体内容仍以随后发布的信息为准。",
    ],
    category: "白宫动态",
    importance: 6,
    publishable: true,
    needs_review: false,
    review_reason: "",
    confidence: 94,
    verified_level: "official",
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.x.com/2/tweets/search/recent")) {
      return new Response(JSON.stringify({
        data: [{
          id: postId,
          text: "President Trump announced a public policy meeting in Washington and said his team will release further details.",
          created_at: createdAt,
          author_id: "1",
          lang: "en",
          possibly_sensitive: false,
          public_metrics: { like_count: 10 },
        }],
        includes: {
          users: [{ id: "1", name: "Donald J. Trump", username: "realDonaldTrump", verified: true }],
          media: [],
        },
        meta: { newest_id: postId, oldest_id: postId, result_count: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.openai.com/v1/responses") {
      return new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(ai) }],
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected mock URL: ${url}`);
  };

  try {
    const moduleUrl = `${pathToFileURL(SCRIPT_PATH).href}?integration=${Date.now()}`;
    const { main } = await import(moduleUrl);
    await main();

    const news = JSON.parse(await fs.readFile(path.join(temp, "data/trump-news.json"), "utf8"));
    assert.equal(news.length, 1);
    assert.equal(news[0].x_post_id, postId);
    assert.equal(news[0].category, "白宫动态");

    const state = JSON.parse(await fs.readFile(path.join(temp, "data/trump-state.json"), "utf8"));
    assert.equal(state.last_seen_id, postId);
    assert.equal(state.last_result.published, 1);

    const articlePath = path.join(temp, news[0].url.replace(/^\//, ""));
    const article = await fs.readFile(articlePath, "utf8");
    assert.match(article, /特朗普公布下一场公开政策会议安排/);
    assert.match(article, /查看X原帖/);

    const home = await fs.readFile(path.join(temp, "index.html"), "utf8");
    assert.match(home, /href="\/topic\/trump\/"/);
    assert.match(home, /href="\/news\/example\.html">特朗普发布测试新闻/);
    assert.match(home, /trump-home-widget\.js/);

    const sitemap = await fs.readFile(path.join(temp, "sitemap.xml"), "utf8");
    assert.match(sitemap, /https:\/\/trrb\.net\/topic\/trump\//);
    assert.match(sitemap, new RegExp(`trump-${postId}\\.html`));
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
    await fs.rm(temp, { recursive: true, force: true });
  }
});

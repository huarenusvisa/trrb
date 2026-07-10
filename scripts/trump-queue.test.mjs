import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_PATH = path.resolve("scripts/trump-sync.mjs");

const labels = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel",
  "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar"
];

test("overflow posts remain queued and are processed on the next run without moving backward", async () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "trrb-trump-queue-"));
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
    TRUMP_REVIEW_ACCOUNTS: "none",
    TRUMP_BOOTSTRAP_LIMIT: "20",
    TRUMP_MAX_PROCESS_PER_RUN: "12",
    TRUMP_MAX_PAGES: "10",
    TRUMP_LOOKBACK_HOURS: "24",
  });

  const base = 2077000000000000000n;
  const createdAt = new Date().toISOString();
  const posts = labels.map((label, index) => ({
    id: String(base + BigInt(index + 1)),
    text: `President Trump announced a public policy meeting concerning ${label} and said further details will follow.`,
    created_at: createdAt,
    author_id: "1",
    lang: "en",
    possibly_sensitive: false,
  }));
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.x.com/2/tweets/search/recent")) {
      const parsed = new URL(url);
      const isPollingRun = parsed.searchParams.has("since_id");
      const isSecondPage = parsed.searchParams.get("next_token") === "page-two";
      const data = isPollingRun ? [] : (isSecondPage ? posts.slice(10) : posts.slice(0, 10));
      const meta = isPollingRun
        ? { result_count: 0 }
        : isSecondPage
          ? { newest_id: posts[9].id, oldest_id: posts[10].id, result_count: data.length }
          : { newest_id: posts.at(-1).id, oldest_id: posts[0].id, result_count: data.length, next_token: "page-two" };
      return new Response(JSON.stringify({
        data,
        includes: { users: [{ id: "1", name: "Donald J. Trump", username: "realDonaldTrump", verified: true }] },
        meta,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url === "https://api.openai.com/v1/responses") {
      const request = JSON.parse(options.body);
      const text = request.input[1].content[0].text;
      const label = labels.find((entry) => text.includes(entry)) || "Policy";
      const ai = {
        title: `特朗普公布有关${label}地区的政策会议安排`,
        summary: `特朗普通过公开帖子表示，将举行一场涉及${label}地区的政策会议，并称团队会继续公布相关安排。`,
        body_paragraphs: [
          `特朗普在公开帖子中表示，将举行一场涉及${label}地区的政策会议。帖子说明会议与政府政策工作有关，但没有列出完整议程。`,
          `该帖称，团队会继续公布相关安排。目前材料没有提供更多可核实细节，具体内容仍应以随后发布的正式信息为准。`,
        ],
        category: "白宫动态",
        importance: 5,
        relevance_score: 94,
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

  try {
    const moduleUrl = `${pathToFileURL(SCRIPT_PATH).href}?queue=${Date.now()}`;
    const { main } = await import(moduleUrl);

    await main();
    let news = JSON.parse(await fs.readFile(path.join(temp, "data/trump-news.json"), "utf8"));
    let pending = JSON.parse(await fs.readFile(path.join(temp, "data/trump-pending.json"), "utf8"));
    let state = JSON.parse(await fs.readFile(path.join(temp, "data/trump-state.json"), "utf8"));
    assert.equal(news.length, 12);
    assert.equal(pending.length, 3);
    assert.equal(state.last_seen_id, posts.at(-1).id);

    await main();
    news = JSON.parse(await fs.readFile(path.join(temp, "data/trump-news.json"), "utf8"));
    pending = JSON.parse(await fs.readFile(path.join(temp, "data/trump-pending.json"), "utf8"));
    state = JSON.parse(await fs.readFile(path.join(temp, "data/trump-state.json"), "utf8"));
    assert.equal(news.length, 15);
    assert.equal(pending.length, 0);
    assert.equal(state.last_seen_id, posts.at(-1).id);
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    await fs.rm(temp, { recursive: true, force: true });
  }
});

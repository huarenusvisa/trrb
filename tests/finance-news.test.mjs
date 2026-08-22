import test from "node:test";
import assert from "node:assert/strict";
import financeNews from "../netlify/functions/finance-news.ts";

test("official Niulai category bypasses legacy finance keyword filtering", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const articles = url.searchParams.get("category") === "牛来财经" ? [{
      id: "bea-1",
      slug: "niulai-x-1",
      title: "官方发布：利用商业数据提升RPP估计精准度",
      summary: "美国经济分析局发布方法研究更新。",
      category_name: "牛来财经",
      author: "牛来｜唐人财经",
      source_name: "美国经济分析局",
      source_account: "@BEA_News",
      source_platform: "x",
      source_url: "https://x.com/BEA_News/status/1",
      published_at: "2026-08-21T23:00:00Z",
    }] : [];
    return new Response(JSON.stringify({ articles }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await financeNews(new Request("https://niulai.us/api/finance/news?limit=10"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.articles[0].id, "bea-1");
    assert.equal(body.articles[0].originalSource, "美国经济分析局");
    assert.equal(body.articles[0].originalUrl, "https://x.com/BEA_News/status/1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

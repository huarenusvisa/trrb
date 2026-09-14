import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("legacy restoration plans nonempty short news while preserving retirement and manual review", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "trrb-short-legacy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "config"));
  await writeFile(path.join(root, "config/legacy-archive-final-closure-20260829.json"), JSON.stringify({
    manual_review_legacy_ids: ["wp-6"], approved_manual_review_categories: { "wp-7": "美国时政" }
  }));
  const rows = [
    { id: "wp-1", title: "日程公布", body: ["白宫公布日程。"], category: "美国时政" },
    { id: "wp-2", title: "空正文", body: [" "], category: "美国时政" },
    { id: "wp-3", title: "待核对稿", body: ["待编辑核对。"], category: "重要新闻" },
    { id: "wp-4", title: "目录页面", body: ["服务目录。"], category: "纽约华人律师事务所" },
    { id: "wp-5", title: "未知栏目", body: ["应先核对分类。"], category: "未配置栏目" },
    { id: "wp-6", title: "指定审核稿", body: ["已有人工审核要求。"], category: "美国时政" },
    { id: "wp-7", title: "已批准稿", body: ["编辑已批准新闻归类。"], category: "重要新闻" }
  ].map((row) => ({ ...row, date: "2026-08-01" }));
  await writeFile(path.join(root, "articles-chunk-1.js"), `window.TRRB_ARTICLE_CHUNK=${JSON.stringify(rows)};`);
  const mock = path.join(root, "mock-fetch.mjs");
  await writeFile(mock, `
    globalThis.fetch = async (url, options) => {
      if (options.method !== 'GET') throw new Error('Restoration test must never write remotely');
      const target = new URL(url);
      if (target.pathname.endsWith('/articles')) return new Response('[]');
      if (target.pathname.endsWith('/categories')) return new Response(JSON.stringify([{ id: 'politics', name: '美国时政', slug: 'us-politics' }]));
      throw new Error('Unexpected request');
    };
  `);
  await promisify(execFile)(process.execPath, ["--import", mock, fileURLToPath(new URL("./restore-legacy-archive.mjs", import.meta.url))], {
    cwd: root,
    env: {
      ...process.env, SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      LEGACY_PRIORITY_IDS: "", LEGACY_PRIORITY_ONLY: "false", LEGACY_CATEGORY_OVERRIDES: "", GITHUB_OUTPUT: ""
    }
  });
  const report = JSON.parse(await readFile(path.join(root, "reports/legacy-migration-latest.json"), "utf8"));
  assert.equal(report.mode, "report");
  assert.deepEqual(report.sample_missing.map((row) => row.legacy_id).sort(), ["wp-1", "wp-7"]);
  assert.equal(report.inserted, 0);
  assert.equal(report.skipped.no_body, 1);
  assert.equal(report.manual_review_count, 2);
  assert.equal(report.retired_non_article_count, 1);
  assert.equal(report.skipped.unknown_category, 1);
});

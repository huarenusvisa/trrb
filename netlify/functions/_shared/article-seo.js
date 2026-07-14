const crypto = require("node:crypto");
const { safeText } = require("./supabase-admin");

function makeSlug(title) {
  const base = safeText(title, 220)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\u4e00-\u9fa5a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `${base || "article"}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function generateSummary(content, title = "") {
  const clean = safeText(content, 50000)
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return safeText(title, 150);
  const sentences = clean.split(/(?<=[。！？!?])\s*/).filter(Boolean);
  let summary = "";
  for (const sentence of sentences) {
    if ((summary + sentence).length > 135 && summary.length >= 60) break;
    summary += sentence;
  }
  summary = (summary || clean.slice(0, 130)).trim();
  return summary.length > 150 ? `${summary.slice(0, 147)}…` : summary;
}

function generateSeoKeywords(title, category, content) {
  const stop = new Set([
    "我们", "他们", "以及", "一个", "这个", "那个", "目前", "已经", "进行", "表示", "指出",
    "认为", "相关", "报道", "消息", "记者", "唐人日报", "中国", "美国", "新闻", "文章", "情况",
    "问题", "可以", "没有", "因为", "但是", "如果", "其中", "对于", "通过", "正在"
  ]);
  const scores = new Map();
  const add = (term, score) => {
    const value = safeText(term, 40).replace(/^[,，。；;：:\s]+|[,，。；;：:\s]+$/g, "");
    if (!value || value.length < 2 || value.length > 18 || stop.has(value) || /^\d+$/.test(value)) return;
    scores.set(value, (scores.get(value) || 0) + score);
  };

  add(category, 14);
  safeText(title, 220).split(/[\s,，。；;：:、|｜—\-（）()《》“”"']+/).forEach((part) => add(part, 10));
  const text = `${safeText(title, 220)} ${safeText(content, 50000)}`.replace(/<[^>]+>/g, " ");
  (text.match(/[A-Za-z][A-Za-z0-9.'-]{2,}/g) || []).forEach((word) => add(word.toUpperCase(), 3));
  const chineseRuns = text.match(/[\u4e00-\u9fff]{2,12}/g) || [];
  chineseRuns.forEach((run) => {
    if (run.length <= 6) add(run, 4);
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) {
        add(run.slice(index, index + size), size === 2 ? 1 : 2);
      }
    }
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 12)
    .map(([term]) => term)
    .join(", ");
}

module.exports = { makeSlug, generateSummary, generateSeoKeywords };

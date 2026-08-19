const {
  safeText,
  rest,
  authenticateStaff
} = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) };
}
const text = safeText;
function nowIso() { return new Date().toISOString(); }

const AGENCIES = ["ICE", "HSI", "CBP", "DHS", "ERO", "USCIS", "美国移民与海关执法局", "国土安全部", "海关与边境保护局"];
const COUNTRIES = ["中国", "哥伦比亚", "墨西哥", "印度", "委内瑞拉", "厄瓜多尔", "危地马拉", "洪都拉斯", "萨尔瓦多", "古巴", "海地", "巴西", "秘鲁", "多米尼加", "尼加拉瓜", "俄罗斯", "乌克兰", "越南", "韩国", "菲律宾", "巴基斯坦", "孟加拉国", "尼泊尔", "阿富汗"];
function extractPeople(source) {
  const value = source.replace(/\b20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}\b/g, " ").replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  const patterns = [
    /(?:逮捕|抓捕|拘留|羁押|扣押|遣返|递解)(?:了|约|至少|超过|逾)?\s*(\d{1,3})\s*(?:名|人|位)/,
    /(\d{1,3})\s*(?:名|人|位)(?:非法移民|移民|男子|女子|嫌疑人|人员|公民)?[^。；;]{0,14}(?:被逮捕|被捕|被拘留|遭拘留|落网|羁押)/,
    /(?:arrested|detained|apprehended|deported)\s+(?:about\s+|at least\s+|more than\s+|over\s+)?(\d{1,3})\s+(?:people|persons|migrants|immigrants|individuals)/i
  ];
  for (const pattern of patterns) { const m = value.match(pattern); if (m) return { count: Number(m[1]), type: /约|about/i.test(m[0]) ? "estimated" : /至少|超过|逾|at least|more than|over/i.test(m[0]) ? "minimum" : "exact", source: m[0] }; }
  if (/数百(?:名|人)|hundreds? of/i.test(value)) return { count: 200, type: "estimated", source: "数百人（保守估算）" };
  if (/近百(?:名|人)/.test(value)) return { count: 90, type: "estimated", source: "近百人（保守估算）" };
  if (/上百(?:名|人)/.test(value)) return { count: 100, type: "minimum", source: "上百人（最低值）" };
  if (/数十|几十|dozens? of/i.test(value)) return { count: 20, type: "estimated", source: "数十人（保守估算）" };
  if (/十余(?:名|人)/.test(value)) return { count: 10, type: "minimum", source: "十余人（最低值）" };
  return { count: 0, type: "unknown", source: "" };
}
function extractFacts(report, input) {
  const source = `${input.title || ""} ${input.summary || ""} ${input.content || ""} ${report.event_description || ""}`;
  const agencies = AGENCIES.filter((item) => source.toUpperCase().includes(item.toUpperCase()));
  const countries = COUNTRIES.filter((item) => source.includes(item));
  const people = extractPeople(source);
  return { agencies: [...new Set(agencies)], location: text(report.location_text, 200), people_count: people.count, people_count_type: people.type, people_count_source: people.source, countries: [...new Set(countries)] };
}
function suggestedTitle(facts) {
  const agency = facts.agencies[0] || "ICE";
  const location = facts.location || "美国";
  const count = facts.people_count ? `${facts.people_count_type === "estimated" ? "约" : facts.people_count_type === "minimum" ? "至少" : ""}${facts.people_count}人` : "人员";
  const country = facts.countries.length ? `${facts.countries.join("、")}籍` : "";
  return `${agency}在${location}拘留${country}${count}`.slice(0, 220);
}
async function getReport(id) {
  const rows = await rest("ice_user_reports", { query: { select: "*", id: `eq.${text(id, 80)}`, limit: "1" } });
  const report = Array.isArray(rows) ? rows[0] : null;
  if (!report) { const e = new Error("没有找到这条投稿"); e.statusCode = 404; throw e; }
  return report;
}
async function patchReport(id, body) {
  const rows = await rest("ice_user_reports", { method: "PATCH", query: { id: `eq.${id}` }, body: { ...body, updated_at: nowIso() }, prefer: "return=representation" });
  return Array.isArray(rows) ? rows[0] : rows;
}
async function patchArticle(id, body) {
  if (!id) return;
  await rest("articles", { method: "PATCH", query: { id: `eq.${id}` }, body, prefer: "return=minimal" });
}
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const { user } = await authenticateStaff(event, ["owner", "editor"]);
    const input = JSON.parse(event.body || "{}");
    const report = await getReport(input.report_id);
    const action = text(input.action, 30);
    const title = text(input.title, 220);
    const summary = text(input.summary, 1000);
    const content = text(input.content, 20000);
    const facts = extractFacts(report, input);
    const finalTitle = title || suggestedTitle(facts);
    const metadataPatch = { user_report_id: report.id, report_date: report.report_date, location_text: report.location_text, agencies: facts.agencies, countries: facts.countries, people_count: facts.people_count, people_count_type: facts.people_count_type, people_count_source: facts.people_count_source, admin_edited: true, editor_email: user.email || "", edited_at: nowIso() };

    if (action === "save" || action === "sync_published") {
      const saved = await patchReport(report.id, { status: report.status === "published" ? "published" : "reviewing", admin_title: finalTitle, admin_summary: summary, admin_content: content, review_note: text(input.review_note, 4000), reviewer_email: user.email || "", reviewed_at: nowIso() });
      if (report.article_id) await patchArticle(report.article_id, { title: finalTitle, summary, content, metadata: { ...(typeof input.existing_metadata === "object" ? input.existing_metadata : {}), ...metadataPatch } });
      return json(200, { report: saved, facts, suggested_title: suggestedTitle(facts) });
    }
    if (action === "unpublish") {
      if (report.article_id) await patchArticle(report.article_id, { status: "draft", published_at: null });
      const saved = await patchReport(report.id, { status: "reviewing", unpublished_at: nowIso(), unpublished_by: user.email || "" });
      return json(200, { report: saved, unpublished: true });
    }
    return json(400, { error: "未知操作" });
  } catch (error) {
    console.error("ICE report editor error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

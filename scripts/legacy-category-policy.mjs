const EXACT_PUBLISH = new Set(["美国时政", "美国警情", "重要新闻", "中国热门头条"]);

const CATEGORY_POLICY = new Map([
  ["中国官场", { action: "publish", targetCategory: "中国热门头条", reason: "retired-china-category" }],
  ["热门头条", { action: "publish", targetCategory: "中国热门头条", reason: "renamed-china-headlines" }],
  ["庇护百科", { action: "publish", targetCategory: "移民美国", reason: "asylum-knowledge" }],
  ["驱逐快报", { action: "manual_review", targetCategory: "ICE执法动态", reason: "ice-official-source-review-required" }],
  ["纽约华人律师事务所", { action: "retire", targetCategory: "", reason: "directory-not-news" }],
  ["纽约华人会计师事务所", { action: "retire", targetCategory: "", reason: "directory-not-news" }]
]);

const ICE_ENFORCEMENT_TERMS = [
  "ice", "移民与海关执法局", "移民海关执法局", "海关执法局", "遣返", "驱逐",
  "递解", "移民拘留", "拘留中心", "移民监狱", "执法突袭", "移民执法", "被ice",
  "ice特工", "ice探员", "ice官员"
];

const IMMIGRATION_PROCESS_TERMS = [
  "移民", "签证", "绿卡", "庇护", "工卡", "入籍", "公民申请", "身份调整",
  "i-130", "i130", "i-485", "i485", "i-589", "i589", "uscis", "移民法庭",
  "移民上诉", "入境", "边境申请", "亲属移民", "职业移民"
];

function clean(value = "") {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function containsAny(text, terms) {
  const normalized = clean(text).toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

export function resolveLegacyDisposition({ category = "", title = "", content = "", overrides = new Map() } = {}) {
  const archiveCategory = clean(category);
  const combined = `${clean(title)}\n${clean(content)}`;

  if (overrides instanceof Map && overrides.has(archiveCategory)) {
    return {
      action: "publish",
      targetCategory: clean(overrides.get(archiveCategory)),
      reason: "explicit-operator-override"
    };
  }

  if (archiveCategory === "移民美国") {
    if (containsAny(combined, ICE_ENFORCEMENT_TERMS)) {
      return {
        action: "manual_review",
        targetCategory: "ICE执法动态",
        reason: "immigration-archive-contains-ice-enforcement"
      };
    }
    if (containsAny(combined, IMMIGRATION_PROCESS_TERMS)) {
      return { action: "publish", targetCategory: "移民美国", reason: "immigration-process-content" };
    }
    return {
      action: "manual_review",
      targetCategory: "移民美国",
      reason: "immigration-category-boundary-uncertain"
    };
  }

  if (EXACT_PUBLISH.has(archiveCategory)) {
    return { action: "publish", targetCategory: archiveCategory, reason: "active-category-exact-match" };
  }

  const policy = CATEGORY_POLICY.get(archiveCategory);
  if (policy) return { ...policy };

  return { action: "unknown", targetCategory: "", reason: "no-category-policy" };
}

export const LEGACY_CATEGORY_POLICY = Object.freeze(
  Object.fromEntries([...CATEGORY_POLICY.entries()].map(([key, value]) => [key, { ...value }]))
);

const COMMON = /任正非|ren\s+zhengfei|华为|huawei|新闻|消息|最新|网传|据称|相关|近日|日前|视频|照片|截图|网友|表示|称/giu;
const ACTIONS = {
  runaway: /跑路|出逃|逃跑|逃离|离境|移居|流亡|海外定居|fled|flee|escape|runaway|exile/iu,
  response: /回应|否认|辟谣|澄清|证实|声明|官方答复|respond|deny|denied|clarif|confirm/iu,
  appearance: /露面|现身|出席|到访|会见|行程|公开活动|appear|attend|visit|meet/iu,
  interview: /采访|讲话|演讲|座谈|内部信|致辞|发言|interview|speech|remarks/iu,
  business: /股权|股份|合作|切割|出售|转让|架构|董事|管理层|赛力斯|问界|资产|business|share|stake|seres/iu,
  legal: /调查|起诉|法院|监管|制裁|拘捕|逮捕|传唤|investigat|court|sanction|arrest/iu,
};
const UPDATE_ACTIONS = new Set(["response", "appearance", "legal"]);

function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/https?:\/\/\S+/giu, " ").replace(COMMON, " ")
    .replace(/[^a-z0-9\u3400-\u9fff]+/giu, "").trim();
}

function grams(value, size = 2) {
  const source = normalized(value); const out = new Set();
  if (!source) return out;
  if (source.length < size) return new Set([source]);
  for (let index = 0; index <= source.length - size; index += 1) out.add(source.slice(index, index + size));
  return out;
}

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return common / Math.min(left.size, right.size);
}

export function renTextSimilarity(left, right) {
  const a = normalized(left); const b = normalized(right);
  if (!a || !b) return 0;
  if (a === b || (Math.min(a.length, b.length) >= 16 && (a.includes(b) || b.includes(a)))) return 1;
  return overlap(grams(a), grams(b));
}

export function renActionKeys(value) {
  const text = String(value || "");
  return new Set(Object.entries(ACTIONS).filter(([, pattern]) => pattern.test(text)).map(([key]) => key));
}

function concreteKeys(value) {
  const text = String(value || "").normalize("NFKC");
  const matches = text.match(/20\d{2}[年\-/]\d{1,2}(?:[月\-/]\d{1,2}日?)?|\d{1,2}月\d{1,2}日|\b\d+(?:\.\d+)?%?\b|北京|深圳|上海|香港|法国|加拿大|美国|欧洲|东莞|杭州|重庆|成都/giu) || [];
  return new Set(matches.map((item) => item.toLowerCase()));
}

export function hasSubstantiveRenUpdate(current, previous) {
  const currentActions = renActionKeys(current); const previousActions = renActionKeys(previous);
  for (const action of currentActions) if (UPDATE_ACTIONS.has(action) && !previousActions.has(action)) return true;
  const currentFacts = concreteKeys(current); const previousFacts = concreteKeys(previous);
  const hasUpdateCue = /新增|首次|最新进展|随后|刚刚|今日|今天|回应|否认|证实|声明|公告|通报|文件|露面|现身/iu.test(String(current || ""));
  return hasUpdateCue && [...currentFacts].some((item) => !previousFacts.has(item));
}

function articleText(row) {
  const original = row?.metadata && typeof row.metadata === "object" ? row.metadata.source_text_original : "";
  return [original, row?.title, row?.summary].filter(Boolean).join(" ");
}

export function sameRenEvent(current, previous) {
  const currentText = typeof current === "string" ? current : articleText(current);
  const previousText = typeof previous === "string" ? previous : articleText(previous);
  const score = renTextSimilarity(currentText, previousText);
  const currentActions = renActionKeys(currentText); const previousActions = renActionKeys(previousText);
  const sharedActions = [...currentActions].filter((key) => previousActions.has(key));
  const sameRunawayStory = currentActions.has("runaway") && previousActions.has("runaway");
  const likelySame = score >= 0.46 || sameRunawayStory || (score >= 0.28 && sharedActions.length > 0);
  return likelySame && !hasSubstantiveRenUpdate(currentText, previousText);
}

export function findRenEventDuplicate(current, rows) {
  return (Array.isArray(rows) ? rows : []).find((row) => sameRenEvent(current, row)) || null;
}


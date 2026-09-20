export const KNOWLEDGE_TIME_ZONE = 'America/New_York';

export const DAILY_PUBLICATION_HOUR = 8;

export const DAILY_EDITORIAL_PLAN = Object.freeze([
  { cumulative: 10, label: '基础规则与适用条件' },
  { cumulative: 20, label: '表格期限与证据准备' },
  { cumulative: 30, label: '面谈可信度与风险判断' },
  { cumulative: 40, label: '移民法庭与救济程序' },
  { cumulative: 50, label: '工卡家庭与数据解读' }
]);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KNOWLEDGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KNOWLEDGE_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23'
});

export function newYorkDateKey(value = new Date()) {
  return dateFormatter.format(new Date(value));
}

export function newYorkHour(value = new Date()) {
  return Number(hourFormatter.format(new Date(value)));
}

export function plannedDailyTarget(value = new Date(), dailyTarget = 50) {
  const hour = newYorkHour(value);
  return hour >= DAILY_PUBLICATION_HOUR ? Math.max(0, Number(dailyTarget) || 0) : 0;
}

export function publicationSlot(articleIndex) {
  const oneBased = Math.max(1, Number(articleIndex) + 1);
  return DAILY_EDITORIAL_PLAN.find(slot => oneBased <= slot.cumulative) || DAILY_EDITORIAL_PLAN.at(-1);
}

export function rotatingAngleOffset(dateKey, poolLength) {
  if (!poolLength) return 0;
  let hash = 0;
  for (const character of String(dateKey || '')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % poolLength;
}

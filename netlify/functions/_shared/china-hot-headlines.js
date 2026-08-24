const CHINA_HOT_CATEGORY = "热门头条";
const CHINA_HOT_DISPLAY_NAME = "中国热门头条";

const CHINA_SIGNALS = [
  "中国", "中国大陆", "大陆", "内地", "中共中央", "国务院", "全国人大", "全国政协", "最高人民法院", "最高人民检察院",
  "公安部", "教育部", "财政部", "商务部", "外交部", "国家卫健委", "国家发改委", "中国人民银行", "央行",
  "北京", "上海", "天津", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西",
  "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "内蒙古", "广西",
  "西藏", "宁夏", "新疆", "广州", "深圳", "武汉", "成都", "西安", "杭州", "南京", "苏州", "郑州", "长沙", "合肥",
  "济南", "青岛", "厦门", "福州", "南昌", "昆明", "贵阳", "海口", "乌鲁木齐", "哈尔滨", "长春", "沈阳", "大连",
  "抖音", "微博", "微信", "华为", "腾讯", "百度", "阿里巴巴", "京东", "拼多多", "小米", "比亚迪", "高考"
  , "习近平", "李强", "赵乐际", "王沪宁", "蔡奇", "丁薛祥", "李希", "中共", "共产党", "中央政治局", "政治局常委",
  "中央纪委", "国家监委", "纪委监委", "省委", "市委", "县委", "党委", "党政", "官员", "干部", "书记", "市长", "省长",
  "政协委员", "人大代表", "反腐", "双开", "落马", "巡视组", "宣传部", "统战部", "组织部", "政法委"
];

const US_SIGNALS = [
  "美国", "美方", "白宫", "国会", "参议院", "众议院", "特朗普", "川普", "联邦调查局", "国土安全部", "纽约",
  "洛杉矶", "芝加哥", "旧金山", "佛罗里达", "加州", "德州", "联邦法院", "美国最高法院", "fbi", "ice", "dhs"
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Classification is intentionally based on the headline and opening lead. A
// passing reference to China later in an American or international story must
// not make it a China headline.
function isChinaHotHeadline(title, content = "") {
  const headline = normalize(title);
  const lead = normalize(content).slice(0, 1200);
  if (!headline) return false;

  const firstIndex = (signals, text) => signals.reduce((best, signal) => {
    const index = text.indexOf(normalize(signal));
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
  const chinaHeadlineIndex = firstIndex(CHINA_SIGNALS, headline);
  const usHeadlineIndex = firstIndex(US_SIGNALS, headline);

  // If the headline is U.S.-led, a later reference to China does not make it a
  // China story. "中国回应美国……" remains valid because China is the subject.
  if (usHeadlineIndex >= 0 && (chinaHeadlineIndex < 0 || usHeadlineIndex < chinaHeadlineIndex)) {
    return false;
  }
  if (chinaHeadlineIndex >= 0) return true;
  return firstIndex(CHINA_SIGNALS, lead) >= 0;
}

function displayCategoryName(category) {
  return isChinaHotCategory(category)
    ? CHINA_HOT_DISPLAY_NAME
    : String(category || "");
}

function isChinaHotCategory(category) {
  const value = normalize(category);
  return value === normalize(CHINA_HOT_CATEGORY) || value === normalize(CHINA_HOT_DISPLAY_NAME);
}

module.exports = {
  CHINA_HOT_CATEGORY,
  CHINA_HOT_DISPLAY_NAME,
  isChinaHotCategory,
  isChinaHotHeadline,
  displayCategoryName
};

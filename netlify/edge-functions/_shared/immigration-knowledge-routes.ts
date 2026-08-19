export type ImmigrationKnowledgeTopic = { slug: string; name: string };
export type ImmigrationKnowledgeCategory = {
  slug: string;
  name: string;
  description: string;
  topics: ImmigrationKnowledgeTopic[];
};

export const IMMIGRATION_KNOWLEDGE_ROUTES: ImmigrationKnowledgeCategory[] = [
  {
    slug: "study",
    name: "赴美留学",
    description: "唐人日报赴美留学知识中心，系统整理F-1学生签证、学校申请、I-20、OPT、CPT、身份维持与常见风险。",
    topics: [
      ["f1", "F-1学生签证"], ["j1", "J-1交流访问"], ["m1", "M-1职业学生"], ["cpt", "CPT"],
      ["opt", "OPT"], ["stem-opt", "STEM OPT"], ["day-1-cpt", "Day 1 CPT"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "work",
    name: "赴美工作",
    description: "唐人日报赴美工作知识中心，系统整理H-1B、L-1、O-1等工作签证的资格、申请流程、材料、时间节点与身份维护。",
    topics: [
      ["h1b", "H-1B专业工作"], ["l1", "L-1跨国公司派遣"], ["o1", "O-1杰出人才"], ["h2a", "H-2A农业工"],
      ["h2b", "H-2B临时工"], ["tn", "TN专业人士"], ["e1-e2", "E-1/E-2商业签证"], ["r1", "R-1宗教工作者"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "employment",
    name: "职业移民",
    description: "唐人日报职业移民知识中心，系统整理EB-1、EB-2、NIW、EB-3等职业移民类别的资格、排期、材料与绿卡流程。",
    topics: [
      ["eb1a", "EB-1A杰出人才"], ["eb1b", "EB-1B教授研究员"], ["eb1c", "EB-1C跨国高管"], ["niw", "EB-2 NIW"],
      ["eb2-perm", "EB-2 PERM"], ["eb3", "EB-3"], ["eb4", "EB-4"], ["eb5", "EB-5投资移民"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "family",
    name: "家庭移民",
    description: "唐人日报家庭移民知识中心，系统整理婚姻绿卡、亲属移民、I-130、I-485、领事程序、担保与面谈相关知识。",
    topics: [
      ["citizen-spouse", "美国公民婚姻绿卡"], ["f2a", "绿卡配偶F2A"], ["k1", "K-1未婚夫/妻"], ["parents", "父母移民"],
      ["children", "子女移民"], ["siblings", "兄弟姐妹移民"], ["cr1-ir1", "CR-1/IR-1配偶移民"], ["family-preference", "F1/F2B/F3/F4优先类别"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "humanitarian",
    name: "人道主义庇护",
    description: "唐人日报人道主义保护知识中心，系统整理庇护、递解抗辩、CAT、U签证、T签证等程序、材料与常见风险。",
    topics: [
      ["asylum", "政治庇护"], ["withholding", "防止递解"], ["cat", "禁止酷刑公约保护"], ["vawa", "VAWA家暴保护"],
      ["u-visa", "U签证"], ["t-visa", "T签证"], ["sijs", "SIJS特殊青少年"], ["tps", "TPS临时保护身份"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "change-status",
    name: "境内身份转换",
    description: "唐人日报境内身份转换知识中心，系统整理美国境内身份延期、转换、I-539、身份衔接与常见合规风险。",
    topics: [
      ["b2-to-f1", "B-2转F-1"], ["f1-to-h1b", "F-1转H-1B"], ["j1-waiver", "J-1豁免"], ["extension", "身份延期"],
      ["reinstatement", "身份恢复"], ["i485", "I-485境内调整身份"], ["ead", "EAD工卡"], ["advance-parole", "Advance Parole旅行许可"]
    ].map(([slug, name]) => ({ slug, name }))
  },
  {
    slug: "citizenship",
    name: "入籍美国公民",
    description: "唐人日报美国入籍知识中心，系统整理N-400申请资格、连续居住、英文与公民考试、面谈及宣誓流程。",
    topics: [
      ["n400", "N-400入籍申请"], ["continuous-residence", "连续居住"], ["physical-presence", "实际居住"], ["tests", "英语与公民考试"],
      ["interview", "入籍面试"], ["oath", "入籍宣誓"], ["n600", "N-600公民证明"], ["derived-citizenship", "衍生与取得公民"]
    ].map(([slug, name]) => ({ slug, name }))
  }
];

export function immigrationCategory(slug: string) {
  return IMMIGRATION_KNOWLEDGE_ROUTES.find((item) => item.slug === slug) || null;
}

export function immigrationTopic(category: ImmigrationKnowledgeCategory, slug: string) {
  return category.topics.find((item) => item.slug === slug) || null;
}

export function immigrationKnowledgePaths() {
  const paths: string[] = [];
  for (const category of IMMIGRATION_KNOWLEDGE_ROUTES) {
    paths.push(`/immigrate/center?path=${encodeURIComponent(category.slug)}`);
    for (const topic of category.topics) {
      paths.push(`/immigrate/center?path=${encodeURIComponent(category.slug)}&topic=${encodeURIComponent(topic.slug)}`);
    }
  }
  return paths;
}

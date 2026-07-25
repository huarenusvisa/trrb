window.TRRB_IMMIGRATION_KNOWLEDGE = {
  version: "2026.07.25-2",
  title: "移民美国",
  description: "按照赴美目标查找签证、绿卡、身份转换和入籍知识。",
  categories: [
    {
      key: "study", slug: "study", nameZh: "赴美留学", nameEn: "Study in the U.S.",
      description: "通过学生或交流访问身份赴美学习，并了解毕业后的实习与身份规划。",
      items: [
        {name:"F-1学生签证",slug:"f1",summary:"全日制学术学习"},{name:"J-1交流访问",slug:"j1",summary:"交流访问项目"},{name:"M-1职业学生",slug:"m1",summary:"职业与非学术培训"},{name:"CPT",slug:"cpt",summary:"课程实习训练"},{name:"OPT",slug:"opt",summary:"毕业前后实习"},{name:"STEM OPT",slug:"stem-opt",summary:"STEM专业延期"},{name:"Day 1 CPT",slug:"day-1-cpt",summary:"入学即课程实习"}
      ],
      keywords: ["f1","f-1","学生签证","留学","学校","i-20","i20","sevis","j1","j-1","m1","m-1","opt","cpt","stem opt","语言学校","社区大学"]
    },
    {
      key:"work",slug:"work",nameZh:"赴美工作",nameEn:"Work in the U.S.",description:"通过非移民工作签证进入美国就业、派驻、创业或提供专业服务。",
      items:[{name:"H-1B专业工作",slug:"h1b"},{name:"L-1跨国公司派遣",slug:"l1"},{name:"O-1杰出人才",slug:"o1"},{name:"H-2A农业工",slug:"h2a"},{name:"H-2B临时工",slug:"h2b"},{name:"TN专业人士",slug:"tn"},{name:"E-1/E-2商业签证",slug:"e1-e2"},{name:"R-1宗教工作者",slug:"r1"}],
      keywords:["h1b","h-1b","工作签证","赴美工作","l1","l-1","o1","o-1","h2a","h-2a","h2b","h-2b","tn签证","e2签证","e-2","r1","r-1","雇主","劳工证"]
    },
    {
      key:"employment",slug:"employment",nameZh:"职业移民",nameEn:"Employment-Based Immigration",description:"通过专业能力、雇主担保、跨国管理、投资或特殊职业申请美国永久居民身份。",
      items:[{name:"EB-1A杰出人才",slug:"eb1a"},{name:"EB-1B教授研究员",slug:"eb1b"},{name:"EB-1C跨国高管",slug:"eb1c"},{name:"EB-2 NIW",slug:"niw"},{name:"EB-2 PERM",slug:"eb2-perm"},{name:"EB-3",slug:"eb3"},{name:"EB-4",slug:"eb4"},{name:"EB-5投资移民",slug:"eb5"}],
      keywords:["eb1","eb-1","eb1a","eb-1a","eb1b","eb1c","eb2","eb-2","niw","国家利益豁免","perm","eb3","eb-3","eb4","eb-4","eb5","eb-5","投资移民","职业移民","杰出人才","跨国高管"]
    },
    {
      key:"family",slug:"family",nameZh:"家庭移民",nameEn:"Family-Based Immigration",description:"通过美国公民或永久居民亲属关系申请移民签证或境内绿卡。",
      items:[{name:"美国公民婚姻绿卡",slug:"citizen-spouse"},{name:"绿卡配偶F2A",slug:"f2a"},{name:"K-1未婚夫/妻",slug:"k1"},{name:"父母移民",slug:"parents"},{name:"子女移民",slug:"children"},{name:"兄弟姐妹移民",slug:"siblings"},{name:"CR-1/IR-1",slug:"cr1-ir1"},{name:"F1/F2B/F3/F4",slug:"family-preference"}],
      keywords:["婚绿","婚姻绿卡","配偶绿卡","家庭移民","f2a","k1","k-1","cr1","cr-1","ir1","ir-1","父母移民","子女移民","兄弟姐妹移民","i-130","i130","亲属移民"]
    },
    {
      key:"humanitarian",slug:"humanitarian",nameZh:"人道主义庇护",nameEn:"Humanitarian Protection",description:"因迫害、犯罪伤害、人口贩运、家庭暴力或其他特殊风险寻求法律保护。",
      items:[{name:"政治庇护",slug:"asylum"},{name:"防止递解",slug:"withholding"},{name:"禁止酷刑公约保护",slug:"cat"},{name:"VAWA",slug:"vawa"},{name:"U签证",slug:"u-visa"},{name:"T签证",slug:"t-visa"},{name:"SIJS",slug:"sijs"},{name:"TPS",slug:"tps"}],
      keywords:["庇护","政治庇护","asylum","i-589","i589","防止递解","withholding","cat保护","禁止酷刑","vawa","u签证","t签证","sijs","特殊青少年","tps","难民","人道假释"]
    },
    {
      key:"change-status",slug:"change-status",nameZh:"境内身份转换",nameEn:"Change of Status in the U.S.",description:"人在美国境内时转换、延期、恢复或调整移民身份。",
      items:[{name:"B-2转F-1",slug:"b2-to-f1"},{name:"F-1转H-1B",slug:"f1-to-h1b"},{name:"J-1豁免",slug:"j1-waiver"},{name:"身份延期",slug:"extension"},{name:"身份恢复",slug:"reinstatement"},{name:"I-485境内调整身份",slug:"i485"},{name:"EAD工卡",slug:"ead"},{name:"Advance Parole",slug:"advance-parole"}],
      keywords:["身份转换","change of status","境内转身份","b2转f1","b-2转f-1","f1转h1b","j1豁免","身份延期","延期停留","身份恢复","reinstatement","i-485","i485","调整身份","ead","工卡","advance parole","回美证","身份逾期"]
    },
    {
      key:"citizenship",slug:"citizenship",nameZh:"入籍美国公民",nameEn:"U.S. Citizenship",description:"了解入籍资格、N-400申请、考试、面试、宣誓及公民身份证明。",
      items:[{name:"N-400入籍",slug:"n400"},{name:"连续居住",slug:"continuous-residence"},{name:"实际居住",slug:"physical-presence"},{name:"英语与公民考试",slug:"tests"},{name:"入籍面试",slug:"interview"},{name:"入籍宣誓",slug:"oath"},{name:"N-600公民证明",slug:"n600"},{name:"衍生公民",slug:"derived-citizenship"}],
      keywords:["入籍","美国公民","公民申请","n-400","n400","入籍考试","公民考试","入籍面试","宣誓","n-600","n600","衍生公民","连续居住"]
    }
  ]
};
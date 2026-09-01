import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ORIGIN = 'https://asylumjudge.com';
const DEFAULT_API = 'https://trrb.net/.netlify/functions/immigration-judges';
const TODAY = new Date().toISOString().slice(0, 10);
const DATASET_LICENSE_URL = `${ORIGIN}/methodology/#data-license`;
const DATASET_DESCRIPTION_MIN = 50;
const DATASET_DESCRIPTION_MAX = 5000;
const DATASET_LICENSE_SECTION = '<section id="data-license" class="note"><h2>数据使用与署名许可</h2><p>AsylumJudge整理生成的统计汇总与数据说明，可在注明“AsylumJudge.com”、保留原页面链接、统计期间、样本量和计算口径的前提下，用于信息查询、新闻报道和研究。基础数据仍受美国司法部EOIR原始来源条款约束；使用者不得删改关键口径、暗示EOIR或AsylumJudge为其结论背书，也不得把历史统计描述为个案预测。本数据库按现状提供，不保证适用于特定法律目的。</p></section>';

export const SEO_LOCALES = [
  { code: 'en', path: 'en', hreflang: 'en' },
  { code: 'es', path: 'es', hreflang: 'es' },
  { code: 'fr', path: 'fr', hreflang: 'fr' },
  { code: 'pt-BR', path: 'pt-br', hreflang: 'pt-BR' },
  { code: 'hi', path: 'hi', hreflang: 'hi' },
  { code: 'zh-Hans', path: '', hreflang: 'zh-Hans' },
  { code: 'zh-Hant', path: 'zh-hant', hreflang: 'zh-Hant' },
  { code: 'ru', path: 'ru', hreflang: 'ru' },
  { code: 'ar', path: 'ar', hreflang: 'ar' },
  { code: 'tr', path: 'tr', hreflang: 'tr' }
];

const copy = {
  en: {
    home: ['U.S. Immigration Judge Approval Rates & Court Data | AsylumJudge', 'Search U.S. immigration judges, immigration courts, state asylum data, nationality outcomes, approval rates, denial rates, case counts, and official judge backgrounds.'],
    courts: ['U.S. Immigration Court Asylum Approval Rates | AsylumJudge', 'Compare asylum decisions, approval rates, denial rates, judges, and case counts across U.S. immigration courts.'],
    states: ['Asylum Approval Rates by U.S. State | AsylumJudge', 'Compare immigration court asylum decisions, grants, denials, other outcomes, and approval rates by state and fiscal year.'],
    nationality: ['Asylum Outcomes by Nationality | AsylumJudge', 'Search U.S. immigration court asylum outcomes by nationality, including approvals, denials, other outcomes, sample sizes, and time trends.'],
    compare: ['Compare U.S. Immigration Judges | Approval Rates & Trends | AsylumJudge', 'Compare 2–4 U.S. immigration judges by asylum approval rate, denial rate, sample size, yearly trend, applicant nationality, and official background.'],
    methodology: ['AsylumJudge Data Sources and Methodology', 'Learn how AsylumJudge calculates asylum approval rates, handles other outcomes and small samples, and identifies official EOIR data sources.'],
    judgeTitle: (name) => `${name} Immigration Judge Approval Rate | AsylumJudge`,
    judgeDescription: (name, court, total) => `View ${name}'s asylum decisions, approval and denial data, ${total} recorded outcomes, court assignment, data period, and official background${court ? ` at ${court}` : ''}.`,
    courtTitle: (name) => `${name} Asylum Approval Rate & Judges | AsylumJudge`,
    courtDescription: (name, total) => `View ${name} immigration judges, ${total} asylum decisions, approvals, denials, other outcomes, and decision approval rate.`,
    nationalityTitle: (name) => `${name} Asylum Approval Rate & Outcomes | AsylumJudge`,
    nationalityDescription: (name, total) => `View ${total} U.S. immigration court asylum outcomes for applicants from ${name}, including approvals, denials, other results, and historical trends.`,
    summary: (name, court, total, grants, denials, other) => `${name} is listed with ${court || 'a U.S. immigration court'}. The database records ${total} asylum outcomes: ${grants} approved, ${denials} denied, and ${other} other outcomes. Historical statistics are informational and cannot predict an individual case.`
  },
  es: {
    home: ['Tasas de aprobación de jueces de inmigración de EE. UU. | AsylumJudge', 'Busque jueces y tribunales de inmigración, datos estatales, resultados por nacionalidad, aprobaciones, denegaciones, muestras y antecedentes oficiales.'],
    courts: ['Tasas de asilo de tribunales de inmigración de EE. UU. | AsylumJudge', 'Compare decisiones, aprobaciones, denegaciones, jueces y muestras de los tribunales de inmigración de Estados Unidos.'],
    states: ['Tasas de aprobación de asilo por estado | AsylumJudge', 'Compare decisiones de asilo, aprobaciones, denegaciones y otros resultados por estado y año fiscal.'],
    nationality: ['Resultados de asilo por nacionalidad | AsylumJudge', 'Busque resultados de asilo por nacionalidad, incluidas aprobaciones, denegaciones, otros resultados, muestras y tendencias.'],
    compare: ['Compare jueces de inmigración de EE. UU. | AsylumJudge', 'Compare entre 2 y 4 jueces por tasa de aprobación, denegación, muestra, tendencia anual, nacionalidad y antecedentes oficiales.'],
    methodology: ['Fuentes y metodología de AsylumJudge', 'Conozca el cálculo de las tasas, el tratamiento de otros resultados, las muestras pequeñas y las fuentes oficiales de EOIR.'],
    judgeTitle: (name) => `${name}: tasa de aprobación del juez de inmigración | AsylumJudge`,
    judgeDescription: (name, court, total) => `Consulte las decisiones de asilo de ${name}, aprobaciones, denegaciones, ${total} resultados, tribunal, período y antecedentes oficiales${court ? ` en ${court}` : ''}.`,
    courtTitle: (name) => `${name}: tasa de asilo y jueces | AsylumJudge`,
    courtDescription: (name, total) => `Consulte los jueces de ${name}, ${total} decisiones de asilo, aprobaciones, denegaciones y otros resultados.`,
    nationalityTitle: (name) => `${name}: tasa de aprobación y resultados de asilo | AsylumJudge`,
    nationalityDescription: (name, total) => `Consulte ${total} resultados de asilo de tribunales de inmigración para solicitantes de ${name}, incluidas aprobaciones, denegaciones y otros resultados.`,
    summary: (name, court, total, grants, denials, other) => `${name} figura en ${court || 'un tribunal de inmigración de EE. UU.'}. La base registra ${total} resultados: ${grants} aprobados, ${denials} denegados y ${other} otros. Las estadísticas históricas no predicen un caso individual.`
  },
  fr: {
    home: ['Taux d’approbation des juges de l’immigration américains | AsylumJudge', 'Recherchez les juges et tribunaux de l’immigration, les données par État et nationalité, les décisions et les biographies officielles.'],
    courts: ['Taux d’asile des tribunaux de l’immigration américains | AsylumJudge', 'Comparez décisions, approbations, refus, juges et volumes des tribunaux de l’immigration américains.'],
    states: ['Taux d’approbation de l’asile par État | AsylumJudge', 'Comparez les décisions d’asile, approbations, refus et autres résultats par État et exercice.'],
    nationality: ['Résultats de l’asile par nationalité | AsylumJudge', 'Recherchez les résultats par nationalité, les approbations, les refus, les autres résultats, les échantillons et les tendances.'],
    compare: ['Comparer les juges de l’immigration américaine | AsylumJudge', 'Comparez 2 à 4 juges selon les approbations, refus, volumes, tendances annuelles, nationalités et parcours officiels.'],
    methodology: ['Sources et méthodologie AsylumJudge', 'Découvrez le calcul des taux, le traitement des autres résultats, des petits échantillons et des sources officielles EOIR.'],
    judgeTitle: (name) => `${name} : taux d’approbation du juge | AsylumJudge`,
    judgeDescription: (name, court, total) => `Consultez les décisions d’asile de ${name}, approbations, refus, ${total} résultats, tribunal, période et parcours officiel${court ? ` à ${court}` : ''}.`,
    courtTitle: (name) => `${name} : taux d’asile et juges | AsylumJudge`,
    courtDescription: (name, total) => `Consultez les juges de ${name}, ${total} décisions d’asile, approbations, refus et autres résultats.`,
    nationalityTitle: (name) => `${name} : taux et résultats de l’asile | AsylumJudge`,
    nationalityDescription: (name, total) => `Consultez ${total} résultats de l’asile pour les demandeurs de ${name}, dont approbations, refus et autres résultats.`,
    summary: (name, court, total, grants, denials, other) => `${name} est associé à ${court || 'un tribunal de l’immigration américain'}. La base recense ${total} résultats : ${grants} approbations, ${denials} refus et ${other} autres. Les statistiques historiques ne prédisent pas un dossier.`
  },
  'pt-BR': {
    home: ['Taxas de aprovação de juízes de imigração dos EUA | AsylumJudge', 'Pesquise juízes e tribunais de imigração, dados estaduais e por nacionalidade, decisões, amostras e históricos oficiais.'],
    courts: ['Taxas de asilo dos tribunais de imigração dos EUA | AsylumJudge', 'Compare decisões, aprovações, negativas, juízes e volumes dos tribunais de imigração dos EUA.'],
    states: ['Taxas de aprovação de asilo por estado | AsylumJudge', 'Compare decisões de asilo, aprovações, negativas e outros resultados por estado e ano fiscal.'],
    nationality: ['Resultados de asilo por nacionalidade | AsylumJudge', 'Pesquise aprovações, negativas, outros resultados, amostras e tendências de asilo por nacionalidade.'],
    compare: ['Compare juízes de imigração dos EUA | AsylumJudge', 'Compare de 2 a 4 juízes por aprovação, negativa, amostra, tendência anual, nacionalidade e histórico oficial.'],
    methodology: ['Fontes e metodologia do AsylumJudge', 'Veja como as taxas são calculadas e como resultados, amostras pequenas e fontes oficiais do EOIR são tratados.'],
    judgeTitle: (name) => `${name}: taxa de aprovação do juiz | AsylumJudge`,
    judgeDescription: (name, court, total) => `Veja decisões de asilo de ${name}, aprovações, negativas, ${total} resultados, tribunal, período e histórico oficial${court ? ` em ${court}` : ''}.`,
    courtTitle: (name) => `${name}: taxa de asilo e juízes | AsylumJudge`,
    courtDescription: (name, total) => `Veja os juízes de ${name}, ${total} decisões de asilo, aprovações, negativas e outros resultados.`,
    nationalityTitle: (name) => `${name}: taxa e resultados de asilo | AsylumJudge`,
    nationalityDescription: (name, total) => `Veja ${total} resultados de asilo para solicitantes de ${name}, incluindo aprovações, negativas e outros resultados.`,
    summary: (name, court, total, grants, denials, other) => `${name} aparece em ${court || 'um tribunal de imigração dos EUA'}. A base registra ${total} resultados: ${grants} aprovados, ${denials} negados e ${other} outros. Estatísticas históricas não preveem casos individuais.`
  },
  hi: {
    home: ['अमेरिकी इमिग्रेशन जज शरण अनुमोदन दर | AsylumJudge', 'अमेरिकी इमिग्रेशन जज, अदालत, राज्य और राष्ट्रीयता डेटा, अनुमोदन, अस्वीकृति, नमूने और आधिकारिक पृष्ठभूमि खोजें।'],
    courts: ['अमेरिकी इमिग्रेशन कोर्ट शरण अनुमोदन दर | AsylumJudge', 'अमेरिकी इमिग्रेशन कोर्ट के निर्णय, अनुमोदन, अस्वीकृति, जज और नमूना आकार की तुलना करें।'],
    states: ['अमेरिकी राज्य के अनुसार शरण अनुमोदन दर | AsylumJudge', 'राज्य और वित्त वर्ष के अनुसार शरण निर्णय, अनुमोदन, अस्वीकृति और अन्य परिणाम देखें।'],
    nationality: ['राष्ट्रीयता के अनुसार शरण परिणाम | AsylumJudge', 'राष्ट्रीयता के अनुसार अनुमोदन, अस्वीकृति, अन्य परिणाम, नमूना आकार और रुझान खोजें।'],
    compare: ['अमेरिकी इमिग्रेशन जज की तुलना | AsylumJudge', '2–4 जजों की अनुमोदन दर, अस्वीकृति, नमूना, वार्षिक रुझान, राष्ट्रीयता और आधिकारिक पृष्ठभूमि की तुलना करें।'],
    methodology: ['AsylumJudge डेटा स्रोत और कार्यप्रणाली', 'अनुमोदन दर, अन्य परिणाम, छोटे नमूनों और आधिकारिक EOIR स्रोतों की कार्यप्रणाली पढ़ें।'],
    judgeTitle: (name) => `${name} इमिग्रेशन जज अनुमोदन दर | AsylumJudge`,
    judgeDescription: (name, court, total) => `${name} के शरण निर्णय, अनुमोदन, अस्वीकृति, ${total} परिणाम, अदालत, डेटा अवधि और आधिकारिक पृष्ठभूमि देखें${court ? ` — ${court}` : ''}।`,
    courtTitle: (name) => `${name} शरण अनुमोदन दर और जज | AsylumJudge`,
    courtDescription: (name, total) => `${name} के जज, ${total} शरण निर्णय, अनुमोदन, अस्वीकृति और अन्य परिणाम देखें।`,
    nationalityTitle: (name) => `${name} शरण अनुमोदन दर और परिणाम | AsylumJudge`,
    nationalityDescription: (name, total) => `${name} के आवेदकों के ${total} शरण परिणाम देखें, जिनमें अनुमोदन, अस्वीकृति और अन्य परिणाम शामिल हैं।`,
    summary: (name, court, total, grants, denials, other) => `${name} ${court || 'एक अमेरिकी इमिग्रेशन कोर्ट'} से संबद्ध हैं। डेटाबेस में ${total} परिणाम हैं: ${grants} अनुमोदित, ${denials} अस्वीकृत और ${other} अन्य। ऐतिहासिक आँकड़े व्यक्तिगत मामले की भविष्यवाणी नहीं करते।`
  },
  'zh-Hans': {
    home: ['美国移民法官通过率｜法官、法院与庇护裁决数据', '查询美国移民法官、移民法院、各州及不同国籍的庇护批准率、拒绝率、案件样本量、数据时间和法官官方背景。'],
    courts: ['美国移民法院庇护通过率查询｜AsylumJudge', '比较美国各移民法院的法官人数、庇护裁决量、批准、拒绝、其他结果和裁决批准率。'],
    states: ['美国各州庇护批准率与移民法院数据｜AsylumJudge', '按州和财政年度比较美国移民法院庇护裁决、批准、拒绝、其他结果与通过率。'],
    nationality: ['各国国籍庇护批准率与裁决趋势｜AsylumJudge', '按国籍查询美国移民法庭庇护批准、拒绝、其他结果、样本量及月度、季度和年度趋势。'],
    compare: ['移民法官对比｜批准率、样本量与年度趋势｜AsylumJudge', '选择2至4名美国移民法官，对比庇护批准率、拒绝率、样本量、年度趋势、申请人国籍和官方任命背景。'],
    methodology: ['AsylumJudge数据来源与庇护通过率计算方法', '了解AsylumJudge如何计算庇护批准率、处理其他结果和小样本，以及如何核验EOIR官方数据来源。'],
    judgeTitle: (name) => `${name}移民法官通过率、裁决数据与背景｜AsylumJudge`,
    judgeDescription: (name, court, total) => `查看${name}移民法官的庇护批准、拒绝、${total}件记录结果、数据时间和官方背景${court ? `，现列于${court}` : ''}。`,
    courtTitle: (name) => `${name}庇护通过率、法官与裁决数据｜AsylumJudge`,
    courtDescription: (name, total) => `查看${name}的移民法官、${total}件庇护裁决、批准、拒绝、其他结果及裁决批准率。`,
    nationalityTitle: (name) => `${name}申请人庇护批准率与裁决结果｜AsylumJudge`,
    nationalityDescription: (name, total) => `查看${name}申请人在美国移民法庭的${total}件庇护结果，包括批准、拒绝、其他结果和历史趋势。`,
    summary: (name, court, total, grants, denials, other) => `${name}目前资料列于${court || '美国移民法院'}。数据库记录${total}件庇护结果，其中批准${grants}件、拒绝${denials}件、其他${other}件。历史数据仅供信息参考，不能预测个案结果。`
  },
  'zh-Hant': {
    home: ['美國移民法官批准率｜法官、法院與庇護裁決資料', '查詢美國移民法官、法院、各州及不同國籍的庇護批准率、拒絕率、案件樣本、資料期間和法官官方背景。'],
    courts: ['美國移民法院庇護批准率查詢｜AsylumJudge', '比較美國各移民法院的法官人數、庇護裁決量、批准、拒絕、其他結果和裁決批准率。'],
    states: ['美國各州庇護批准率與移民法院資料｜AsylumJudge', '按州和財政年度比較美國移民法院庇護裁決、批准、拒絕、其他結果與批准率。'],
    nationality: ['各國國籍庇護批准率與裁決趨勢｜AsylumJudge', '按國籍查詢美國移民法庭庇護批准、拒絕、其他結果、樣本量及各期間趨勢。'],
    compare: ['移民法官比較｜批准率、樣本與年度趨勢｜AsylumJudge', '選擇2至4名美國移民法官，比較庇護批准率、拒絕率、樣本、年度趨勢、申請人國籍和官方任命背景。'],
    methodology: ['AsylumJudge資料來源與庇護批准率計算方法', '了解AsylumJudge如何計算庇護批准率、處理其他結果和小樣本，以及核驗EOIR官方來源。'],
    judgeTitle: (name) => `${name}移民法官批准率、裁決資料與背景｜AsylumJudge`,
    judgeDescription: (name, court, total) => `查看${name}移民法官的庇護批准、拒絕、${total}件記錄結果、資料期間和官方背景${court ? `，現列於${court}` : ''}。`,
    courtTitle: (name) => `${name}庇護批准率、法官與裁決資料｜AsylumJudge`,
    courtDescription: (name, total) => `查看${name}的移民法官、${total}件庇護裁決、批准、拒絕、其他結果及裁決批准率。`,
    nationalityTitle: (name) => `${name}申請人庇護批准率與裁決結果｜AsylumJudge`,
    nationalityDescription: (name, total) => `查看${name}申請人在美國移民法庭的${total}件庇護結果，包括批准、拒絕、其他結果和歷史趨勢。`,
    summary: (name, court, total, grants, denials, other) => `${name}目前資料列於${court || '美國移民法院'}。資料庫記錄${total}件庇護結果，其中批准${grants}件、拒絕${denials}件、其他${other}件。歷史資料不能預測個案結果。`
  },
  ru: {
    home: ['Доля одобрений у иммиграционных судей США | AsylumJudge', 'Поиск иммиграционных судей и судов США, данных по штатам и гражданству, решений, выборок и официальных биографий.'],
    courts: ['Доли одобрения убежища в иммиграционных судах США | AsylumJudge', 'Сравните решения, одобрения, отказы, судей и объёмы дел в иммиграционных судах США.'],
    states: ['Одобрение убежища по штатам США | AsylumJudge', 'Сравните решения об убежище, одобрения, отказы и другие исходы по штатам и финансовым годам.'],
    nationality: ['Результаты убежища по гражданству | AsylumJudge', 'Ищите одобрения, отказы, другие исходы, размеры выборок и тенденции по гражданству.'],
    compare: ['Сравнение иммиграционных судей США | AsylumJudge', 'Сравните 2–4 судей по доле одобрений, отказам, выборке, годовым тенденциям, гражданству и официальной биографии.'],
    methodology: ['Источники и методика AsylumJudge', 'Узнайте о расчёте долей, других исходах, малых выборках и официальных источниках EOIR.'],
    judgeTitle: (name) => `${name}: одобрение убежища иммиграционным судьёй | AsylumJudge`,
    judgeDescription: (name, court, total) => `Решения ${name}: одобрения, отказы, ${total} исходов, суд, период и официальная биография${court ? ` — ${court}` : ''}.`,
    courtTitle: (name) => `${name}: одобрение убежища и судьи | AsylumJudge`,
    courtDescription: (name, total) => `Судьи ${name}, ${total} решений об убежище, одобрения, отказы и другие исходы.`,
    nationalityTitle: (name) => `${name}: одобрение и результаты убежища | AsylumJudge`,
    nationalityDescription: (name, total) => `${total} результатов убежища для заявителей из ${name}, включая одобрения, отказы и другие исходы.`,
    summary: (name, court, total, grants, denials, other) => `${name} указан(а) в ${court || 'иммиграционном суде США'}. В базе ${total} исходов: ${grants} одобрений, ${denials} отказов и ${other} других. Исторические данные не предсказывают отдельное дело.`
  },
  ar: {
    home: ['نسب موافقة قضاة الهجرة الأمريكية | AsylumJudge', 'ابحث عن قضاة ومحاكم الهجرة والبيانات حسب الولاية والجنسية والقرارات والعينات والسير الرسمية.'],
    courts: ['نسب اللجوء في محاكم الهجرة الأمريكية | AsylumJudge', 'قارن القرارات والموافقات والرفض والقضاة وأحجام القضايا في محاكم الهجرة الأمريكية.'],
    states: ['نسب الموافقة على اللجوء حسب الولاية | AsylumJudge', 'قارن قرارات اللجوء والموافقات والرفض والنتائج الأخرى حسب الولاية والسنة المالية.'],
    nationality: ['نتائج اللجوء حسب الجنسية | AsylumJudge', 'ابحث عن الموافقات والرفض والنتائج الأخرى وأحجام العينات والاتجاهات حسب الجنسية.'],
    compare: ['مقارنة قضاة الهجرة الأمريكية | AsylumJudge', 'قارن بين قاضيين إلى أربعة حسب الموافقات والرفض وحجم العينة والاتجاه السنوي والجنسية والسيرة الرسمية.'],
    methodology: ['مصادر ومنهجية AsylumJudge', 'تعرّف إلى حساب النسب والنتائج الأخرى والعينات الصغيرة ومصادر EOIR الرسمية.'],
    judgeTitle: (name) => `${name}: نسبة موافقة قاضي الهجرة | AsylumJudge`,
    judgeDescription: (name, court, total) => `اعرض قرارات ${name} والموافقات والرفض و${total} نتيجة والمحكمة والفترة والسيرة الرسمية${court ? ` في ${court}` : ''}.`,
    courtTitle: (name) => `${name}: نسبة اللجوء والقضاة | AsylumJudge`,
    courtDescription: (name, total) => `اعرض قضاة ${name} و${total} قرار لجوء والموافقات والرفض والنتائج الأخرى.`,
    nationalityTitle: (name) => `${name}: نسبة ونتائج اللجوء | AsylumJudge`,
    nationalityDescription: (name, total) => `اعرض ${total} نتيجة لجوء لمتقدمين من ${name}، بما فيها الموافقات والرفض والنتائج الأخرى.`,
    summary: (name, court, total, grants, denials, other) => `يظهر ${name} في ${court || 'محكمة هجرة أمريكية'}. تسجل القاعدة ${total} نتيجة: ${grants} موافقة و${denials} رفض و${other} نتائج أخرى. لا تتنبأ الإحصاءات التاريخية بقضية فردية.`
  },
  tr: {
    home: ['ABD göçmenlik hâkimi sığınma onay oranları | AsylumJudge', 'ABD göçmenlik hâkimleri, mahkemeler, eyalet ve uyruk verileri, kararlar, örneklemler ve resmî özgeçmişleri arayın.'],
    courts: ['ABD göçmenlik mahkemesi sığınma oranları | AsylumJudge', 'ABD göçmenlik mahkemelerindeki kararları, onayları, retleri, hâkimleri ve dosya sayılarını karşılaştırın.'],
    states: ['ABD eyaletlerine göre sığınma onay oranları | AsylumJudge', 'Eyalet ve mali yıla göre sığınma kararlarını, onayları, retleri ve diğer sonuçları karşılaştırın.'],
    nationality: ['Uyruğa göre sığınma sonuçları | AsylumJudge', 'Uyruğa göre onay, ret, diğer sonuçlar, örneklem büyüklüğü ve eğilimleri arayın.'],
    compare: ['ABD göçmenlik hâkimlerini karşılaştırın | AsylumJudge', '2–4 hâkimi onay, ret, örneklem, yıllık eğilim, uyruk ve resmî geçmiş açısından karşılaştırın.'],
    methodology: ['AsylumJudge veri kaynakları ve yöntemi', 'Oran hesaplamasını, diğer sonuçları, küçük örneklemleri ve resmî EOIR kaynaklarını inceleyin.'],
    judgeTitle: (name) => `${name} göçmenlik hâkimi onay oranı | AsylumJudge`,
    judgeDescription: (name, court, total) => `${name} için sığınma kararları, onaylar, retler, ${total} sonuç, mahkeme, dönem ve resmî geçmiş${court ? ` — ${court}` : ''}.`,
    courtTitle: (name) => `${name} sığınma oranı ve hâkimler | AsylumJudge`,
    courtDescription: (name, total) => `${name} hâkimleri, ${total} sığınma kararı, onay, ret ve diğer sonuçlar.`,
    nationalityTitle: (name) => `${name} sığınma onay oranı ve sonuçları | AsylumJudge`,
    nationalityDescription: (name, total) => `${name} başvuru sahipleri için ${total} sığınma sonucu; onay, ret ve diğer sonuçlar.`,
    summary: (name, court, total, grants, denials, other) => `${name}, ${court || 'bir ABD göçmenlik mahkemesinde'} listelenir. Veri tabanında ${total} sonuç vardır: ${grants} onay, ${denials} ret ve ${other} diğer. Tarihsel veriler tek bir davayı öngörmez.`
  }
};

const backgroundDirectoryCopy = {
  en: ['Official U.S. Immigration Judge Backgrounds | AsylumJudge', 'Browse verified DOJ and EOIR appointment biographies, education, bar admissions, court assignments, and official sources for U.S. immigration judges.', 'Official DOJ/EOIR profile'],
  es: ['Antecedentes oficiales de jueces de inmigración | AsylumJudge', 'Consulte biografías oficiales verificadas de DOJ y EOIR, educación, colegios de abogados, tribunales y fuentes.', 'Perfil oficial DOJ/EOIR'],
  fr: ['Parcours officiels des juges de l’immigration | AsylumJudge', 'Consultez les biographies de nomination DOJ et EOIR vérifiées, la formation, les barreaux, les tribunaux et les sources.', 'Profil officiel DOJ/EOIR'],
  'pt-BR': ['Históricos oficiais de juízes de imigração | AsylumJudge', 'Consulte biografias verificadas do DOJ e EOIR, formação, registros profissionais, tribunais e fontes oficiais.', 'Perfil oficial DOJ/EOIR'],
  hi: ['अमेरिकी इमिग्रेशन जज की आधिकारिक पृष्ठभूमि | AsylumJudge', 'DOJ और EOIR की सत्यापित नियुक्ति जीवनी, शिक्षा, बार सदस्यता, अदालत और आधिकारिक स्रोत देखें।', 'आधिकारिक DOJ/EOIR प्रोफ़ाइल'],
  'zh-Hans': ['美国移民法官官方背景与任命资料｜AsylumJudge', '查询经核验的 DOJ/EOIR 官方任命履历、教育经历、执业资格、任命法院和原始来源。', 'DOJ/EOIR 官方履历'],
  'zh-Hant': ['美國移民法官官方背景與任命資料｜AsylumJudge', '查詢經核驗的 DOJ/EOIR 官方任命履歷、教育經歷、執業資格、任命法院和原始來源。', 'DOJ/EOIR 官方履歷'],
  ru: ['Официальные биографии иммиграционных судей США | AsylumJudge', 'Проверенные сведения DOJ и EOIR о назначении, образовании, адвокатском статусе, судах и официальных источниках.', 'Официальный профиль DOJ/EOIR'],
  ar: ['الخلفيات الرسمية لقضاة الهجرة الأمريكية | AsylumJudge', 'تصفح سير التعيين الموثقة من DOJ وEOIR والتعليم والعضوية المهنية والمحاكم والمصادر الرسمية.', 'ملف DOJ/EOIR الرسمي'],
  tr: ['ABD göçmenlik hâkimlerinin resmî geçmişleri | AsylumJudge', 'Doğrulanmış DOJ ve EOIR atama özgeçmişlerini, eğitimi, baro üyeliğini, mahkemeleri ve resmî kaynakları inceleyin.', 'Resmî DOJ/EOIR profili']
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const escapeXml = escapeHtml;
const cleanName = (value) => {
  const name = String(value || '').trim();
  if (!name.includes(',')) return name;
  const [last, ...rest] = name.split(',');
  return `${rest.join(' ').trim()} ${last.trim()}`.trim();
};
const slugify = (value) => cleanName(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
const shortId = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
const n = (value) => Number(value || 0);
const localeNumber = (value, locale) => n(value).toLocaleString(locale);
const rate = (row) => row?.adjudicated_approval_rate == null ? '—' : `${Number(row.adjudicated_approval_rate).toFixed(1)}%`;
const lastmod = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : TODAY;
const nameKey = (value) => {
  const name = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:jr|sr|ii|iii|iv)\.?\b/gi, '')
    .replace(/[^a-zA-Z,' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!name) return '';
  if (name.includes(',')) {
    const [last, rest] = name.split(',', 2);
    const first = String(rest || '').trim().split(/\s+/)[0];
    return first && last ? `${last.trim()}|${first}` : '';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts.at(-1)}|${parts[0]}` : parts[0];
};

const localizedPath = (locale, relative = '') => {
  const clean = String(relative || '').replace(/^\/+|\/+$/g, '');
  const prefix = locale.path ? `/${locale.path}` : '';
  return `${prefix}/${clean}${clean ? '/' : ''}`.replace(/\/+/g, '/');
};
const localizedUrl = (locale, relative = '') => `${ORIGIN}${localizedPath(locale, relative)}`;
const alternateLinks = (relative) => `${SEO_LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale.hreflang}" href="${localizedUrl(locale, relative)}">`).join('\n  ')}\n  <link rel="alternate" hreflang="x-default" href="${localizedUrl(SEO_LOCALES.find((item) => item.code === 'zh-Hans'), relative)}">`;

function injectSeoHead(html, { locale, relative, title, description, schema }) {
  const canonical = localizedUrl(locale, relative);
  let next = html
    .replace(/<html\b[^>]*>/i, `<html lang="${locale.code}"${locale.code === 'ar' ? ' dir="rtl"' : ''}>`)
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace(/\s*<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/\s*<link\s+rel=["']alternate["'][^>]*>/gi, '')
    .replace(/\s*<meta\s+property=["']og:(?:title|description|url|type)["'][^>]*>/gi, '')
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const json = JSON.stringify(schema).replace(/</g, '\\u003c');
  const tags = `
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${canonical}">
  ${alternateLinks(relative)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ORIGIN}/asylumjudge/og-logo.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ORIGIN}/asylumjudge/og-logo.png">
  <script type="application/ld+json" data-seo-generated>${json}</script>`;
  return next.replace('</head>', `${tags}\n</head>`);
}

function siteSchema(locale, canonical, pageName, description) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${ORIGIN}/#organization`, name: 'AsylumJudge.com', url: `${ORIGIN}/`, logo: { '@type': 'ImageObject', url: `${ORIGIN}/asylumjudge/icon-512.png`, width: 512, height: 512 } },
      { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'AsylumJudge.com', url: `${ORIGIN}/`, inLanguage: locale.code, publisher: { '@id': `${ORIGIN}/#organization` } },
      { '@type': 'WebPage', '@id': `${canonical}#webpage`, name: pageName, description, url: canonical, inLanguage: locale.code, isPartOf: { '@id': `${ORIGIN}/#website` }, publisher: { '@id': `${ORIGIN}/#organization` } }
    ]
  };
}

function judgeSchema(locale, canonical, judge, title, description) {
  const name = cleanName(judge.judge_name);
  const background = judge.background || judge.background_summary;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: locale.code, dateModified: lastmod(background?.source_date || judge.source_updated_at), mainEntity: { '@id': `${canonical}#judge` }, isPartOf: { '@id': `${ORIGIN}/#website` } },
      { '@type': 'Person', '@id': `${canonical}#judge`, name, jobTitle: background?.appointment_type || 'U.S. Immigration Judge', description: background?.biography || undefined, identifier: judge.id, worksFor: judge.court_name ? { '@type': 'GovernmentOrganization', name: judge.court_name } : undefined, sameAs: background?.source_url ? [background.source_url] : undefined },
      { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'AsylumJudge.com', url: `${ORIGIN}/` }
    ]
  };
}

function courtSchema(locale, canonical, court, title, description) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: locale.code, dateModified: TODAY, mainEntity: { '@id': `${canonical}#court` }, isPartOf: { '@id': `${ORIGIN}/#website` } },
      { '@type': 'GovernmentOrganization', '@id': `${canonical}#court`, name: court.court_name, address: { '@type': 'PostalAddress', addressLocality: court.court_city, addressRegion: court.court_state, addressCountry: 'US' } },
      { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'AsylumJudge.com', url: `${ORIGIN}/` }
    ]
  };
}

function nationalitySchema(locale, canonical, country, title, description, modified) {
  const descriptionAddenda = {
    en: 'The dataset reports grants, denials, other outcomes, sample size, and the available EOIR reporting period.',
    es: 'El conjunto de datos informa aprobaciones, denegaciones, otros resultados, tamaño de muestra y período EOIR disponible.',
    fr: 'Le jeu de données indique les approbations, les refus, les autres résultats, la taille de l’échantillon et la période EOIR disponible.',
    'pt-BR': 'O conjunto de dados informa aprovações, negativas, outros resultados, tamanho da amostra e período EOIR disponível.',
    hi: 'डेटासेट में स्वीकृतियां, अस्वीकृतियां, अन्य परिणाम, नमूना आकार और उपलब्ध EOIR रिपोर्टिंग अवधि शामिल है।',
    'zh-Hans': '该数据集同时列明批准、拒绝、其他结案结果、有效样本量以及可核验的EOIR数据统计期间。',
    'zh-Hant': '該資料集同時列明批准、拒絕、其他結案結果、有效樣本量以及可核驗的EOIR資料統計期間。',
    ru: 'Набор данных содержит одобрения, отказы, другие исходы, размер выборки и доступный период отчётности EOIR.',
    ar: 'تتضمن مجموعة البيانات الموافقات والرفض والنتائج الأخرى وحجم العينة وفترة تقارير EOIR المتاحة.',
    tr: 'Veri kümesi onayları, retleri, diğer sonuçları, örneklem büyüklüğünü ve mevcut EOIR raporlama dönemini içerir.'
  };
  const datasetDescription = `${description} ${descriptionAddenda[locale.code] || descriptionAddenda.en}`.trim().slice(0, DATASET_DESCRIPTION_MAX);
  if (datasetDescription.length < DATASET_DESCRIPTION_MIN) {
    throw new Error(`Dataset description is shorter than ${DATASET_DESCRIPTION_MIN} characters for ${locale.code}: ${country.nationality}`);
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: locale.code, dateModified: modified, mainEntity: { '@id': `${canonical}#dataset` }, isPartOf: { '@id': `${ORIGIN}/#website` } },
      { '@type': 'Dataset', '@id': `${canonical}#dataset`, name: title, description: datasetDescription, url: canonical, creator: { '@type': 'Organization', name: 'AsylumJudge.com', url: `${ORIGIN}/` }, license: { '@type': 'CreativeWork', name: 'AsylumJudge Data Use and Attribution Terms', url: DATASET_LICENSE_URL }, isAccessibleForFree: true, isBasedOn: 'U.S. Department of Justice EOIR public data', dateModified: modified, temporalCoverage: '2020/2026', variableMeasured: ['Asylum approvals', 'Asylum denials', 'Other immigration court outcomes'], about: { '@type': 'Country', name: country.nationality, identifier: country.nationality_code } },
      { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'AsylumJudge.com', url: `${ORIGIN}/` }
    ]
  };
}

function renderJudge(template, judge, locale) {
  const strings = copy[locale.code];
  const name = cleanName(judge.judge_name);
  const total = localeNumber(judge.total_asylum_decisions, locale.code);
  const grants = localeNumber(judge.grants, locale.code);
  const denials = localeNumber(judge.denials, locale.code);
  const other = localeNumber(judge.other_decisions, locale.code);
  const relative = `judges/${slugify(judge.judge_name)}--${shortId(judge.id)}`;
  const title = strings.judgeTitle(name);
  const description = strings.judgeDescription(name, judge.court_name, total);
  const canonical = localizedUrl(locale, relative);
  const background = judge.background || judge.background_summary;
  let html = template
    .replace('<body>', `<body data-judge-id="${escapeHtml(judge.id)}" data-seo-prerendered="true">`)
    .replace('<div id="detail-loading" class="empty">正在读取 EOIR 法官数据…</div>', '<div id="detail-loading" class="empty" hidden></div>')
    .replace('<div id="detail" hidden>', '<div id="detail">')
    .replace('<h1 id="judge-name">—</h1>', `<h1 id="judge-name">${escapeHtml(name)}</h1>`)
    .replace('<p id="judge-court" class="lead">—</p>', `<p id="judge-court" class="lead">${escapeHtml([judge.court_name, [judge.court_city, judge.court_state].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</p>`)
    .replace('<p id="judge-source" class="source">数据来源：EOIR</p>', `<p id="judge-source" class="source">${escapeHtml(strings.summary(name, judge.court_name, total, grants, denials, other))}</p>`)
    .replace('<strong id="m-rate">—</strong>', `<strong id="m-rate">${escapeHtml(rate(judge))}</strong>`)
    .replace('<strong id="m-all-rate">—</strong>', `<strong id="m-all-rate">${judge.grant_share_all == null ? '—' : `${Number(judge.grant_share_all).toFixed(1)}%`}</strong>`)
    .replace('<strong id="m-total">—</strong>', `<strong id="m-total">${escapeHtml(total)}</strong>`)
    .replace('<small id="m-adjudicated">—</small>', `<small id="m-adjudicated">${escapeHtml(`${grants} / ${denials} / ${other}`)}</small>`)
    .replace('<strong id="m-grant-deny">—</strong>', `<strong id="m-grant-deny">${escapeHtml(`${grants} / ${denials} / ${other}`)}</strong>`)
    .replace('<p id="background-source-wrap" class="background-source">', '<p id="background-source-wrap" class="background-source" hidden>');
  if (background?.biography || background?.biography_excerpt) {
    const biography = background.biography || background.biography_excerpt;
    const sourceLabel = `${background.source_title || 'DOJ/EOIR official source'}${background.source_date ? ` (${background.source_date})` : ''} →`;
    html = html
      .replace('<section id="judge-background" class="detail-section judge-background" hidden>', '<section id="judge-background" class="detail-section judge-background">')
      .replace('<strong id="background-date">—</strong>', `<strong id="background-date">${escapeHtml(background.appointment_date || '—')}</strong>`)
      .replace('<strong id="background-court">—</strong>', `<strong id="background-court">${escapeHtml(background.appointment_court || judge.court_name || '—')}</strong>`)
      .replace('<strong id="background-type">—</strong>', `<strong id="background-type">${escapeHtml(background.appointment_type || 'Immigration Judge')}</strong>`)
      .replace('<p id="background-bio">—</p>', `<p id="background-bio">${escapeHtml(biography)}</p>`)
      .replace('<p id="background-education"></p>', `<p id="background-education">${background.education ? escapeHtml(`Education: ${background.education}`) : ''}</p>`)
      .replace('<p id="background-bar"></p>', `<p id="background-bar">${background.bar_membership ? escapeHtml(`Bar admission: ${background.bar_membership}`) : ''}</p>`)
      .replace('<p id="background-source-wrap" class="background-source" hidden>', `<p id="background-source-wrap" class="background-source"${background.source_url ? '' : ' hidden'}>`)
      .replace('<a id="background-source" href="#" target="_blank" rel="noopener">查看 DOJ/EOIR 官方来源 →</a>', `<a id="background-source" href="${escapeHtml(background.source_url || '#')}" target="_blank" rel="noopener">${escapeHtml(sourceLabel)}</a>`);
  }
  return injectSeoHead(html, { locale, relative, title, description, schema: judgeSchema(locale, canonical, judge, title, description) });
}

function renderCourt(template, court, locale) {
  const strings = copy[locale.code];
  const total = localeNumber(court.total_asylum_decisions, locale.code);
  const relative = `courts/${slugify(court.court_name)}--${String(court.court_code || slugify(court.court_state)).toLowerCase()}`;
  const title = strings.courtTitle(court.court_name);
  const description = strings.courtDescription(court.court_name, total);
  const canonical = localizedUrl(locale, relative);
  let html = template
    .replace('<body>', `<body data-court-name="${escapeHtml(court.court_name)}" data-court-state="${escapeHtml(court.court_state || '')}" data-seo-prerendered="true">`)
    .replace('<div id="loading" class="empty">正在读取法院数据…</div>', '<div id="loading" class="empty" hidden></div>')
    .replace('<div id="court-detail" hidden>', '<div id="court-detail">')
    .replace('<h1 id="court-name">—</h1>', `<h1 id="court-name">${escapeHtml(court.court_name)}</h1>`)
    .replace('<p id="court-place" class="lead">—</p>', `<p id="court-place" class="lead">${escapeHtml([court.court_city, court.court_state].filter(Boolean).join(', '))}</p>`)
    .replace('<strong id="rate">—</strong>', `<strong id="rate">${escapeHtml(rate(court))}</strong>`)
    .replace('<strong id="judges">—</strong>', `<strong id="judges">${escapeHtml(localeNumber(court.judges, locale.code))}</strong>`)
    .replace('<strong id="decisions">—</strong>', `<strong id="decisions">${escapeHtml(total)}</strong>`)
    .replace('<strong id="gd">—</strong>', `<strong id="gd">${escapeHtml(`${localeNumber(court.grants, locale.code)} / ${localeNumber(court.denials, locale.code)} / ${localeNumber(court.other_decisions, locale.code)}`)}</strong>`);
  return injectSeoHead(html, { locale, relative, title, description, schema: courtSchema(locale, canonical, court, title, description) });
}

function renderNationality(template, country, locale, modified) {
  const strings = copy[locale.code];
  const localizedCountry = locale.code.startsWith('zh') && country.nationality_zh ? `${country.nationality_zh} · ${country.nationality}` : country.nationality;
  const total = localeNumber(country.total_asylum_decisions, locale.code);
  const relative = `nationalities/${slugify(country.nationality)}${country.nationality_code ? `--${String(country.nationality_code).toLowerCase()}` : ''}`;
  const title = strings.nationalityTitle(localizedCountry);
  const description = strings.nationalityDescription(localizedCountry, total);
  const canonical = localizedUrl(locale, relative);
  let html = template
    .replace('<body>', `<body data-country="${escapeHtml(country.nationality)}" data-seo-prerendered="true">`)
    .replace('<h1 data-i18n="heroTitle">全球申请人庇护裁决结果</h1>', `<h1>${escapeHtml(title.replace(/\s*[|｜].*$/, ''))}</h1>`)
    .replace('<h2 id="selected-country">正在读取国籍数据…</h2>', `<h2 id="selected-country">${escapeHtml(localizedCountry)}</h2>`)
    .replace('<span id="selected-code"></span>', `<span id="selected-code">${escapeHtml(country.nationality_code || '')}</span>`)
    .replace('<strong id="current-rate" class="big-rate">—</strong>', `<strong id="current-rate" class="big-rate">${country.approval_rate == null ? '—' : `${Number(country.approval_rate).toFixed(1)}%`}</strong>`)
    .replace('<p id="sample" class="chart-note">—</p>', `<p id="sample" class="chart-note">${escapeHtml(description)}</p>`)
    .replace('<b id="grant-count">—</b>', `<b id="grant-count">${escapeHtml(localeNumber(country.grants, locale.code))}</b>`)
    .replace('<b id="deny-count">—</b>', `<b id="deny-count">${escapeHtml(localeNumber(country.denials, locale.code))}</b>`)
    .replace('<b id="other-count">—</b>', `<b id="other-count">${escapeHtml(localeNumber(country.other_decisions, locale.code))}</b>`);
  return injectSeoHead(html, { locale, relative, title, description, schema: nationalitySchema(locale, canonical, country, title, description, modified) });
}

function renderBackgroundDirectory(template, judges, locale) {
  const [title, description, sourceLabel] = backgroundDirectoryCopy[locale.code] || backgroundDirectoryCopy.en;
  const relative = 'judge-backgrounds';
  const canonical = localizedUrl(locale, relative);
  const cards = judges
    .filter((judge) => judge.background?.biography)
    .sort((a, b) => cleanName(a.judge_name).localeCompare(cleanName(b.judge_name), locale.code))
    .map((judge) => {
      const name = cleanName(judge.judge_name);
      const profile = `judges/${slugify(judge.judge_name)}--${shortId(judge.id)}`;
      const excerpt = String(judge.background.biography || '').slice(0, 330);
      return `<a class="background-directory-card" href="${localizedPath(locale, profile)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(judge.background.appointment_court || judge.court_name || 'U.S. Immigration Court')}</span><p>${escapeHtml(excerpt)}${judge.background.biography.length > excerpt.length ? '…' : ''}</p><small>${escapeHtml(sourceLabel)}${judge.background.source_date ? ` · ${escapeHtml(judge.background.source_date)}` : ''} →</small></a>`;
    })
    .join('');
  const html = template
    .replace('<h1 id="background-directory-title">移民法官官方背景资料</h1>', `<h1 id="background-directory-title">${escapeHtml(title.replace(/\s*[|｜].*$/, ''))}</h1>`)
    .replace('<p id="background-directory-description">仅收录可追溯至美国司法部或 EOIR 的官方任命公告与履历。点击法官姓名查看完整背景、裁决统计和来源。</p>', `<p id="background-directory-description">${escapeHtml(description)}</p>`)
    .replace('<div id="background-directory-grid" class="background-directory-grid"></div>', `<div id="background-directory-grid" class="background-directory-grid">${cards}</div>`)
    .replace('<body>', `<body data-asylum-locale="${locale.code}">`);
  return injectSeoHead(html, { locale, relative, title, description, schema: siteSchema(locale, canonical, title, description) });
}

async function fetchJson(api, params) {
  const url = `${api}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function writePage(output, locale, relative, html) {
  const dir = join(output, locale.path, ...String(relative || '').split('/').filter(Boolean));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html);
}

async function writeEntities(items, render, template, output, routeFor, sitemapRows, modifiedFor) {
  const batchSize = 20;
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await Promise.all(batch.flatMap((item) => SEO_LOCALES.map(async (locale) => {
      const relative = routeFor(item);
      await writePage(output, locale, relative, render(template, item, locale, modifiedFor?.(item)));
      sitemapRows.push({ loc: localizedUrl(locale, relative), lastmod: modifiedFor?.(item) || TODAY });
    })));
  }
}

const sitemapXml = (rows) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map((row) => `  <url><loc>${escapeXml(row.loc)}</loc><lastmod>${escapeXml(lastmod(row.lastmod))}</lastmod></url>`).join('\n')}\n</urlset>\n`;

export async function buildAsylumJudgeSeo({ root, output }) {
  const api = process.env.ASYLUMJUDGE_SEO_API || DEFAULT_API;
  const [homeTemplate, judgeTemplate, courtTemplate, nationalityTemplate, courtsTemplate, statesTemplate, compareTemplate, methodologyTemplate, backgroundTemplate, backgroundText] = await Promise.all([
    readFile(join(root, 'asylumjudge', 'index.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'detail.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'court-detail.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'china-dashboard.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'courts.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'states.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'compare.html'), 'utf8'),
    readFile(join(root, 'immigration-judge-approval-rate', 'methodology.html'), 'utf8'),
    readFile(join(root, 'asylumjudge', 'judge-backgrounds.html'), 'utf8'),
    readFile(join(root, 'data', 'immigration-judge-backgrounds.json'), 'utf8')
  ]);
  const backgroundData = JSON.parse(backgroundText);
  const backgroundByName = new Map((backgroundData.profiles || []).map((profile) => [profile.name_key || nameKey(profile.judge_name), profile]));

  const staticDefinitions = [
    ['', homeTemplate, 'home'],
    ['courts', courtsTemplate, 'courts'],
    ['states', statesTemplate, 'states'],
    ['nationality', nationalityTemplate, 'nationality'],
    ['compare', compareTemplate, 'compare'],
    ['methodology', methodologyTemplate, 'methodology']
  ];
  const staticRows = [];
  for (const [relative, template, key] of staticDefinitions) {
    await Promise.all(SEO_LOCALES.map(async (locale) => {
      const [title, description] = copy[locale.code][key];
      const canonical = localizedUrl(locale, relative);
      const pageTemplate = key === 'methodology' && !template.includes('id="data-license"')
        ? template.replace('</main>', `${DATASET_LICENSE_SECTION}</main>`)
        : template;
      const html = injectSeoHead(pageTemplate.replace('<body>', `<body data-asylum-locale="${locale.code}">`), {
        locale,
        relative,
        title,
        description,
        schema: siteSchema(locale, canonical, title, description)
      });
      await writePage(output, locale, relative, html);
      staticRows.push({ loc: canonical, lastmod: TODAY });
    }));
  }
  staticRows.push({ loc: `${ORIGIN}/community/`, lastmod: TODAY });

  let judgeData = { results: [] };
  let courtData = { courts: [] };
  let nationalityData = { countries: [] };
  const entityResponses = await Promise.allSettled([
    fetchJson(api, { mode: 'all' }),
    fetchJson(api, { mode: 'courts', fy: '2026' }),
    fetchJson(api, { mode: 'nationalities' })
  ]);
  if (entityResponses[0].status === 'fulfilled') judgeData = entityResponses[0].value;
  if (entityResponses[1].status === 'fulfilled') courtData = entityResponses[1].value;
  if (entityResponses[2].status === 'fulfilled') nationalityData = entityResponses[2].value;
  entityResponses.filter((result) => result.status === 'rejected').forEach((result) => {
    console.warn(`AsylumJudge SEO entity generation continued with partial data: ${result.reason?.message || result.reason}`);
  });
  judgeData.results = (judgeData.results || []).map((judge) => ({
    ...judge,
    background: backgroundByName.get(nameKey(judge.judge_name)) || judge.background || null
  }));

  await Promise.all(SEO_LOCALES.map(async (locale) => {
    await writePage(output, locale, 'judge-backgrounds', renderBackgroundDirectory(backgroundTemplate, judgeData.results, locale));
    staticRows.push({ loc: localizedUrl(locale, 'judge-backgrounds'), lastmod: backgroundData.generated_at || TODAY });
  }));

  const judgeRows = [];
  await writeEntities(
    judgeData.results || [],
    renderJudge,
    judgeTemplate,
    output,
    (judge) => `judges/${slugify(judge.judge_name)}--${shortId(judge.id)}`,
    judgeRows,
    (judge) => lastmod(judge.source_updated_at)
  );

  const courtRows = [];
  await writeEntities(
    courtData.courts || [],
    renderCourt,
    courtTemplate,
    output,
    (court) => `courts/${slugify(court.court_name)}--${String(court.court_code || slugify(court.court_state)).toLowerCase()}`,
    courtRows,
    () => TODAY
  );

  const nationalityRows = [];
  const nationalityModified = lastmod(nationalityData.source_snapshot_date);
  await writeEntities(
    nationalityData.countries || [],
    renderNationality,
    nationalityTemplate,
    output,
    (country) => `nationalities/${slugify(country.nationality)}${country.nationality_code ? `--${String(country.nationality_code).toLowerCase()}` : ''}`,
    nationalityRows,
    () => nationalityModified
  );

  await Promise.all([
    writeFile(join(output, 'sitemap-static.xml'), sitemapXml(staticRows)),
    writeFile(join(output, 'sitemap-judges.xml'), sitemapXml(judgeRows)),
    writeFile(join(output, 'sitemap-courts.xml'), sitemapXml(courtRows)),
    writeFile(join(output, 'sitemap-nationalities.xml'), sitemapXml(nationalityRows))
  ]);
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['static', 'judges', 'courts', 'nationalities'].map((name) => `  <sitemap><loc>${ORIGIN}/sitemap-${name}.xml</loc><lastmod>${TODAY}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  await writeFile(join(output, 'sitemap.xml'), sitemapIndex);
  console.log(`AsylumJudge SEO generated: ${staticRows.length} static, ${judgeRows.length} judge, ${courtRows.length} court, ${nationalityRows.length} nationality URLs`);
}

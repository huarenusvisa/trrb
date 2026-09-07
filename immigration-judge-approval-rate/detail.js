const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const apiUrl = (path) => path;
const REQUEST_TIMEOUT_MS = 15000;
const detailLoading = $('#detail-loading');
const initialDetailLoading = detailLoading.textContent;
let nationality = [];
let nationalityYearly = [];
let nationalityFiscalYear = 2026;
let nationalitySource = null;
const detailSummaryMessages = {
  en: { title: '{judge} Immigration Judge Approval Rate | AsylumJudge', judge: 'Immigration judge', source: 'Source: {source}', range: 'Data range: {start} to {end}', insufficient: 'Only {count} adjudicated decisions; fewer than 50, so the approval rate is not shown.', limited: '{count} adjudicated decisions meet the display threshold, but the sample remains limited and the percentage may change with a small number of cases.', sufficient: '{count} adjudicated decisions; historical statistics do not predict an individual case.' },
  es: { title: '{judge}: tasa de aprobación del juez de inmigración | AsylumJudge', judge: 'Juez de inmigración', source: 'Fuente: {source}', range: 'Período de datos: del {start} al {end}', insufficient: 'Solo {count} decisiones resueltas; al ser menos de 50, no se muestra la tasa de aprobación.', limited: '{count} decisiones resueltas alcanzan el mínimo, pero la muestra sigue siendo limitada y el porcentaje puede cambiar con pocos casos.', sufficient: '{count} decisiones resueltas; las estadísticas históricas no predicen un caso individual.' },
  fr: { title: '{judge} : taux d’approbation du juge | AsylumJudge', judge: 'Juge de l’immigration', source: 'Source : {source}', range: 'Période des données : du {start} au {end}', insufficient: 'Seulement {count} décisions au fond ; moins de 50, le taux d’approbation n’est donc pas affiché.', limited: '{count} décisions au fond atteignent le seuil, mais l’échantillon reste limité et quelques dossiers peuvent modifier le pourcentage.', sufficient: '{count} décisions au fond ; les statistiques historiques ne prédisent pas l’issue d’un dossier.' },
  'pt-BR': { title: '{judge}: taxa de aprovação do juiz | AsylumJudge', judge: 'Juiz de imigração', source: 'Fonte: {source}', range: 'Período dos dados: de {start} a {end}', insufficient: 'Apenas {count} decisões julgadas; como são menos de 50, a taxa de aprovação não é exibida.', limited: '{count} decisões julgadas atingem o limite, mas a amostra ainda é limitada e poucos casos podem alterar a porcentagem.', sufficient: '{count} decisões julgadas; estatísticas históricas não preveem um caso individual.' },
  hi: { title: '{judge} इमिग्रेशन जज अनुमोदन दर | AsylumJudge', judge: 'इमिग्रेशन जज', source: 'स्रोत: {source}', range: 'डेटा अवधि: {start} से {end}', insufficient: 'केवल {count} निर्णीत मामले; 50 से कम होने के कारण स्वीकृति दर नहीं दिखाई गई है।', limited: '{count} निर्णीत मामले सीमा पूरी करते हैं, लेकिन नमूना अभी सीमित है और कुछ मामलों से प्रतिशत बदल सकता है।', sufficient: '{count} निर्णीत मामले; ऐतिहासिक आँकड़े किसी व्यक्तिगत मामले के परिणाम की भविष्यवाणी नहीं करते।' },
  'zh-Hans': { title: '{judge}移民法官通过率｜AsylumJudge', judge: '移民法官', source: '数据来源：{source}', range: '数据范围 {start} 至 {end}', insufficient: '仅 {count} 件有效裁决，少于 50 件，因此不展示通过率。', limited: '{count} 件有效裁决，已达到展示标准；数量仍不大，百分比可能随少量案件变化。', sufficient: '{count} 件有效裁决；历史统计不代表个案结果。' },
  'zh-Hant': { title: '{judge}移民法官批准率｜AsylumJudge', judge: '移民法官', source: '資料來源：{source}', range: '資料範圍 {start} 至 {end}', insufficient: '僅 {count} 件有效裁決，少於 50 件，因此不顯示批准率。', limited: '{count} 件有效裁決，已達到顯示標準；樣本仍有限，少量案件可能改變百分比。', sufficient: '{count} 件有效裁決；歷史統計不代表個案結果。' },
  ru: { title: '{judge}: одобрение убежища иммиграционным судьёй | AsylumJudge', judge: 'Иммиграционный судья', source: 'Источник: {source}', range: 'Период данных: с {start} по {end}', insufficient: 'Всего решений по существу: {count}; поскольку их меньше 50, доля одобрений не показана.', limited: 'Решений по существу: {count}; порог достигнут, но выборка ограничена, и несколько дел могут изменить процент.', sufficient: 'Решений по существу: {count}; историческая статистика не предсказывает исход отдельного дела.' },
  ar: { title: '{judge}: نسبة موافقة قاضي الهجرة | AsylumJudge', judge: 'قاضي هجرة', source: 'المصدر: {source}', range: 'نطاق البيانات: من {start} إلى {end}', insufficient: '{count} قرارات مفصول فيها فقط؛ ولأنها أقل من 50، لا تُعرض نسبة الموافقة.', limited: '{count} قرارات مفصول فيها تستوفي الحد، لكن العينة ما زالت محدودة وقد تغيّر بضعة قضايا النسبة.', sufficient: '{count} قرارات مفصول فيها؛ لا تتنبأ الإحصاءات التاريخية بنتيجة قضية فردية.' },
  tr: { title: '{judge} göçmenlik hâkimi onay oranı | AsylumJudge', judge: 'Göçmenlik hâkimi', source: 'Kaynak: {source}', range: 'Veri aralığı: {start}–{end}', insufficient: 'Yalnızca {count} dosya karara bağlandı; 50’den az olduğu için onay oranı gösterilmiyor.', limited: '{count} dosya gösterim eşiğini karşılıyor, ancak örneklem sınırlı ve birkaç dosya yüzdelik oranı değiştirebilir.', sufficient: '{count} dosya karara bağlandı; geçmiş istatistikler tek bir davanın sonucunu öngörmez.' }
};
const detailSummaryCopy = () => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  return detailSummaryMessages[locale] || detailSummaryMessages['zh-Hans'];
};
const fill = (template, values) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
const detailLoadMessages = {
  en: { missing: 'Judge ID is missing.', unavailable: 'This judge profile is temporarily unavailable.', retryLater: 'Please try again later.', retry: 'Try again' },
  es: { missing: 'Falta el identificador del juez.', unavailable: 'El perfil de este juez no está disponible temporalmente.', retryLater: 'Inténtalo de nuevo más tarde.', retry: 'Volver a intentar' },
  fr: { missing: 'L’identifiant du juge est manquant.', unavailable: 'Le profil de ce juge est temporairement indisponible.', retryLater: 'Veuillez réessayer plus tard.', retry: 'Réessayer' },
  'pt-BR': { missing: 'O identificador do juiz está ausente.', unavailable: 'O perfil deste juiz está temporariamente indisponível.', retryLater: 'Tente novamente mais tarde.', retry: 'Tentar novamente' },
  hi: { missing: 'न्यायाधीश की आईडी उपलब्ध नहीं है।', unavailable: 'इस न्यायाधीश की प्रोफ़ाइल फ़िलहाल उपलब्ध नहीं है।', retryLater: 'कृपया बाद में फिर कोशिश करें।', retry: 'फिर कोशिश करें' },
  'zh-Hans': { missing: '缺少法官编号。', unavailable: '暂时无法读取该法官资料。', retryLater: '请稍后重试。', retry: '重新尝试' },
  'zh-Hant': { missing: '缺少法官編號。', unavailable: '暫時無法讀取該法官資料。', retryLater: '請稍後重試。', retry: '重新嘗試' },
  ru: { missing: 'Не указан идентификатор судьи.', unavailable: 'Профиль этого судьи временно недоступен.', retryLater: 'Повторите попытку позже.', retry: 'Повторить' },
  ar: { missing: 'معرّف القاضي غير موجود.', unavailable: 'الملف التعريفي لهذا القاضي غير متاح مؤقتًا.', retryLater: 'يرجى المحاولة مرة أخرى لاحقًا.', retry: 'إعادة المحاولة' },
  tr: { missing: 'Hâkim kimliği eksik.', unavailable: 'Bu hâkimin profiline geçici olarak erişilemiyor.', retryLater: 'Lütfen daha sonra tekrar deneyin.', retry: 'Tekrar dene' }
};
const detailLoadCopy = () => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  return detailLoadMessages[locale] || detailLoadMessages['zh-Hans'];
};
const nationalityResultMessages = {
  en: 'FY {year}: {count} nationality results.',
  es: 'Año fiscal {year}: {count} resultados de nacionalidad.',
  fr: 'Exercice {year} : {count} résultats par nationalité.',
  'pt-BR': 'Ano fiscal {year}: {count} resultados de nacionalidade.',
  hi: 'वित्त वर्ष {year}: {count} राष्ट्रीयता परिणाम।',
  'zh-Hans': 'FY {year}：显示 {count} 个国籍结果。',
  'zh-Hant': 'FY {year}：顯示 {count} 個國籍結果。',
  ru: 'Финансовый год {year}: результатов по гражданству — {count}.',
  ar: 'السنة المالية {year}: عدد نتائج الجنسية {count}.',
  tr: 'Mali yıl {year}: {count} uyruk sonucu.'
};
const nationalityEmptyMessages = {
  en: 'No matching nationality data for this fiscal year.',
  es: 'No hay datos de nacionalidad coincidentes para este año fiscal.',
  fr: 'Aucune donnée de nationalité correspondante pour cet exercice.',
  'pt-BR': 'Não há dados de nacionalidade correspondentes para este ano fiscal.',
  hi: 'इस वित्त वर्ष के लिए कोई मेल खाता राष्ट्रीयता डेटा नहीं है।',
  'zh-Hans': '该财年暂无匹配国籍数据。',
  'zh-Hant': '該財年暫無相符的國籍資料。',
  ru: 'За этот финансовый год нет подходящих данных по гражданству.',
  ar: 'لا توجد بيانات جنسية مطابقة لهذه السنة المالية.',
  tr: 'Bu mali yıl için eşleşen uyruk verisi yok.'
};
const nationalityPeriodMessages = {
  en: 'FY {year}: {start} to {end} · Each row shows fiscal year, nationality, case count, and actual decision outcomes.',
  es: 'Año fiscal {year}: del {start} al {end} · Cada fila muestra el año fiscal, la nacionalidad, el número de casos y los resultados reales.',
  fr: 'Exercice {year} : du {start} au {end} · Chaque ligne indique l’exercice, la nationalité, le nombre de dossiers et les décisions réelles.',
  'pt-BR': 'Ano fiscal {year}: de {start} a {end} · Cada linha mostra o ano fiscal, a nacionalidade, o número de casos e os resultados reais.',
  hi: 'वित्त वर्ष {year}: {start} से {end} · हर पंक्ति में वित्त वर्ष, राष्ट्रीयता, मामलों की संख्या और वास्तविक निर्णय परिणाम दिखते हैं।',
  'zh-Hans': 'FY {year}：{start} 至 {end} · 每行显示财年、国籍、案件数和真实裁决结果。',
  'zh-Hant': 'FY {year}：{start} 至 {end} · 每列顯示財年、國籍、案件數和實際裁決結果。',
  ru: 'Финансовый год {year}: с {start} по {end} · В каждой строке указаны год, гражданство, число дел и фактические решения.',
  ar: 'السنة المالية {year}: من {start} إلى {end} · يعرض كل صف السنة المالية والجنسية وعدد القضايا ونتائج القرارات الفعلية.',
  tr: 'Mali yıl {year}: {start}–{end} · Her satır mali yılı, uyruğu, dava sayısını ve gerçek karar sonuçlarını gösterir.'
};
const nationalityTableLabels = {
  en: { first: 'Fiscal year / Nationality', total: 'Total decisions', grants: 'Grants', denials: 'Denials', other: 'Other', otherTitle: 'Includes dismissals, A10, cancellation of removal, withholding of removal, voluntary departure, and other outcomes', rate: 'Adjudicated approval rate' },
  es: { first: 'Año fiscal / Nacionalidad', total: 'Decisiones totales', grants: 'Aprobaciones', denials: 'Denegaciones', other: 'Otros', otherTitle: 'Incluye desestimaciones, A10, cancelación de expulsión, suspensión de expulsión, salida voluntaria y otros resultados', rate: 'Tasa de aprobación adjudicada' },
  fr: { first: 'Exercice / Nationalité', total: 'Décisions totales', grants: 'Accords', denials: 'Refus', other: 'Autres', otherTitle: 'Comprend les classements, A10, annulations d’expulsion, sursis à l’expulsion, départs volontaires et autres décisions', rate: 'Taux d’approbation jugé' },
  'pt-BR': { first: 'Ano fiscal / Nacionalidade', total: 'Total de decisões', grants: 'Aprovações', denials: 'Negações', other: 'Outros', otherTitle: 'Inclui arquivamentos, A10, cancelamento de remoção, suspensão de remoção, saída voluntária e outros resultados', rate: 'Taxa de aprovação julgada' },
  hi: { first: 'वित्त वर्ष / राष्ट्रीयता', total: 'कुल निर्णय', grants: 'स्वीकृत', denials: 'अस्वीकृत', other: 'अन्य', otherTitle: 'इसमें खारिज मामले, A10, निष्कासन रद्दीकरण, निष्कासन पर रोक, स्वैच्छिक प्रस्थान और अन्य परिणाम शामिल हैं', rate: 'निर्णीत स्वीकृति दर' },
  'zh-Hans': { first: '财年 / 国籍', total: '裁决总数', grants: '批准', denials: '拒绝', other: '其他', otherTitle: '包括撤案、A10、十年绿卡、暂缓递解、自愿递解等其他裁决', rate: '裁决批准率' },
  'zh-Hant': { first: '財年 / 國籍', total: '裁決總數', grants: '批准', denials: '拒絕', other: '其他', otherTitle: '包括撤案、A10、取消遞解、暫緩遞解、自願離境等其他裁決', rate: '裁決批准率' },
  ru: { first: 'Финансовый год / Гражданство', total: 'Всего решений', grants: 'Одобрено', denials: 'Отказано', other: 'Другие', otherTitle: 'Включает прекращение дел, A10, отмену высылки, приостановление высылки, добровольный выезд и другие решения', rate: 'Доля одобрений по существу' },
  ar: { first: 'السنة المالية / الجنسية', total: 'إجمالي القرارات', grants: 'الموافقات', denials: 'الرفض', other: 'أخرى', otherTitle: 'يشمل إسقاط القضايا وA10 وإلغاء الإبعاد ووقف الإبعاد والمغادرة الطوعية والنتائج الأخرى', rate: 'معدل الموافقة في القضايا المفصول فيها' },
  tr: { first: 'Mali yıl / Uyruk', total: 'Toplam karar', grants: 'Kabuller', denials: 'Retler', other: 'Diğer', otherTitle: 'Düşürülen davalar, A10, sınır dışı kararının iptali veya ertelenmesi, gönüllü ayrılış ve diğer sonuçları içerir', rate: 'Karara bağlanan dosyalarda kabul oranı' }
};
const yearlyMessages = {
  en: { first: 'Fiscal year', empty: 'No yearly trend data for 2024–2026.', chartLabel: 'Annual grants, denials, and other decisions for this judge', chartTitle: 'Decision outcomes for 2026, 2025, and 2024', chartAria: 'Horizontal comparison of annual decision outcomes' },
  es: { first: 'Año fiscal', empty: 'No hay datos de tendencias anuales para 2024–2026.', chartLabel: 'Aprobaciones, denegaciones y otras decisiones anuales de este juez', chartTitle: 'Resultados de decisiones de 2026, 2025 y 2024', chartAria: 'Comparación horizontal de resultados de decisiones anuales' },
  fr: { first: 'Exercice', empty: 'Aucune tendance annuelle disponible pour 2024–2026.', chartLabel: 'Accords, refus et autres décisions annuelles de ce juge', chartTitle: 'Décisions rendues en 2026, 2025 et 2024', chartAria: 'Comparaison horizontale des décisions annuelles' },
  'pt-BR': { first: 'Ano fiscal', empty: 'Não há dados de tendência anual para 2024–2026.', chartLabel: 'Aprovações, negações e outras decisões anuais deste juiz', chartTitle: 'Resultados das decisões de 2026, 2025 e 2024', chartAria: 'Comparação horizontal dos resultados anuais das decisões' },
  hi: { first: 'वित्त वर्ष', empty: '2024–2026 के लिए वार्षिक रुझान डेटा उपलब्ध नहीं है।', chartLabel: 'इस न्यायाधीश के वार्षिक स्वीकृत, अस्वीकृत और अन्य निर्णय', chartTitle: '2026, 2025 और 2024 के निर्णय परिणाम', chartAria: 'वार्षिक निर्णय परिणामों की क्षैतिज तुलना' },
  'zh-Hans': { first: '财政年度', empty: '2024–2026 暂无年度趋势数据。', chartLabel: '该法官年度批准、拒绝与其他裁决', chartTitle: '2026、2025、2024 年裁决结果', chartAria: '横向年度裁决结果对比图' },
  'zh-Hant': { first: '財政年度', empty: '2024–2026 暫無年度趨勢資料。', chartLabel: '該法官年度批准、拒絕與其他裁決', chartTitle: '2026、2025、2024 年裁決結果', chartAria: '橫向年度裁決結果比較圖' },
  ru: { first: 'Финансовый год', empty: 'Нет данных о годовой динамике за 2024–2026 годы.', chartLabel: 'Годовые одобрения, отказы и другие решения этого судьи', chartTitle: 'Решения за 2026, 2025 и 2024 годы', chartAria: 'Горизонтальное сравнение ежегодных решений' },
  ar: { first: 'السنة المالية', empty: 'لا تتوفر بيانات الاتجاه السنوي للأعوام 2024–2026.', chartLabel: 'الموافقات والرفض والقرارات الأخرى السنوية لهذا القاضي', chartTitle: 'نتائج القرارات للأعوام 2026 و2025 و2024', chartAria: 'مقارنة أفقية لنتائج القرارات السنوية' },
  tr: { first: 'Mali yıl', empty: '2024–2026 için yıllık eğilim verisi yok.', chartLabel: 'Bu hâkimin yıllık kabul, ret ve diğer kararları', chartTitle: '2026, 2025 ve 2024 karar sonuçları', chartAria: 'Yıllık karar sonuçlarının yatay karşılaştırması' }
};
const yearlyCopy = () => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  return yearlyMessages[locale] || yearlyMessages['zh-Hans'];
};
const nationalityRowMessages = {
  en: { insufficient: 'Only {count} adjudicated decisions; fewer than 50, so the approval rate is not shown.', limited: '{count} adjudicated decisions meet the display threshold, but the sample remains limited.', sufficient: '{count} adjudicated decisions.', dates: 'Record dates: {start} to {end}' },
  es: { insufficient: 'Solo {count} decisiones resueltas; al ser menos de 50, no se muestra la tasa de aprobación.', limited: '{count} decisiones resueltas alcanzan el mínimo de visualización, pero la muestra sigue siendo limitada.', sufficient: '{count} decisiones resueltas.', dates: 'Fechas de registro: del {start} al {end}' },
  fr: { insufficient: 'Seulement {count} décisions au fond ; moins de 50, le taux d’approbation n’est donc pas affiché.', limited: '{count} décisions au fond atteignent le seuil d’affichage, mais l’échantillon reste limité.', sufficient: '{count} décisions au fond.', dates: 'Dates des données : du {start} au {end}' },
  'pt-BR': { insufficient: 'Apenas {count} decisões julgadas; como são menos de 50, a taxa de aprovação não é exibida.', limited: '{count} decisões julgadas atingem o limite de exibição, mas a amostra ainda é limitada.', sufficient: '{count} decisões julgadas.', dates: 'Datas dos registros: de {start} a {end}' },
  hi: { insufficient: 'केवल {count} निर्णीत मामले; 50 से कम होने के कारण स्वीकृति दर नहीं दिखाई गई है।', limited: '{count} निर्णीत मामले प्रदर्शन सीमा पूरी करते हैं, लेकिन नमूना अभी भी सीमित है।', sufficient: '{count} निर्णीत मामले।', dates: 'रिकॉर्ड की तारीखें: {start} से {end}' },
  'zh-Hans': { insufficient: '仅 {count} 件有效裁决，少于 50 件，不显示通过率。', limited: '{count} 件有效裁决，已达到展示标准，但样本仍然有限。', sufficient: '{count} 件有效裁决。', dates: '记录日期：{start} 至 {end}' },
  'zh-Hant': { insufficient: '僅 {count} 件有效裁決，少於 50 件，不顯示通過率。', limited: '{count} 件有效裁決，已達到顯示標準，但樣本仍然有限。', sufficient: '{count} 件有效裁決。', dates: '記錄日期：{start} 至 {end}' },
  ru: { insufficient: 'Всего решений по существу: {count}; поскольку их меньше 50, доля одобрений не показана.', limited: 'Решений по существу: {count}; порог для показа достигнут, но выборка остаётся ограниченной.', sufficient: 'Решений по существу: {count}.', dates: 'Даты записей: с {start} по {end}' },
  ar: { insufficient: '{count} قرارات مفصول فيها فقط؛ ولأنها أقل من 50، لا يُعرض معدل الموافقة.', limited: '{count} قرارات مفصول فيها تستوفي حد العرض، لكن العينة ما زالت محدودة.', sufficient: '{count} قرارات مفصول فيها.', dates: 'تواريخ السجلات: من {start} إلى {end}' },
  tr: { insufficient: 'Yalnızca {count} dosya karara bağlandı; 50’den az olduğu için kabul oranı gösterilmiyor.', limited: '{count} karara bağlanan dosya gösterim eşiğini karşılıyor, ancak örneklem hâlâ sınırlı.', sufficient: '{count} dosya karara bağlandı.', dates: 'Kayıt tarihleri: {start}–{end}' }
};
const nationalityResultStatus = (count, year) => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const template = nationalityResultMessages[locale] || nationalityResultMessages['zh-Hans'];
  return template.replace('{year}', String(year)).replace('{count}', fmt(count));
};
const nationalityEmptyMessage = () => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  return nationalityEmptyMessages[locale] || nationalityEmptyMessages['zh-Hans'];
};
const sampleText = (level, count) => {
  const messages = detailSummaryCopy();
  const template = level === 'insufficient' || level === 'small' ? messages.insufficient : Number(count) < 200 ? messages.limited : messages.sufficient;
  return fill(template, { count: fmt(count) });
};
const sampleDescription = (row) => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const messages = nationalityRowMessages[locale] || nationalityRowMessages['zh-Hans'];
  const count = Number(row.adjudicated_decisions ?? row.decision_count ?? 0);
  const template = count < 50 ? messages.insufficient : count < 200 ? messages.limited : messages.sufficient;
  return fill(template, { count: fmt(count) });
};
const dateRange = (row) => {
  if (!row.data_start_date && !row.data_end_date) return '';
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const template = (nationalityRowMessages[locale] || nationalityRowMessages['zh-Hans']).dates;
  return fill(template, { start: row.data_start_date || '—', end: row.data_end_date || '—' });
};
const nationalityRowMessage = (row) => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const messages = nationalityRowMessages[locale] || nationalityRowMessages['zh-Hans'];
  const count = Number(row.adjudicated_decisions ?? row.decision_count ?? 0);
  const template = count < 50 ? messages.insufficient : count < 200 ? messages.limited : messages.sufficient;
  return template.replace('{count}', fmt(count));
};
const nationalityDateRange = (row) => {
  if (!row.data_start_date && !row.data_end_date) return '';
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const template = (nationalityRowMessages[locale] || nationalityRowMessages['zh-Hans']).dates;
  return template.replace('{start}', row.data_start_date || '—').replace('{end}', row.data_end_date || '—');
};
const webexMessages = {
  en: { title: 'EOIR Webex hearing access', link: 'Webex hearing', phone: 'Phone', accessCode: 'Access code', officialPage: 'See official page', warning: 'Verify that the full Webex URL above matches your hearing notice. Attend online only if your hearing notice says to do so; contact the immigration court if you are unsure.' },
  es: { title: 'Acceso a audiencias por Webex de EOIR', link: 'Audiencia por Webex', phone: 'Teléfono', accessCode: 'Código de acceso', officialPage: 'Consulte la página oficial', warning: 'Verifique que la URL completa de Webex coincida con su notificación de audiencia. Asista en línea solo si la notificación así lo indica; si tiene dudas, comuníquese con el tribunal de inmigración.' },
  fr: { title: 'Accès aux audiences EOIR par Webex', link: 'Audience Webex', phone: 'Téléphone', accessCode: 'Code d’accès', officialPage: 'Voir la page officielle', warning: 'Vérifiez que l’URL Webex complète ci-dessus correspond à votre avis d’audience. Ne participez en ligne que si cet avis le prévoit ; en cas de doute, contactez le tribunal de l’immigration.' },
  'pt-BR': { title: 'Acesso às audiências da EOIR pelo Webex', link: 'Audiência pelo Webex', phone: 'Telefone', accessCode: 'Código de acesso', officialPage: 'Consulte a página oficial', warning: 'Confirme se a URL completa do Webex acima corresponde ao seu aviso de audiência. Participe on-line somente se o aviso indicar essa modalidade; em caso de dúvida, entre em contato com o tribunal de imigração.' },
  hi: { title: 'EOIR Webex सुनवाई का प्रवेश', link: 'Webex सुनवाई', phone: 'फ़ोन', accessCode: 'एक्सेस कोड', officialPage: 'आधिकारिक पेज देखें', warning: 'ऊपर दिया पूरा Webex URL अपने सुनवाई नोटिस से मिलाएँ। ऑनलाइन तभी शामिल हों जब आपके नोटिस में ऐसा लिखा हो; संदेह होने पर इमिग्रेशन कोर्ट से संपर्क करें।' },
  'zh-Hans': { title: 'EOIR Webex 网上上庭入口', link: 'Webex 网上上庭', phone: '电话', accessCode: '接入码', officialPage: '见官方页面', warning: '请先核对上方完整 Webex URL 与本人开庭通知是否一致。是否网上上庭以本人开庭通知为准；不确定时请联系移民法院。' },
  'zh-Hant': { title: 'EOIR Webex 線上出庭入口', link: 'Webex 線上出庭', phone: '電話', accessCode: '存取碼', officialPage: '請見官方頁面', warning: '請先核對上方完整 Webex URL 是否與本人的開庭通知一致。是否線上出庭以本人開庭通知為準；不確定時請聯絡移民法院。' },
  ru: { title: 'Подключение к слушанию EOIR через Webex', link: 'Слушание в Webex', phone: 'Телефон', accessCode: 'Код доступа', officialPage: 'См. официальную страницу', warning: 'Сверьте полный URL Webex выше с уведомлением о слушании. Подключайтесь онлайн только в том случае, если это указано в уведомлении; при сомнениях свяжитесь с иммиграционным судом.' },
  ar: { title: 'الدخول إلى جلسات EOIR عبر Webex', link: 'جلسة عبر Webex', phone: 'الهاتف', accessCode: 'رمز الدخول', officialPage: 'راجع الصفحة الرسمية', warning: 'تحقق من أن رابط Webex الكامل أعلاه يطابق إشعار جلستك. احضر عبر الإنترنت فقط إذا نصّ إشعار الجلسة على ذلك؛ وتواصل مع محكمة الهجرة إذا لم تكن متأكدًا.' },
  tr: { title: 'EOIR Webex duruşmasına erişim', link: 'Webex duruşması', phone: 'Telefon', accessCode: 'Erişim kodu', officialPage: 'Resmî sayfaya bakın', warning: 'Yukarıdaki tam Webex URL’sinin duruşma bildiriminizle eşleştiğini doğrulayın. Yalnızca bildiriminizde belirtilmişse çevrim içi katılın; emin değilseniz göçmenlik mahkemesiyle iletişime geçin.' }
};
const webexCopy = () => {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  return webexMessages[locale] || webexMessages['zh-Hans'];
};

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Judge detail failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function renderBackground(background) {
  $('#judge-background').hidden = false;
  if (!background) {
    $('#background-date').textContent = '暂未匹配到官方资料';
    $('#background-court').textContent = '暂未匹配到官方资料';
    $('#background-type').textContent = 'Immigration Judge';
    $('#background-copy-title').textContent = '官方履历核验状态';
    $('#background-bio').textContent = '当前数据库尚未匹配到该法官可核验的 DOJ/EOIR 官方任命履历。裁决统计仍可正常查看；背景资料补齐后会在这里同步显示。';
    $('#background-source-wrap').hidden = true;
    return;
  }
  $('#background-copy-title').textContent = '官方履历原文';
  $('#background-source-wrap').hidden = false;
  $('#background-date').textContent = background.appointment_date || '官方资料未注明';
  $('#background-court').textContent = background.appointment_court || '官方资料未注明';
  $('#background-type').textContent = background.appointment_type || 'Immigration Judge';
  $('#background-bio').textContent = background.biography || '官方履历原文暂缺。';
  $('#background-education').textContent = background.education ? `教育经历：${background.education}` : '';
  $('#background-bar').textContent = background.bar_membership ? `执业资格：${background.bar_membership}` : '';
  const source = $('#background-source');
  source.href = background.source_url || 'https://www.justice.gov/eoir/office-of-the-chief-immigration-judge';
  source.textContent = `${background.source_title || 'DOJ/EOIR 官方来源'}${background.source_date ? `（${background.source_date}）` : ''} →`;
}

function renderWebex(webex) {
  const links = webex?.links || [];
  if (!links.length) return;
  const copy = webexCopy();
  const container = $('#judge-webex');
  container.hidden = false;
  container.innerHTML = `<b><i class="webex-icon" aria-hidden="true">W</i> ${esc(copy.title)}</b>${links.map((item) => `<div class="webex-link-item"><a href="${esc(item.webex_url)}" target="_blank" rel="noopener">${esc(item.court_name || copy.link)} ↗</a><code>${esc(item.webex_url)}</code><small>${esc(copy.phone)} ${esc(webex.telephonic_number || '1-415-527-5035')} · ${esc(copy.accessCode)} ${esc(item.access_code || copy.officialPage)}</small></div>`).join('')}<small>${esc(copy.warning)}</small>`;
}

function outcomeHeader(firstLabel) {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const labels = nationalityTableLabels[locale] || nationalityTableLabels['zh-Hans'];
  return `<div class="trow thead outcome-row"><span>${esc(firstLabel)}</span><span>${esc(labels.total)}</span><span class="verdict-pass">${esc(labels.grants)}</span><span class="verdict-deny">${esc(labels.denials)}</span><span class="verdict-other" title="${esc(labels.otherTitle)}">${esc(labels.other)}</span><span>${esc(labels.rate)}</span></div>`;
}

function nationalityOutcomeHeader() {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const labels = nationalityTableLabels[locale] || nationalityTableLabels['zh-Hans'];
  return `<div class="trow thead outcome-row"><span>${esc(labels.first)}</span><span>${esc(labels.total)}</span><span class="verdict-pass">${esc(labels.grants)}</span><span class="verdict-deny">${esc(labels.denials)}</span><span class="verdict-other" title="${esc(labels.otherTitle)}">${esc(labels.other)}</span><span>${esc(labels.rate)}</span></div>`;
}

function outcomeRow(firstCell, row) {
  return `<div class="trow outcome-row"><span>${firstCell}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="red">${pct(row.adjudicated_approval_rate)}</span></div>`;
}

function renderYearlyChart(rows) {
  const copy = yearlyCopy();
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const labels = nationalityTableLabels[locale] || nationalityTableLabels['zh-Hans'];
  let chart = $('#yearly-chart');
  if (!chart) {
    $('#yearly').insertAdjacentHTML('beforebegin', '<div id="yearly-chart" class="yearly-chart"></div>');
    chart = $('#yearly-chart');
  }
  chart.setAttribute('aria-label', copy.chartLabel);
  if (!rows.length) { chart.hidden = true; return; }
  chart.hidden = false;
  const width = 920;
  const height = 330;
  const left = 120;
  const right = 34;
  const top = 62;
  const bottom = 300;
  const plotWidth = width - left - right;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.grants || 0), Number(row.denials || 0), Number(row.other_decisions || 0)]));
  const roundedMax = Math.ceil(max / Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1))) * Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1));
  const groupHeight = (bottom - top) / rows.length;
  const barHeight = Math.min(15, groupHeight / 4.2);
  const x = (value) => left + Number(value || 0) / roundedMax * plotWidth;
  const grid = [0, .25, .5, .75, 1].map((part) => {
    const value = roundedMax * part;
    const gridX = x(value);
    return `<line class="year-grid" x1="${gridX}" y1="${top - 10}" x2="${gridX}" y2="${bottom}"></line><text class="year-axis" x="${gridX}" y="32" text-anchor="middle">${fmt(Math.round(value))}</text>`;
  }).join('');
  const bars = rows.map((row, index) => {
    const center = top + groupHeight * (index + .5);
    const series = [
      { value: Number(row.grants || 0), className: 'approval', label: labels.grants, offset: -barHeight * 1.3 },
      { value: Number(row.denials || 0), className: 'denial', label: labels.denials, offset: 0 },
      { value: Number(row.other_decisions || 0), className: 'other', label: labels.other, offset: barHeight * 1.3 }
    ];
    const columns = series.map((item) => {
      const barWidth = Math.max(item.value > 0 ? 3 : 0, x(item.value) - left);
      return `<rect class="year-bar ${item.className}" x="${left}" y="${center + item.offset - barHeight / 2}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}"><title>FY ${esc(row.fiscal_year)} · ${esc(item.label)}: ${fmt(item.value)}</title></rect>`;
    }).join('');
    return `<text class="year-label" x="4" y="${center + 5}">FY ${esc(row.fiscal_year)}</text>${columns}`;
  }).join('');
  chart.innerHTML = `<div class="year-chart-head"><b>${esc(copy.chartTitle)}</b><span><i class="approval"></i>${esc(labels.grants)} <i class="denial"></i>${esc(labels.denials)} <i class="other"></i>${esc(labels.other)}</span></div><div class="year-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(copy.chartAria)}">${grid}${bars}</svg></div>`;
}

function enrichNationalityRow(row) {
  const grants = Number(row.grants || 0);
  const denials = Number(row.denials || 0);
  const adjudicated = grants + denials;
  return {
    ...row,
    adjudicated_decisions: adjudicated,
    adjudicated_approval_rate: adjudicated >= 50 ? grants / adjudicated * 100 : null
  };
}

function nationalityPeriodLabel(year) {
  const locale = window.AsylumI18n?.locale || 'zh-Hans';
  const template = nationalityPeriodMessages[locale] || nationalityPeriodMessages['zh-Hans'];
  const start = `${Number(year) - 1}-10-01`;
  const end = Number(year) === 2026 ? (nationalitySource?.scope_end || '2026-07-01') : `${year}-09-30`;
  return template
    .replace('{year}', String(year))
    .replace('{start}', start)
    .replace('{end}', end);
}

function nationalityName(row) {
  return window.AsylumI18n?.countryName?.(row) || row.nationality || '—';
}

function renderCountries() {
  const query = String($('#country-filter').value || '').trim().toLowerCase();
  const rows = nationalityYearly
    .filter((row) => Number(row.fiscal_year) === nationalityFiscalYear)
    .filter((row) => !query || [nationalityName(row), row.nationality, row.nationality_code].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
    .map(enrichNationalityRow)
    .sort((a, b) => Number(b.total_asylum_decisions || 0) - Number(a.total_asylum_decisions || 0));
  $('#nationality-period-label').textContent = nationalityPeriodLabel(nationalityFiscalYear);
  document.querySelectorAll('[data-nationality-fy]').forEach((button) => {
    const selected = Number(button.dataset.nationalityFy) === nationalityFiscalYear;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#nationality').innerHTML = rows.length ? `${nationalityOutcomeHeader()}${rows.map((row) => outcomeRow(`<b>FY ${esc(row.fiscal_year)} · ${esc(nationalityName(row))}</b><small class="sample-explain">${esc(nationalityRowMessage(row))}</small>${nationalityDateRange(row) ? `<small class="decision-range">${esc(nationalityDateRange(row))}</small>` : ''}`, row)).join('')}` : `<div class="empty">${esc(nationalityEmptyMessage())}</div>`;
  $('#nationality-results-status').textContent = nationalityResultStatus(rows.length, nationalityFiscalYear);
}

async function load() {
  const id = document.body.dataset.judgeId || new URLSearchParams(location.search).get('id');
  if (!id) { detailLoading.textContent = detailLoadCopy().missing; detailLoading.setAttribute('aria-busy', 'false'); return; }
  detailLoading.hidden = false;
  detailLoading.textContent = initialDetailLoading;
  detailLoading.setAttribute('aria-busy', 'true');
  try {
    const localUrl = `/.netlify/functions/immigration-judges?mode=detail&id=${encodeURIComponent(id)}`;
    const data = await requestJson(apiUrl(localUrl), { cache: 'no-store' });
    if (!data.judge) throw new Error('Judge detail missing');
    const judge = data.judge;
    const summary = detailSummaryCopy();
    if (data.background || document.body.dataset.seoPrerendered !== 'true') renderBackground(data.background);
    renderWebex(judge.webex);
    document.title = fill(summary.title, { judge: judge.judge_name || summary.judge });
    $('#judge-name').textContent = judge.judge_name || summary.judge;
    $('#judge-court').textContent = [judge.court_name, [judge.court_city, judge.court_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    $('#judge-source').textContent = `${fill(summary.source, { source: judge.source || 'EOIR' })}${judge.data_start_date || judge.data_end_date ? ` · ${fill(summary.range, { start: judge.data_start_date || '—', end: judge.data_end_date || '—' })}` : ''}`;
    $('#m-rate').textContent = pct(judge.adjudicated_approval_rate);
    $('#m-all-rate').textContent = pct(judge.grant_share_all);
    $('#m-total').textContent = fmt(judge.total_asylum_decisions);
    const grantLabel = window.AsylumI18n?.t?.('批准') || '批准';
    const denialLabel = window.AsylumI18n?.t?.('拒绝') || '拒绝';
    const otherLabel = window.AsylumI18n?.t?.('其他') || '其他';
    $('#m-adjudicated').innerHTML = `<span class="verdict-pass">${esc(grantLabel)} ${fmt(judge.grants)}</span> · <span class="verdict-deny">${esc(denialLabel)} ${fmt(judge.denials)}</span> · <span class="verdict-other">${esc(otherLabel)} ${fmt(judge.other_decisions)}</span>`;
    $('#m-grant-deny').previousElementSibling.textContent = `${grantLabel} / ${denialLabel} / ${otherLabel}`;
    $('#m-grant-deny').innerHTML = `<span class="verdict-pass">${fmt(judge.grants)}</span> / <span class="verdict-deny">${fmt(judge.denials)}</span> / <span class="verdict-other">${fmt(judge.other_decisions)}</span>`;
    const warning = $('#sample-warning');
    warning.textContent = sampleText(judge.sample_level, judge.adjudicated_decisions);
    warning.className = `sample-warning ${judge.sample_level}`;
    warning.hidden = false;
    const yearly = (data.yearly || [])
      .filter((row) => ['2026', '2025', '2024'].includes(String(row.fiscal_year)))
      .sort((a, b) => Number(b.fiscal_year) - Number(a.fiscal_year));
    renderYearlyChart(yearly);
    const yearlyMessages = yearlyCopy();
    $('#yearly').innerHTML = yearly.length ? `${outcomeHeader(yearlyMessages.first)}${yearly.map((row) => outcomeRow(`<b>FY ${esc(row.fiscal_year)}</b><small class="sample-explain">${esc(sampleDescription(row))}</small>${dateRange(row) ? `<small class="decision-range">${esc(dateRange(row))}</small>` : ''}`, row)).join('')}` : `<div class="empty">${esc(yearlyMessages.empty)}</div>`;
    nationality = data.nationality || [];
    nationalityYearly = data.nationality_yearly || [];
    nationalitySource = data.nationality_yearly_source || null;
    renderCountries();
    detailLoading.hidden = true;
    $('#detail').hidden = false;
  } catch {
    const message = detailLoadCopy();
    detailLoading.innerHTML = `<b>${esc(message.unavailable)}</b><p>${esc(message.retryLater)}</p><button id="judge-detail-retry" class="detail-retry" type="button">${esc(message.retry)}</button>`;
    $('#judge-detail-retry').addEventListener('click', load);
  } finally {
    detailLoading.setAttribute('aria-busy', 'false');
  }
}

$('#country-filter').addEventListener('input', (event) => {
  renderCountries();
});
document.querySelectorAll('[data-nationality-fy]').forEach((button) => button.addEventListener('click', () => {
  nationalityFiscalYear = Number(button.dataset.nationalityFy);
  renderCountries();
}));
load();

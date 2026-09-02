const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString();
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const colors = ['#14804a', '#2563a9', '#c4161c', '#7c3aed'];
const copy = {
  en: { title:'Compare immigration judges', intro:'Select 2–4 judges to compare approval rates, denials, sample sizes, yearly trends, nationalities, and official appointment backgrounds.', searchLabel:'Add a judge', searchPlaceholder:'Enter a judge, court, or city', clear:'Clear', hint:'Select at least 2 and no more than 4 judges.', emptyTitle:'Select judges to begin', emptyBody:'Search by name, court, or city. The full comparison appears after you select a second judge.', summary:'Core data comparison', copyLink:'Copy comparison link', trend:'Yearly approval-rate trend', trendNote:'Only yearly points with at least 50 merits decisions are shown', nationalities:'Leading applicant nationalities', nationalityNote:'Top five nationalities by merits decisions for each judge', background:'Official appointment background', disclaimer:'Historical statistics are informational only, not legal advice, and cannot predict an individual case. Read rates together with sample size, period, and case type.', loading:'Loading verified judge data…', max:'You can compare up to 4 judges.', copied:'Comparison link copied.', addMore:'Add one more judge to generate the comparison.', error:'The comparison data could not be loaded. Please try again.' },
  'zh-Hans': { title:'移民法官对比', intro:'选择2至4名法官，并排比较批准率、拒绝率、案件样本量、年度走势、申请人国籍和官方任命背景。', searchLabel:'添加法官', searchPlaceholder:'输入法官姓名、法院或城市', clear:'清空', hint:'至少选择2名、最多4名法官。', emptyTitle:'选择法官开始对比', emptyBody:'搜索姓名、法院或城市；选择第二名法官后生成完整对比。', summary:'核心数据对比', copyLink:'复制对比链接', trend:'年度批准率走势', trendNote:'仅显示达到50件有效裁决门槛的年度数据点', nationalities:'主要申请人国籍', nationalityNote:'每名法官按有效裁决量列出前5个国籍', background:'官方任命背景', disclaimer:'历史统计仅供信息参考，不构成法律意见，也不能预测个案结果。批准率必须与样本量、数据期间及案件类型一起理解。', loading:'正在读取真实法官数据…', max:'最多只能同时比较4名法官。', copied:'对比链接已复制。', addMore:'再添加1名法官即可生成对比。', error:'对比数据暂时无法读取，请稍后重试。' },
  'zh-Hant': { title:'移民法官比較', intro:'選擇2至4名法官，並排比較批准率、拒絕率、案件樣本、年度走勢、申請人國籍和官方任命背景。', searchLabel:'新增法官', searchPlaceholder:'輸入法官姓名、法院或城市', clear:'清空', hint:'至少選擇2名、最多4名法官。', emptyTitle:'選擇法官開始比較', emptyBody:'搜尋姓名、法院或城市；選擇第二名法官後產生完整比較。', summary:'核心數據比較', copyLink:'複製比較連結', trend:'年度批准率走勢', trendNote:'僅顯示達到50件有效裁決門檻的年度資料點', nationalities:'主要申請人國籍', nationalityNote:'每名法官按有效裁決量列出前5個國籍', background:'官方任命背景', disclaimer:'歷史統計僅供資訊參考，不構成法律意見，也不能預測個案結果。批准率必須與樣本量、資料期間及案件類型一起理解。', loading:'正在讀取真實法官資料…', max:'最多只能同時比較4名法官。', copied:'比較連結已複製。', addMore:'再新增1名法官即可產生比較。', error:'比較資料暫時無法讀取，請稍後重試。' }
};
Object.assign(copy, {
  es: { title:'Comparar jueces de inmigración', intro:'Seleccione de 2 a 4 jueces para comparar tasas de aprobación, denegaciones, muestras, tendencias anuales, nacionalidades y antecedentes oficiales.', searchLabel:'Añadir un juez', searchPlaceholder:'Introduzca un juez, tribunal o ciudad', clear:'Limpiar', hint:'Seleccione al menos 2 y como máximo 4 jueces.', emptyTitle:'Seleccione jueces para comenzar', emptyBody:'Busque por nombre, tribunal o ciudad. La comparación completa aparecerá al seleccionar un segundo juez.', summary:'Comparación de datos principales', copyLink:'Copiar enlace', trend:'Tendencia anual de aprobación', trendNote:'Solo se muestran años con al menos 50 decisiones sobre el fondo', nationalities:'Nacionalidades principales', nationalityNote:'Cinco nacionalidades con más decisiones sobre el fondo por juez', background:'Antecedentes oficiales', disclaimer:'Las estadísticas históricas son informativas, no constituyen asesoría legal ni predicen casos individuales. Interprete las tasas junto con la muestra, el período y el tipo de caso.', loading:'Cargando datos verificados…', max:'Puede comparar hasta 4 jueces.', copied:'Enlace copiado.', addMore:'Añada un juez más para generar la comparación.', error:'No se pudieron cargar los datos. Inténtelo de nuevo.' },
  fr: { title:'Comparer les juges de l’immigration', intro:'Sélectionnez 2 à 4 juges pour comparer les taux d’approbation, les refus, les échantillons, les tendances annuelles, les nationalités et les parcours officiels.', searchLabel:'Ajouter un juge', searchPlaceholder:'Saisissez un juge, un tribunal ou une ville', clear:'Effacer', hint:'Sélectionnez au moins 2 et au plus 4 juges.', emptyTitle:'Sélectionnez des juges pour commencer', emptyBody:'Recherchez par nom, tribunal ou ville. La comparaison complète apparaît après le choix d’un deuxième juge.', summary:'Comparaison des données clés', copyLink:'Copier le lien', trend:'Tendance annuelle du taux d’approbation', trendNote:'Seules les années comptant au moins 50 décisions au fond sont affichées', nationalities:'Principales nationalités', nationalityNote:'Cinq principales nationalités par nombre de décisions au fond pour chaque juge', background:'Parcours officiel de nomination', disclaimer:'Les statistiques historiques sont fournies à titre informatif, ne constituent pas un avis juridique et ne prédisent aucun cas individuel. Lisez les taux avec l’échantillon, la période et le type d’affaire.', loading:'Chargement des données vérifiées…', max:'Vous pouvez comparer jusqu’à 4 juges.', copied:'Lien de comparaison copié.', addMore:'Ajoutez encore un juge pour générer la comparaison.', error:'Impossible de charger les données. Veuillez réessayer.' },
  'pt-BR': { title:'Comparar juízes de imigração', intro:'Selecione de 2 a 4 juízes para comparar taxas de aprovação, recusas, amostras, tendências anuais, nacionalidades e históricos oficiais.', searchLabel:'Adicionar juiz', searchPlaceholder:'Digite um juiz, tribunal ou cidade', clear:'Limpar', hint:'Selecione pelo menos 2 e no máximo 4 juízes.', emptyTitle:'Selecione juízes para começar', emptyBody:'Pesquise por nome, tribunal ou cidade. A comparação completa aparece após selecionar o segundo juiz.', summary:'Comparação dos principais dados', copyLink:'Copiar link', trend:'Tendência anual da taxa de aprovação', trendNote:'Somente anos com pelo menos 50 decisões de mérito são exibidos', nationalities:'Principais nacionalidades', nationalityNote:'Cinco nacionalidades com mais decisões de mérito para cada juiz', background:'Histórico oficial de nomeação', disclaimer:'As estatísticas históricas são apenas informativas, não constituem aconselhamento jurídico nem preveem casos individuais. Leia as taxas com a amostra, o período e o tipo de caso.', loading:'Carregando dados verificados…', max:'Você pode comparar até 4 juízes.', copied:'Link da comparação copiado.', addMore:'Adicione mais um juiz para gerar a comparação.', error:'Não foi possível carregar os dados. Tente novamente.' },
  hi: { title:'इमिग्रेशन जजों की तुलना', intro:'अनुमोदन दर, अस्वीकृति, नमूना आकार, वार्षिक रुझान, राष्ट्रीयता और आधिकारिक नियुक्ति पृष्ठभूमि की तुलना के लिए 2–4 जज चुनें।', searchLabel:'जज जोड़ें', searchPlaceholder:'जज, अदालत या शहर दर्ज करें', clear:'साफ़ करें', hint:'कम से कम 2 और अधिकतम 4 जज चुनें।', emptyTitle:'तुलना शुरू करने के लिए जज चुनें', emptyBody:'नाम, अदालत या शहर से खोजें। दूसरा जज चुनने के बाद पूरी तुलना दिखाई देगी।', summary:'मुख्य डेटा तुलना', copyLink:'तुलना लिंक कॉपी करें', trend:'वार्षिक अनुमोदन दर रुझान', trendNote:'केवल कम से कम 50 मेरिट निर्णय वाले वर्ष दिखाए जाते हैं', nationalities:'प्रमुख आवेदक राष्ट्रीयताएँ', nationalityNote:'प्रत्येक जज के लिए मेरिट निर्णयों के आधार पर शीर्ष पाँच राष्ट्रीयताएँ', background:'आधिकारिक नियुक्ति पृष्ठभूमि', disclaimer:'ऐतिहासिक आँकड़े केवल सूचना के लिए हैं, कानूनी सलाह नहीं हैं और किसी मामले के परिणाम का अनुमान नहीं लगाते। दरों को नमूना आकार, अवधि और मामले के प्रकार के साथ पढ़ें।', loading:'सत्यापित जज डेटा लोड हो रहा है…', max:'आप अधिकतम 4 जजों की तुलना कर सकते हैं।', copied:'तुलना लिंक कॉपी हो गया।', addMore:'तुलना बनाने के लिए एक और जज जोड़ें।', error:'तुलना डेटा लोड नहीं हो सका। कृपया फिर प्रयास करें।' },
  ru: { title:'Сравнение иммиграционных судей', intro:'Выберите от 2 до 4 судей, чтобы сравнить доли одобрения и отказа, объём выборки, годовые тенденции, гражданство заявителей и официальные биографии.', searchLabel:'Добавить судью', searchPlaceholder:'Введите имя судьи, суд или город', clear:'Очистить', hint:'Выберите не менее 2 и не более 4 судей.', emptyTitle:'Выберите судей для сравнения', emptyBody:'Ищите по имени, суду или городу. Полное сравнение появится после выбора второго судьи.', summary:'Сравнение основных данных', copyLink:'Копировать ссылку', trend:'Годовая динамика одобрений', trendNote:'Показаны только годы с не менее чем 50 решениями по существу', nationalities:'Основные гражданства заявителей', nationalityNote:'Пять гражданств с наибольшим числом решений по существу для каждого судьи', background:'Официальные сведения о назначении', disclaimer:'Историческая статистика носит информационный характер, не является юридической консультацией и не предсказывает исход отдельного дела. Оценивайте показатели вместе с размером выборки, периодом и типом дела.', loading:'Загрузка проверенных данных…', max:'Можно сравнить не более 4 судей.', copied:'Ссылка на сравнение скопирована.', addMore:'Добавьте ещё одного судью для сравнения.', error:'Не удалось загрузить данные. Повторите попытку.' },
  ar: { title:'مقارنة قضاة الهجرة', intro:'اختر من قاضيين إلى أربعة لمقارنة نسب الموافقة والرفض وحجم العينة والاتجاهات السنوية والجنسيات والخلفيات الرسمية للتعيين.', searchLabel:'إضافة قاضٍ', searchPlaceholder:'أدخل اسم قاضٍ أو محكمة أو مدينة', clear:'مسح', hint:'اختر قاضيين على الأقل وأربعة على الأكثر.', emptyTitle:'اختر القضاة لبدء المقارنة', emptyBody:'ابحث بالاسم أو المحكمة أو المدينة. تظهر المقارنة الكاملة بعد اختيار القاضي الثاني.', summary:'مقارنة البيانات الأساسية', copyLink:'نسخ رابط المقارنة', trend:'اتجاه نسبة الموافقة السنوي', trendNote:'تُعرض فقط السنوات التي تضم 50 قراراً موضوعياً على الأقل', nationalities:'أبرز جنسيات المتقدمين', nationalityNote:'أعلى خمس جنسيات حسب القرارات الموضوعية لكل قاضٍ', background:'خلفية التعيين الرسمية', disclaimer:'الإحصاءات التاريخية للمعلومات فقط، ولا تشكل استشارة قانونية ولا تتنبأ بنتيجة أي قضية. اقرأ النسب مع حجم العينة والفترة ونوع القضية.', loading:'جارٍ تحميل بيانات القضاة الموثقة…', max:'يمكنك مقارنة أربعة قضاة كحد أقصى.', copied:'تم نسخ رابط المقارنة.', addMore:'أضف قاضياً آخر لإنشاء المقارنة.', error:'تعذر تحميل بيانات المقارنة. يرجى المحاولة مرة أخرى.' },
  tr: { title:'Göçmenlik hâkimlerini karşılaştırın', intro:'Onay ve ret oranlarını, örneklem büyüklüğünü, yıllık eğilimleri, uyrukları ve resmî atama geçmişlerini karşılaştırmak için 2–4 hâkim seçin.', searchLabel:'Hâkim ekle', searchPlaceholder:'Hâkim, mahkeme veya şehir girin', clear:'Temizle', hint:'En az 2, en fazla 4 hâkim seçin.', emptyTitle:'Karşılaştırmaya başlamak için hâkim seçin', emptyBody:'Ad, mahkeme veya şehirle arayın. İkinci hâkimi seçtikten sonra tam karşılaştırma görünür.', summary:'Temel veri karşılaştırması', copyLink:'Karşılaştırma bağlantısını kopyala', trend:'Yıllık onay oranı eğilimi', trendNote:'Yalnızca en az 50 esasa ilişkin karar bulunan yıllar gösterilir', nationalities:'Başlıca başvuru sahibi uyrukları', nationalityNote:'Her hâkim için esasa ilişkin karar sayısına göre ilk beş uyruk', background:'Resmî atama geçmişi', disclaimer:'Geçmiş istatistikler yalnızca bilgi amaçlıdır; hukuki tavsiye değildir ve tek bir davanın sonucunu öngöremez. Oranları örneklem, dönem ve dava türüyle birlikte değerlendirin.', loading:'Doğrulanmış hâkim verileri yükleniyor…', max:'En fazla 4 hâkimi karşılaştırabilirsiniz.', copied:'Karşılaştırma bağlantısı kopyalandı.', addMore:'Karşılaştırmayı oluşturmak için bir hâkim daha ekleyin.', error:'Karşılaştırma verileri yüklenemedi. Lütfen tekrar deneyin.' }
});
const sharedCopy = {
  en: { remove:'Remove', noMatch:'No matching judge', merits:'merits decisions', total:'Total outcomes', granted:'Granted', denied:'Denied', other:'Other', profile:'View full profile', noNationality:'No nationality breakdown available.', appointment:'Appointment', officialCourt:'Official court', source:'DOJ/EOIR source', noBiography:'No matching official DOJ/EOIR appointment biography yet.' },
  es: { remove:'Eliminar', noMatch:'No se encontró ningún juez', merits:'decisiones sobre el fondo', total:'Resultados totales', granted:'Aprobadas', denied:'Denegadas', other:'Otros', profile:'Ver perfil completo', noNationality:'No hay desglose por nacionalidad.', appointment:'Nombramiento', officialCourt:'Tribunal oficial', source:'Fuente DOJ/EOIR', noBiography:'Aún no hay una biografía oficial de nombramiento coincidente.' },
  fr: { remove:'Supprimer', noMatch:'Aucun juge correspondant', merits:'décisions au fond', total:'Résultats totaux', granted:'Accordées', denied:'Refusées', other:'Autres', profile:'Voir le profil complet', noNationality:'Aucune ventilation par nationalité.', appointment:'Nomination', officialCourt:'Tribunal officiel', source:'Source DOJ/EOIR', noBiography:'Aucune biographie officielle de nomination correspondante pour le moment.' },
  'pt-BR': { remove:'Remover', noMatch:'Nenhum juiz encontrado', merits:'decisões de mérito', total:'Resultados totais', granted:'Aprovadas', denied:'Negadas', other:'Outros', profile:'Ver perfil completo', noNationality:'Não há detalhamento por nacionalidade.', appointment:'Nomeação', officialCourt:'Tribunal oficial', source:'Fonte DOJ/EOIR', noBiography:'Ainda não há biografia oficial de nomeação correspondente.' },
  hi: { remove:'हटाएँ', noMatch:'कोई मेल खाता जज नहीं', merits:'मेरिट निर्णय', total:'कुल परिणाम', granted:'स्वीकृत', denied:'अस्वीकृत', other:'अन्य', profile:'पूरा प्रोफ़ाइल देखें', noNationality:'राष्ट्रीयता का विवरण उपलब्ध नहीं है।', appointment:'नियुक्ति', officialCourt:'आधिकारिक अदालत', source:'DOJ/EOIR स्रोत', noBiography:'अभी कोई मेल खाती आधिकारिक नियुक्ति जीवनी नहीं है।' },
  'zh-Hans': { remove:'移除', noMatch:'没有找到匹配的法官', merits:'件有效裁决', total:'全部结果', granted:'批准', denied:'拒绝', other:'其他', profile:'查看完整资料', noNationality:'暂无国籍明细。', appointment:'任命日期', officialCourt:'官方法院', source:'DOJ/EOIR 来源', noBiography:'暂未找到匹配的 DOJ/EOIR 官方任命履历。' },
  'zh-Hant': { remove:'移除', noMatch:'沒有找到相符的法官', merits:'件有效裁決', total:'全部結果', granted:'批准', denied:'拒絕', other:'其他', profile:'查看完整資料', noNationality:'暫無國籍明細。', appointment:'任命日期', officialCourt:'官方法院', source:'DOJ/EOIR 來源', noBiography:'暫未找到相符的 DOJ/EOIR 官方任命履歷。' },
  ru: { remove:'Удалить', noMatch:'Подходящий судья не найден', merits:'решений по существу', total:'Всего исходов', granted:'Одобрено', denied:'Отказано', other:'Другое', profile:'Открыть полный профиль', noNationality:'Разбивка по гражданству отсутствует.', appointment:'Назначение', officialCourt:'Официальный суд', source:'Источник DOJ/EOIR', noBiography:'Подходящая официальная биография о назначении пока не найдена.' },
  ar: { remove:'إزالة', noMatch:'لم يتم العثور على قاضٍ مطابق', merits:'قراراً موضوعياً', total:'إجمالي النتائج', granted:'موافقات', denied:'رفض', other:'أخرى', profile:'عرض الملف الكامل', noNationality:'لا يتوفر تفصيل حسب الجنسية.', appointment:'التعيين', officialCourt:'المحكمة الرسمية', source:'مصدر DOJ/EOIR', noBiography:'لا توجد حتى الآن سيرة تعيين رسمية مطابقة.' },
  tr: { remove:'Kaldır', noMatch:'Eşleşen hâkim bulunamadı', merits:'esasa ilişkin karar', total:'Toplam sonuç', granted:'Onaylanan', denied:'Reddedilen', other:'Diğer', profile:'Tam profili görüntüle', noNationality:'Uyruk dağılımı mevcut değil.', appointment:'Atama', officialCourt:'Resmî mahkeme', source:'DOJ/EOIR kaynağı', noBiography:'Henüz eşleşen resmî DOJ/EOIR atama biyografisi yok.' }
};
let judges = [];
let selected = [];
let details = [];
let activeSearchResult = -1;

const locale = () => window.AsylumI18n?.locale || document.body.dataset.asylumLocale || 'zh-Hans';
const words = () => copy[locale()] || copy.en;
const labels = () => sharedCopy[locale()] || sharedCopy.en;
const judgeName = (row) => {
  const value = String(row?.judge_name || '');
  if (!value.includes(',')) return value;
  const [last, ...rest] = value.split(',');
  return `${rest.join(' ').trim()} ${last.trim()}`.trim();
};
const profileUrl = (row) => window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/judge?id=${encodeURIComponent(row.id)}`;
const merits = (row) => Number(row?.grants || 0) + Number(row?.denials || 0);
const approval = (row) => row?.adjudicated_approval_rate ?? row?.approval_rate ?? (merits(row) ? Number(row.grants || 0) / merits(row) * 100 : null);

function applyCopy() {
  const text = words();
  document.querySelectorAll('[data-copy]').forEach((node) => { node.textContent = text[node.dataset.copy] || node.textContent; });
  document.querySelectorAll('[data-copy-placeholder]').forEach((node) => { node.placeholder = text[node.dataset.copyPlaceholder] || node.placeholder; });
  document.title = locale().startsWith('zh') ? `${text.title}｜批准率、样本量与年度趋势｜AsylumJudge` : `${text.title} | AsylumJudge`;
}

function renderEmptyState() {
  $('#compare-empty').innerHTML = `<div><h2>${esc(words().emptyTitle)}</h2><p>${esc(words().emptyBody)}</p></div>`;
}

function updateUrl() {
  const url = new URL(location.href);
  if (selected.length) url.searchParams.set('judges', selected.map((row) => row.id).join(','));
  else url.searchParams.delete('judges');
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function renderSelected() {
  $('#selected-judges').innerHTML = selected.map((row) => `<span class="selected-judge">${esc(judgeName(row))}<button type="button" data-remove="${esc(row.id)}" aria-label="${esc(labels().remove)} ${esc(judgeName(row))}">×</button></span>`).join('');
  $('#selected-judges').querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    selected = selected.filter((row) => row.id !== button.dataset.remove);
    details = details.filter((item) => item.judge.id !== button.dataset.remove);
    updateUrl(); renderSelected(); renderComparison();
  }));
  $('#compare-status').textContent = selected.length === 1 ? words().addMore : words().hint;
}

function searchJudges(value) {
  const terms = String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return judges.filter((row) => !selected.some((item) => item.id === row.id)).filter((row) => {
    const haystack = [row.judge_name, row.court_name, row.court_city, row.court_state].filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => merits(b) - merits(a)).slice(0, 12);
}

function closeSearchResults() {
  const input = $('#compare-search');
  const container = $('#compare-search-results');
  container.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  activeSearchResult = -1;
}

function setActiveSearchResult(index) {
  const input = $('#compare-search');
  const options = [...document.querySelectorAll('#compare-search-results [role="option"]')];
  if (!options.length) { closeSearchResults(); return null; }
  activeSearchResult = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeSearchResult;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
  const active = options[activeSearchResult];
  input.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
  return active;
}

function showSearchResults(value) {
  const rows = searchJudges(value);
  const container = $('#compare-search-results');
  const input = $('#compare-search');
  const hasQuery = Boolean(String(value || '').trim());
  activeSearchResult = -1;
  input.removeAttribute('aria-activedescendant');
  container.hidden = !hasQuery;
  input.setAttribute('aria-expanded', String(hasQuery));
  container.innerHTML = rows.length ? rows.map((row, index) => `<button id="compare-search-option-${index}" class="compare-search-result" type="button" role="option" aria-selected="false" tabindex="-1" data-add="${esc(row.id)}"><span><b>${esc(judgeName(row))}</b><small>${esc(row.court_name || [row.court_city,row.court_state].filter(Boolean).join(', '))}</small></span><span>${pct(approval(row))}</span></button>`).join('') : `<div class="compare-status" role="status">${esc(labels().noMatch)}</div>`;
  container.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addJudge(button.dataset.add)));
}

async function addJudge(id) {
  if (selected.length >= 4) { $('#compare-status').textContent = words().max; return; }
  const row = judges.find((item) => item.id === id);
  if (!row || selected.some((item) => item.id === id)) return;
  selected.push(row);
  $('#compare-search').value = '';
  closeSearchResults();
  updateUrl(); renderSelected(); await loadDetails();
}

function renderCards() {
  const count = details.length;
  $('#compare-cards').style.setProperty('--judge-count', count);
  $('#compare-cards').innerHTML = details.map((data, index) => {
    const row = data.judge;
    return `<article class="compare-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(row))}</h3><p class="court">${esc(row.court_name || '')}${row.court_state ? ` · ${esc(row.court_state)}` : ''}</p><strong class="compare-rate">${pct(approval(row))}</strong><span class="compare-sample">${fmt(merits(row))} ${esc(labels().merits)} · ${esc(row.data_start_date || '—')}–${esc(row.data_end_date || '—')}</span><div class="compare-metrics"><span>${esc(labels().total)}<b>${fmt(row.total_asylum_decisions)}</b></span><span class="pass">${esc(labels().granted)}<b>${fmt(row.grants)}</b></span><span class="deny">${esc(labels().denied)}<b>${fmt(row.denials)}</b></span><span class="other">${esc(labels().other)}<b>${fmt(row.other_decisions)}</b></span></div><a class="compare-profile" href="${esc(profileUrl(row))}">${esc(labels().profile)} →</a></article>`;
  }).join('');
}

function drawTrend() {
  const svg = $('#compare-trend');
  const years = [...new Set(details.flatMap((data) => (data.yearly || []).map((row) => Number(row.fiscal_year))))].filter(Boolean).sort();
  if (!years.length) { svg.innerHTML = ''; return; }
  const width = 1080, left = 65, right = 35, top = 35, bottom = 320;
  const x = (year) => left + years.indexOf(year) * (width - left - right) / Math.max(1, years.length - 1);
  const y = (value) => bottom - Number(value) / 100 * (bottom - top);
  const grid = [0,25,50,75,100].map((value) => `<line class="compare-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"></line><text class="compare-axis" x="8" y="${y(value)+4}">${value}%</text>`).join('');
  const labels = years.map((year) => `<text class="compare-axis" x="${x(year)}" y="355" text-anchor="middle">FY ${year}</text>`).join('');
  const series = details.map((data, index) => {
    const points = (data.yearly || []).filter((row) => merits(row) >= 50).map((row) => ({ year:Number(row.fiscal_year), rate:approval(row), count:merits(row) })).filter((row) => row.rate != null && years.includes(row.year));
    if (!points.length) return '';
    const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${x(point.year).toFixed(1)},${y(point.rate).toFixed(1)}`).join(' ');
    return `<g style="--series-color:${colors[index]}"><path class="compare-line" d="${path}"></path>${points.map((point) => `<circle class="compare-dot" cx="${x(point.year)}" cy="${y(point.rate)}" r="6"><title>${esc(judgeName(data.judge))} · FY ${point.year} · ${pct(point.rate)} · ${fmt(point.count)}</title></circle><text class="compare-point-label" x="${x(point.year)}" y="${y(point.rate)-11}" text-anchor="middle">${Number(point.rate).toFixed(0)}%</text>`).join('')}</g>`;
  }).join('');
  svg.innerHTML = `${grid}${series}${labels}`;
  $('#compare-legend').innerHTML = details.map((data,index) => `<span style="--series-color:${colors[index]}"><i></i>${esc(judgeName(data.judge))}</span>`).join('');
}

function renderNationalities() {
  const container = $('#compare-nationalities');
  container.style.setProperty('--judge-count', details.length);
  container.innerHTML = details.map((data,index) => {
    const rows = [...(data.nationality || [])].sort((a,b) => merits(b)-merits(a)).slice(0,5);
    return `<article class="compare-detail-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(data.judge))}</h3>${rows.length ? rows.map((row) => `<div class="nationality-row"><span>${esc(row.nationality || row.nationality_code || '—')}</span><span>${fmt(merits(row))}</span><b>${pct(approval(row))}</b></div>`).join('') : `<p>${esc(labels().noNationality)}</p>`}</article>`;
  }).join('');
}

function renderBackgrounds() {
  const container = $('#compare-backgrounds');
  container.style.setProperty('--judge-count', details.length);
  container.innerHTML = details.map((data,index) => {
    const bg = data.background;
    return `<article class="compare-detail-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(data.judge))}</h3>${bg ? `<div class="background-facts"><span>${esc(labels().appointment)}<b>${esc(bg.appointment_date || '—')}</b></span><span>${esc(labels().officialCourt)}<b>${esc(bg.appointment_court || '—')}</b></span></div><p>${esc(String(bg.biography || '').slice(0,520))}${String(bg.biography || '').length > 520 ? '…' : ''}</p>${bg.source_url ? `<a class="compare-profile" href="${esc(bg.source_url)}" target="_blank" rel="noopener">${esc(labels().source)} ↗</a>` : ''}` : `<p>${esc(labels().noBiography)}</p>`}</article>`;
  }).join('');
}

function renderComparison() {
  const ready = selected.length >= 2 && details.length === selected.length;
  $('#compare-empty').hidden = ready;
  $('#compare-content').hidden = !ready;
  if (!ready) { renderEmptyState(); return; }
  renderCards(); drawTrend(); renderNationalities(); renderBackgrounds();
}

async function loadDetails() {
  if (selected.length < 2) { renderComparison(); return; }
  $('#compare-empty').hidden = false;
  $('#compare-content').hidden = true;
  $('#compare-empty').innerHTML = `<div class="compare-loading">${esc(words().loading)}</div>`;
  try {
    details = await Promise.all(selected.map((row) => fetch(`/.netlify/functions/immigration-judges?mode=detail&id=${encodeURIComponent(row.id)}`).then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })));
    renderComparison();
  } catch {
    details = [];
    $('#compare-empty').hidden = false;
    $('#compare-empty').innerHTML = `<div class="compare-error">${esc(words().error)}</div>`;
  }
}

async function load() {
  applyCopy();
  renderEmptyState();
  try {
    const response = await fetch('/.netlify/functions/immigration-judges?mode=all');
    if (!response.ok) throw new Error(response.status);
    judges = (await response.json()).results || [];
    const requested = (new URLSearchParams(location.search).get('judges') || '').split(',').filter(Boolean).slice(0,4);
    selected = requested.map((id) => judges.find((row) => row.id === id)).filter(Boolean);
    renderSelected();
    if (selected.length >= 2) await loadDetails();
  } catch {
    $('#compare-empty').innerHTML = `<div class="compare-error">${esc(words().error)}</div>`;
  }
}

$('#compare-search').addEventListener('input', (event) => showSearchResults(event.target.value));
$('#compare-search').addEventListener('keydown', (event) => {
  let options = [...document.querySelectorAll('#compare-search-results [role="option"]')];
  if (event.key === 'Escape') { closeSearchResults(); return; }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if ($('#compare-search-results').hidden) {
      showSearchResults(event.currentTarget.value);
      options = [...document.querySelectorAll('#compare-search-results [role="option"]')];
    }
    const target = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowDown' ? (activeSearchResult < 0 ? 0 : activeSearchResult + 1)
          : (activeSearchResult < 0 ? options.length - 1 : activeSearchResult - 1);
    setActiveSearchResult(target);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const active = options[activeSearchResult] || options[0];
    if (active) addJudge(active.dataset.add);
  }
});
$('#clear-comparison').addEventListener('click', () => { selected = []; details = []; updateUrl(); renderSelected(); renderComparison(); });
$('#copy-compare-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('#compare-status').textContent = words().copied; } catch {} });
document.addEventListener('click', (event) => { if (!event.target.closest('.compare-picker')) closeSearchResults(); });
window.addEventListener('asylumjudge:localechange', () => {
  applyCopy();
  renderSelected();
  renderComparison();
  if ($('#compare-search').value.trim()) showSearchResults($('#compare-search').value);
});
load();

(() => {
  const locales = ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr'];
  const labels = { en:'EN', es:'ES', fr:'FR', 'pt-BR':'PT-BR', hi:'HI', 'zh-Hans':'简中', 'zh-Hant':'繁中', ru:'RU', ar:'AR', tr:'TR' };
  const storageKey = 'huarengongzuo-language';
  const columns = ['source', ...locales];
  const rows = [
    ['语言','Language','Idioma','Langue','Idioma','भाषा','语言','語言','Язык','اللغة','Dil'],
    ['华人工作网','Huaren Jobs','Empleos Huaren','Emplois Huaren','Empregos Huaren','हुआरेन जॉब्स','华人工作网','華人工作網','Huaren Работа','وظائف هوارن','Huaren İş'],
    ['最新工作','Latest jobs','Últimos empleos','Dernières offres','Vagas recentes','नई नौकरियां','最新工作','最新工作','Новые вакансии','أحدث الوظائف','Yeni işler'],
    ['附近工作','Jobs nearby','Empleos cercanos','Emplois à proximité','Vagas próximas','आस-पास नौकरियां','附近工作','附近工作','Работа рядом','وظائف قريبة','Yakındaki işler'],
    ['发布招聘','Post a job','Publicar empleo','Publier une offre','Publicar vaga','नौकरी पोस्ट करें','发布招聘','發佈招聘','Разместить вакансию','نشر وظيفة','İlan ver'],
    ['发布求职','Post job wanted','Publicar búsqueda','Publier une recherche','Publicar procura','काम की मांग पोस्ट करें','发布求职','發佈求職','Разместить резюме','نشر طلب عمل','İş arama ilanı'],
    ['二手交易','Marketplace','Segunda mano','Petites annonces','Usados','पुराना सामान','二手交易','二手交易','Барахолка','سوق المستعمل','İkinci el'],
    ['唐人日报入口','Tang Ren Daily','Tang Ren Daily','Tang Ren Daily','Tang Ren Daily','Tang Ren Daily','唐人日报入口','唐人日報入口','Tang Ren Daily','صحيفة تانغ رن','Tang Ren Daily'],
    ['美国华人招聘 · 岗位持续更新','Chinese jobs across the U.S. · Updated continuously','Empleos para chinos en EE. UU. · Actualización continua','Emplois chinois aux États-Unis · Mise à jour continue','Empregos chineses nos EUA · Atualização contínua','अमेरिका में चीनी समुदाय की नौकरियां · लगातार अपडेट','美国华人招聘 · 岗位持续更新','美國華人招聘 · 職位持續更新','Работа для китайской общины США · Постоянные обновления','وظائف للجالية الصينية في أمريكا · تحديث مستمر','ABD Çin toplumu işleri · Sürekli güncel'],
    ['找工作，','Find work,','Encuentra trabajo,','Trouvez un emploi,','Encontre trabalho,','काम खोजें,','找工作，','找工作，','Найдите работу —','ابحث عن عمل،','İş bul,'],
    ['更直接','more directly','sin rodeos','plus simplement','sem complicação','सीधे और आसानी से','更直接','更直接','без посредников','بشكل مباشر','doğrudan'],
    ['先看岗位，再联系招聘方。不会英语、不会复杂筛选，也能按城市和常用工作快速找到机会。','Browse jobs first, then contact the employer. Search by city and common job type even if English or complex filters are difficult.','Primero vea las vacantes y luego contacte al empleador. Busque por ciudad y tipo de trabajo, aunque no domine el inglés.','Consultez les offres puis contactez l’employeur. Recherchez par ville et métier, même sans maîtriser l’anglais.','Veja as vagas e depois fale com o empregador. Pesquise por cidade e tipo de trabalho, mesmo sem dominar inglês.','पहले नौकरियां देखें, फिर नियोक्ता से संपर्क करें। अंग्रेज़ी कठिन हो तो भी शहर और काम के प्रकार से खोजें।','先看岗位，再联系招聘方。不会英语、不会复杂筛选，也能按城市和常用工作快速找到机会。','先看職位，再聯絡招聘方。不會英語、不會複雜篩選，也能按城市和常用工作快速找到機會。','Сначала выберите вакансию, затем свяжитесь с работодателем. Ищите по городу и типу работы даже без знания английского.','تصفح الوظائف أولاً ثم تواصل مع صاحب العمل. ابحث حسب المدينة ونوع العمل حتى إن كانت الإنجليزية صعبة.','Önce ilanlara bakın, sonra işverenle iletişime geçin. İngilizce bilmeseniz de şehir ve iş türüne göre arayın.'],
    ['找什么工作','What kind of work?','¿Qué trabajo busca?','Quel emploi ?','Que trabalho?','कौन सा काम?','找什么工作','找什麼工作','Какая работа?','ما نوع العمل؟','Ne işi?'],
    ['例如：餐馆、司机、仓库、美甲','For example: restaurant, driver, warehouse, nail salon','Ej.: restaurante, conductor, almacén, uñas','Ex. : restaurant, chauffeur, entrepôt, manucure','Ex.: restaurante, motorista, armazém, manicure','जैसे: रेस्तरां, ड्राइवर, गोदाम, नेल सैलून','例如：餐馆、司机、仓库、美甲','例如：餐館、司機、倉庫、美甲','Например: ресторан, водитель, склад, маникюр','مثال: مطعم، سائق، مستودع، أظافر','Örn: restoran, şoför, depo, manikür'],
    ['想在哪里','Where?','¿Dónde?','Où ?','Onde?','कहां?','想在哪里','想在哪裡','Где?','أين؟','Nerede?'],
    ['城市、州或社区','City, state, or neighborhood','Ciudad, estado o vecindario','Ville, État ou quartier','Cidade, estado ou bairro','शहर, राज्य या इलाका','城市、州或社区','城市、州或社區','Город, штат или район','المدينة أو الولاية أو الحي','Şehir, eyalet veya mahalle'],
    ['查看工作','View jobs','Ver empleos','Voir les offres','Ver vagas','नौकरियां देखें','查看工作','查看工作','Смотреть вакансии','عرض الوظائف','İşleri gör'],
    ['正在招聘','Hiring now','Contratando','Recrutement en cours','Contratando agora','अभी भर्ती','正在招聘','正在招聘','Сейчас нанимают','توظيف الآن','Şimdi işe alıyor'],
    ['推荐岗位','Featured jobs','Empleos destacados','Offres recommandées','Vagas em destaque','चुनिंदा नौकरियां','推荐岗位','推薦職位','Рекомендуемые вакансии','وظائف مميزة','Öne çıkan işler'],
    ['读取中','Loading','Cargando','Chargement','Carregando','लोड हो रहा है','读取中','讀取中','Загрузка','جارٍ التحميل','Yükleniyor'],
    ['查看全部岗位','View all jobs','Ver todos','Voir toutes les offres','Ver todas as vagas','सभी नौकरियां देखें','查看全部岗位','查看全部職位','Все вакансии','عرض كل الوظائف','Tüm işleri gör'],
    ['我要找工作','I need a job','Busco trabajo','Je cherche un emploi','Quero trabalho','मुझे काम चाहिए','我要找工作','我要找工作','Ищу работу','أبحث عن عمل','İş arıyorum'],
    ['按位置、距离和工作类别筛选','Filter by location, distance, and job type','Filtre por ubicación, distancia y tipo','Filtrer par lieu, distance et métier','Filtre por local, distância e tipo','स्थान, दूरी और काम के प्रकार से छांटें','按位置、距离和工作类别筛选','按位置、距離和工作類別篩選','Фильтр по месту, расстоянию и типу','تصفية حسب الموقع والمسافة ونوع العمل','Konum, mesafe ve iş türüne göre filtrele'],
    ['我要招聘','I’m hiring','Quiero contratar','Je recrute','Quero contratar','मुझे कर्मचारी चाहिए','我要招聘','我要招聘','Ищу сотрудников','أريد التوظيف','Çalışan arıyorum'],
    ['极简发布，进入人工审核','Quick posting with human review','Publicación rápida con revisión humana','Publication rapide avec contrôle humain','Publicação rápida com revisão humana','आसान पोस्टिंग और मानव समीक्षा','极简发布，进入人工审核','快速發佈，進入人工審核','Быстрая публикация и ручная проверка','نشر سريع مع مراجعة بشرية','Hızlı ilan ve insan incelemesi'],
    ['七大分类，本地闲置买卖与免费赠送','Seven local categories for resale and free items','Siete categorías locales de venta y regalos','Sept catégories locales de vente et dons','Sete categorias locais de venda e doação','स्थानीय बिक्री और मुफ्त सामान की सात श्रेणियां','七大分类，本地闲置买卖与免费赠送','七大分類，本地閒置買賣與免費贈送','Семь категорий местных продаж и бесплатных вещей','سبع فئات للبيع المحلي والأغراض المجانية','Yerel satış ve ücretsiz ürünler için yedi kategori'],
    ['最新招聘岗位','Latest job openings','Últimas vacantes','Dernières offres d’emploi','Vagas mais recentes','नई भर्ती','最新招聘岗位','最新招聘職位','Последние вакансии','أحدث فرص العمل','En yeni iş ilanları'],
    ['只展示仍有效并且至少有一种联系方式的岗位。','Only active jobs with at least one contact method are shown.','Solo se muestran empleos vigentes con al menos un método de contacto.','Seules les offres actives avec au moins un moyen de contact sont affichées.','Mostramos apenas vagas ativas com pelo menos um contato.','केवल सक्रिय नौकरियां दिखाई जाती हैं जिनमें संपर्क का कम से कम एक तरीका हो।','只展示仍有效并且至少有一种联系方式的岗位。','只展示仍有效並且至少有一種聯絡方式的職位。','Показаны только активные вакансии хотя бы с одним контактом.','تُعرض فقط الوظائف السارية التي تتضمن وسيلة تواصل واحدة على الأقل.','Yalnızca en az bir iletişim yöntemi olan aktif ilanlar gösterilir.'],
    ['地图与高级筛选','Map and advanced filters','Mapa y filtros avanzados','Carte et filtres avancés','Mapa e filtros avançados','मानचित्र और उन्नत फ़िल्टर','地图与高级筛选','地圖與進階篩選','Карта и расширенные фильтры','الخريطة والفلاتر المتقدمة','Harita ve gelişmiş filtreler'],
    ['正在读取最新岗位…','Loading the latest jobs…','Cargando las últimas vacantes…','Chargement des dernières offres…','Carregando vagas recentes…','नई नौकरियां लोड हो रही हैं…','正在读取最新岗位…','正在讀取最新職位…','Загрузка новых вакансий…','جارٍ تحميل أحدث الوظائف…','En yeni işler yükleniyor…'],
    ['显示更多岗位','Show more jobs','Mostrar más empleos','Afficher plus d’offres','Mostrar mais vagas','और नौकरियां दिखाएं','显示更多岗位','顯示更多職位','Показать ещё','عرض المزيد من الوظائف','Daha fazla iş göster'],
    ['求职安全','Job search safety','Seguridad laboral','Sécurité de la recherche','Segurança na busca','नौकरी खोज सुरक्षा','求职安全','求職安全','Безопасность поиска','أمان البحث عن عمل','İş arama güvenliği'],
    ['先核实，再转账','Verify first, then pay','Verifique antes de pagar','Vérifiez avant de payer','Verifique antes de pagar','भुगतान से पहले जांचें','先核实，再转账','先核實，再轉帳','Сначала проверьте, потом платите','تحقق أولاً ثم ادفع','Önce doğrula, sonra ödeme yap'],
    ['正规招聘不应要求求职者预付高额费用、提供银行卡密码或验证码。发现重复、虚假或可疑信息，可向平台举报并交由后台人工处理。','Legitimate employers should not demand large advance fees, bank passwords, or verification codes. Report duplicate, false, or suspicious posts for human review.','Un empleador legítimo no debe exigir pagos altos por adelantado, contraseñas bancarias ni códigos. Reporte anuncios falsos o sospechosos.','Un employeur légitime ne doit pas exiger d’importants frais, mots de passe bancaires ou codes. Signalez toute annonce suspecte.','Empregadores legítimos não devem exigir taxas altas, senhas bancárias ou códigos. Denuncie anúncios falsos ou suspeitos.','वैध नियोक्ता बड़ी अग्रिम फीस, बैंक पासवर्ड या सत्यापन कोड नहीं मांगते। संदिग्ध पोस्ट की रिपोर्ट करें।','正规招聘不应要求求职者预付高额费用、提供银行卡密码或验证码。发现重复、虚假或可疑信息，可向平台举报并交由后台人工处理。','正規招聘不應要求求職者預付高額費用、提供銀行卡密碼或驗證碼。發現重複、虛假或可疑資訊，可向平台舉報並交由後台人工處理。','Добросовестный работодатель не требует крупных предоплат, банковских паролей или кодов. Сообщайте о подозрительных объявлениях.','لا يطلب صاحب العمل الموثوق رسوماً كبيرة مقدماً أو كلمات مرور بنكية أو رموز تحقق. أبلغ عن الإعلانات المشبوهة.','Meşru işverenler yüksek ön ödeme, banka şifresi veya doğrulama kodu istemez. Şüpheli ilanları bildirin.'],
    ['查看平台规则','View platform rules','Ver reglas','Voir les règles','Ver regras','प्लेटफ़ॉर्म नियम देखें','查看平台规则','查看平台規則','Правила платформы','عرض قواعد المنصة','Platform kuralları'],
    ['与唐人日报共用招聘数据与人工审核系统','Shared job data and human review with Tang Ren Daily','Datos y revisión humana compartidos con Tang Ren Daily','Données et contrôle humain partagés avec Tang Ren Daily','Dados e revisão humana compartilhados com Tang Ren Daily','Tang Ren Daily के साथ साझा डेटा और मानव समीक्षा','与唐人日报共用招聘数据与人工审核系统','與唐人日報共用招聘資料與人工審核系統','Общие данные и ручная проверка с Tang Ren Daily','بيانات ومراجعة بشرية مشتركة مع صحيفة تانغ رن','Tang Ren Daily ile ortak veri ve insan incelemesi'],
    ['美国招聘求职','U.S. Jobs','Empleos en EE. UU.','Emplois aux États-Unis','Empregos nos EUA','अमेरिका में नौकरियां','美国招聘求职','美國招聘求職','Работа в США','وظائف في أمريكا','ABD İş İlanları'],
    ['实时岗位 · 华人常用工作优先','Live jobs · Popular community roles first','Vacantes en vivo · Trabajos populares primero','Offres en direct · Métiers populaires en priorité','Vagas ao vivo · Trabalhos populares primeiro','लाइव नौकरियां · समुदाय के लोकप्रिय काम पहले','实时岗位 · 华人常用工作优先','即時職位 · 華人常用工作優先','Актуальные вакансии · Популярные работы первыми','وظائف مباشرة · الأعمال الشائعة أولاً','Canlı ilanlar · Toplulukta yaygın işler önce'],
    ['找什么工作？','What kind of work?','¿Qué trabajo busca?','Quel emploi cherchez-vous ?','Que trabalho procura?','कौन सा काम चाहिए?','找什么工作？','找什麼工作？','Какую работу ищете?','ما العمل الذي تبحث عنه؟','Ne işi arıyorsunuz?'],
    ['全部工作','All jobs','Todos los empleos','Tous les emplois','Todas as vagas','सभी नौकरियां','全部工作','全部工作','Все вакансии','كل الوظائف','Tüm işler'],
    ['想在哪里？','Where do you want to work?','¿Dónde quiere trabajar?','Où voulez-vous travailler ?','Onde quer trabalhar?','कहां काम करना चाहते हैं?','想在哪里？','想在哪裡？','Где хотите работать?','أين تريد العمل؟','Nerede çalışmak istiyorsunuz?'],
    ['全美国','All United States','Todo EE. UU.','Tous les États-Unis','Todos os EUA','पूरा अमेरिका','全美国','全美國','По всей США','كل الولايات المتحدة','Tüm ABD'],
    ['更换 ▾','Change ▾','Cambiar ▾','Changer ▾','Alterar ▾','बदलें ▾','更换 ▾','更換 ▾','Изменить ▾','تغيير ▾','Değiştir ▾'],
    ['搜索（可选）','Search (optional)','Buscar (opcional)','Recherche (facultatif)','Buscar (opcional)','खोजें (वैकल्पिक)','搜索（可选）','搜尋（選填）','Поиск (необязательно)','بحث (اختياري)','Ara (isteğe bağlı)'],
    ['职位、公司或地区；不会打字可留空','Job, company, or location; leave blank if needed','Puesto, empresa o lugar; puede dejarlo vacío','Poste, entreprise ou lieu ; peut rester vide','Cargo, empresa ou local; pode deixar vazio','पद, कंपनी या जगह; चाहें तो खाली छोड़ें','职位、公司或地区；不会打字可留空','職位、公司或地區；不會打字可留空','Должность, компания или место; можно оставить пустым','الوظيفة أو الشركة أو المكان؛ يمكن تركه فارغاً','Pozisyon, şirket veya yer; boş bırakabilirsiniz'],
    ['使用当前位置','Use current location','Usar ubicación actual','Utiliser ma position','Usar localização atual','वर्तमान स्थान इस्तेमाल करें','使用当前位置','使用目前位置','Использовать геопозицию','استخدام الموقع الحالي','Mevcut konumu kullan'],
    ['选择地区','Choose area','Elegir zona','Choisir une zone','Escolher região','क्षेत्र चुनें','选择地区','選擇地區','Выбрать район','اختيار المنطقة','Bölge seç'],
    ['选一个工作，看看哪里机会多','Choose a job to see where demand is highest','Elija un trabajo y vea dónde hay más oportunidades','Choisissez un métier pour voir où sont les opportunités','Escolha um trabalho e veja onde há mais vagas','काम चुनें और देखें अवसर कहां अधिक हैं','选一个工作，看看哪里机会多','選一個工作，看看哪裡機會多','Выберите работу и узнайте, где больше вакансий','اختر عملاً لمعرفة أين تكثر الفرص','Bir iş seçin, fırsatların nerede olduğunu görün'],
    ['选一个地区，看看这里缺什么人','Choose an area to see who is hiring','Elija una zona y vea qué puestos se necesitan','Choisissez une zone pour voir les besoins','Escolha uma região e veja quais vagas existem','क्षेत्र चुनें और देखें किन लोगों की जरूरत है','选一个地区，看看这里缺什么人','選一個地區，看看這裡缺什麼人','Выберите район и узнайте, кто нужен','اختر منطقة لمعرفة الوظائف المطلوبة','Bir bölge seçin, hangi çalışanların arandığını görün'],
    ['更多筛选（地区、类型、薪资、距离、排序）','More filters (area, type, pay, distance, sort)','Más filtros (zona, tipo, salario, distancia, orden)','Plus de filtres (lieu, type, salaire, distance, tri)','Mais filtros (região, tipo, salário, distância, ordem)','अधिक फ़िल्टर (क्षेत्र, प्रकार, वेतन, दूरी, क्रम)','更多筛选（地区、类型、薪资、距离、排序）','更多篩選（地區、類型、薪資、距離、排序）','Больше фильтров (район, тип, оплата, расстояние)','فلاتر إضافية (المنطقة، النوع، الراتب، المسافة)','Daha fazla filtre (bölge, tür, ücret, mesafe)'],
    ['类型','Type','Tipo','Type','Tipo','प्रकार','类型','類型','Тип','النوع','Tür'],
    ['全部类型','All types','Todos los tipos','Tous les types','Todos os tipos','सभी प्रकार','全部类型','全部類型','Все типы','كل الأنواع','Tüm türler'],
    ['全职','Full time','Tiempo completo','Temps plein','Tempo integral','पूर्णकालिक','全职','全職','Полная занятость','دوام كامل','Tam zamanlı'],
    ['兼职','Part time','Medio tiempo','Temps partiel','Meio período','अंशकालिक','兼职','兼職','Частичная занятость','دوام جزئي','Yarı zamanlı'],
    ['合同','Contract','Contrato','Contrat','Contrato','अनुबंध','合同','合約','Контракт','عقد','Sözleşmeli'],
    ['临时','Temporary','Temporal','Temporaire','Temporário','अस्थायी','临时','臨時','Временная','مؤقت','Geçici'],
    ['实习','Internship','Pasantía','Stage','Estágio','इंटर्नशिप','实习','實習','Стажировка','تدريب','Staj'],
    ['最低薪资','Minimum pay','Salario mínimo','Salaire minimum','Salário mínimo','न्यूनतम वेतन','最低薪资','最低薪資','Минимальная оплата','الحد الأدنى للراتب','Asgari ücret'],
    ['附近范围','Distance','Distancia','Distance','Distância','दूरी','附近范围','附近範圍','Расстояние','المسافة','Mesafe'],
    ['排序','Sort','Ordenar','Trier','Ordenar','क्रम','排序','排序','Сортировка','الترتيب','Sırala'],
    ['综合','Best match','Relevancia','Pertinence','Relevância','सर्वोत्तम मिलान','综合','綜合','По релевантности','الأفضل مطابقة','En uygun'],
    ['最新','Newest','Más reciente','Plus récent','Mais recente','नवीनतम','最新','最新','Сначала новые','الأحدث','En yeni'],
    ['薪资','Pay','Salario','Salaire','Salário','वेतन','薪资','薪資','Оплата','الراتب','Ücret'],
    ['距离','Distance','Distancia','Distance','Distância','दूरी','距离','距離','Расстояние','المسافة','Mesafe'],
    ['清除附近定位','Clear nearby location','Borrar ubicación','Effacer la position','Limpar localização','स्थान हटाएं','清除附近定位','清除附近定位','Очистить геопозицию','مسح الموقع','Konumu temizle'],
    ['正在连接正式招聘数据源…','Connecting to live job data…','Conectando con datos en vivo…','Connexion aux données en direct…','Conectando aos dados ao vivo…','लाइव नौकरी डेटा से जुड़ रहा है…','正在连接正式招聘数据源…','正在連接正式招聘資料…','Подключение к данным вакансий…','جارٍ الاتصال ببيانات الوظائف…','Canlı iş verisine bağlanıyor…'],
    ['招聘岗位','Job openings','Vacantes','Offres d’emploi','Vagas','नौकरी के अवसर','招聘岗位','招聘職位','Вакансии','فرص العمل','İş ilanları'],
    ['列表','List','Lista','Liste','Lista','सूची','列表','列表','Список','قائمة','Liste'],
    ['地图','Map','Mapa','Carte','Mapa','मानचित्र','地图','地圖','Карта','خريطة','Harita'],
    ['上一页','Previous','Anterior','Précédent','Anterior','पिछला','上一页','上一頁','Назад','السابق','Önceki'],
    ['下一页','Next','Siguiente','Suivant','Próximo','अगला','下一页','下一頁','Далее','التالي','Sonraki'],
    ['← 返回华人工作网','← Back to Huaren Jobs','← Volver a Empleos Huaren','← Retour à Emplois Huaren','← Voltar ao Huaren Jobs','← हुआरेन जॉब्स पर लौटें','← 返回华人工作网','← 返回華人工作網','← Назад в Huaren Работа','← العودة إلى وظائف هوارن','← Huaren İş’e dön'],
    ['统一账号','Unified account','Cuenta unificada','Compte unique','Conta unificada','एकीकृत खाता','统一账号','統一帳號','Единая учётная запись','حساب موحد','Birleşik hesap'],
    ['邮箱或手机号','Email or phone','Correo o teléfono','E-mail ou téléphone','E-mail ou telefone','ईमेल या फोन','邮箱或手机号','電子郵件或手機號','Email или телефон','البريد أو الهاتف','E-posta veya telefon'],
    ['密码','Password','Contraseña','Mot de passe','Senha','पासवर्ड','密码','密碼','Пароль','كلمة المرور','Şifre'],
    ['至少8位','At least 8 characters','Mínimo 8 caracteres','Au moins 8 caractères','Pelo menos 8 caracteres','कम से कम 8 अक्षर','至少8位','至少8位','Не менее 8 символов','8 أحرف على الأقل','En az 8 karakter'],
    ['登录 / 注册','Sign in / Register','Entrar / Registrarse','Connexion / Inscription','Entrar / Cadastrar','लॉगिन / रजिस्टर','登录 / 注册','登入 / 註冊','Войти / Регистрация','دخول / تسجيل','Giriş / Kayıt'],
    ['正在检查登录状态…','Checking sign-in status…','Comprobando sesión…','Vérification de la connexion…','Verificando login…','लॉगिन स्थिति जांची जा रही है…','正在检查登录状态…','正在檢查登入狀態…','Проверка входа…','جارٍ التحقق من تسجيل الدخول…','Giriş durumu kontrol ediliyor…'],
    ['招聘什么职位','Job title','Puesto','Intitulé du poste','Cargo','पद','招聘什么职位','招聘什麼職位','Название вакансии','المسمى الوظيفي','İş unvanı'],
    ['工作地区','Work location','Lugar de trabajo','Lieu de travail','Local de trabalho','काम की जगह','工作地区','工作地區','Место работы','موقع العمل','İş yeri'],
    ['工作介绍','Job description','Descripción','Description du poste','Descrição','काम का विवरण','工作介绍','工作介紹','Описание работы','وصف الوظيفة','İş açıklaması'],
    ['联系电话或邮箱','Phone or email','Teléfono o correo','Téléphone ou e-mail','Telefone ou e-mail','फोन या ईमेल','联系电话或邮箱','聯絡電話或電子郵件','Телефон или email','الهاتف أو البريد','Telefon veya e-posta'],
    ['发布岗位','Publish job','Publicar vacante','Publier l’offre','Publicar vaga','नौकरी प्रकाशित करें','发布岗位','發佈職位','Опубликовать','نشر الوظيفة','İlanı yayınla'],
    ['我的招聘','My posts','Mis anuncios','Mes annonces','Meus anúncios','मेरी पोस्ट','我的招聘','我的招聘','Мои объявления','إعلاناتي','İlanlarım'],
    ['站内信','Messages','Mensajes','Messages','Mensagens','संदेश','站内信','站內信','Сообщения','الرسائل','Mesajlar'],
    ['登录后管理','Sign in to manage','Entre para administrar','Connectez-vous pour gérer','Entre para gerenciar','प्रबंधन के लिए लॉगिन करें','登录后管理','登入後管理','Войдите для управления','سجل الدخول للإدارة','Yönetmek için giriş yap'],
    ['登录即注册，不需要邮件验证。','Signing in creates an account if needed. No email verification required.','Al iniciar sesión se crea una cuenta si hace falta. No se requiere verificación.','La connexion crée un compte si nécessaire. Aucun e-mail de validation requis.','O login cria uma conta se necessário. Sem verificação por e-mail.','जरूरत होने पर लॉगिन से खाता बन जाता है। ईमेल सत्यापन जरूरी नहीं।','登录即注册，不需要邮件验证。','登入即註冊，不需要郵件驗證。','При входе аккаунт создаётся автоматически. Подтверждение email не нужно.','يتم إنشاء الحساب عند تسجيل الدخول ولا يلزم تأكيد البريد.','Girişte gerekirse hesap oluşturulur. E-posta doğrulaması gerekmez.'],
    ['我的招聘信息','My job posts','Mis vacantes','Mes offres','Minhas vagas','मेरी नौकरी पोस्ट','我的招聘信息','我的招聘資訊','Мои вакансии','وظائفي المنشورة','İş ilanlarım'],
    ['我的求职信息','My job wanted posts','Mis búsquedas','Mes recherches','Minhas buscas','मेरी काम खोज पोस्ट','我的求职信息','我的求職資訊','Мои резюме','طلبات العمل الخاصة بي','İş arama ilanlarım'],
    ['修改招聘','Edit job','Editar vacante','Modifier l’offre','Editar vaga','नौकरी संपादित करें','修改招聘','修改招聘','Изменить вакансию','تعديل الوظيفة','İlanı düzenle'],
    ['保存修改','Save changes','Guardar cambios','Enregistrer','Salvar alterações','बदलाव सहेजें','保存修改','儲存修改','Сохранить','حفظ التغييرات','Değişiklikleri kaydet'],
    ['登录后查看消息','Sign in to view messages','Entre para ver mensajes','Connectez-vous pour voir les messages','Entre para ver mensagens','संदेश देखने के लिए लॉगिन करें','登录后查看消息','登入後查看訊息','Войдите для просмотра сообщений','سجل الدخول لعرض الرسائل','Mesajları görmek için giriş yap'],
    ['对话','Conversations','Conversaciones','Conversations','Conversas','बातचीत','对话','對話','Диалоги','المحادثات','Konuşmalar'],
    ['选择一条对话','Select a conversation','Seleccione una conversación','Choisissez une conversation','Selecione uma conversa','बातचीत चुनें','选择一条对话','選擇一條對話','Выберите диалог','اختر محادثة','Bir konuşma seçin'],
    ['关闭对话','Close conversation','Cerrar conversación','Fermer la conversation','Fechar conversa','बातचीत बंद करें','关闭对话','關閉對話','Закрыть диалог','إغلاق المحادثة','Konuşmayı kapat'],
    ['从左侧选择对话。','Select a conversation from the left.','Seleccione una conversación a la izquierda.','Choisissez une conversation à gauche.','Selecione uma conversa à esquerda.','बाईं ओर से बातचीत चुनें।','从左侧选择对话。','從左側選擇對話。','Выберите диалог слева.','اختر محادثة من اليسار.','Soldan bir konuşma seçin.'],
    ['输入站内信内容','Write a message','Escriba un mensaje','Écrivez un message','Escreva uma mensagem','संदेश लिखें','输入站内信内容','輸入站內信內容','Введите сообщение','اكتب رسالة','Mesaj yazın'],
    ['发送','Send','Enviar','Envoyer','Enviar','भेजें','发送','發送','Отправить','إرسال','Gönder'],
    ['退出','Sign out','Salir','Déconnexion','Sair','लॉगआउट','退出','登出','Выйти','تسجيل الخروج','Çıkış'],
    ['联系招聘方','Contact employer','Contactar al empleador','Contacter l’employeur','Falar com o empregador','नियोक्ता से संपर्क करें','联系招聘方','聯絡招聘方','Связаться с работодателем','التواصل مع صاحب العمل','İşverenle iletişim'],
    ['登录后发送站内信','Sign in to send a message','Entre para enviar un mensaje','Connectez-vous pour envoyer un message','Entre para enviar mensagem','संदेश भेजने के लिए लॉगिन करें','登录后发送站内信','登入後發送站內信','Войдите, чтобы написать','سجل الدخول لإرسال رسالة','Mesaj göndermek için giriş yap'],
    ['发送消息','Send message','Enviar mensaje','Envoyer le message','Enviar mensagem','संदेश भेजें','发送消息','發送訊息','Отправить сообщение','إرسال الرسالة','Mesaj gönder'],
    ['打开全部站内信','Open all messages','Abrir todos los mensajes','Ouvrir tous les messages','Abrir todas as mensagens','सभी संदेश खोलें','打开全部站内信','開啟全部站內信','Открыть все сообщения','فتح كل الرسائل','Tüm mesajları aç'],
    ['岗位正在更新','Jobs are updating','Las vacantes se están actualizando','Mise à jour des offres','Vagas em atualização','नौकरियां अपडेट हो रही हैं','岗位正在更新','職位正在更新','Вакансии обновляются','جارٍ تحديث الوظائف','İşler güncelleniyor'],
    ['更新中','Updating','Actualizando','Mise à jour','Atualizando','अपडेट हो रहा है','更新中','更新中','Обновление','جارٍ التحديث','Güncelleniyor'],
    ['拨打电话','Call','Llamar','Appeler','Ligar','कॉल करें','拨打电话','撥打電話','Позвонить','اتصال','Ara'],
    ['发短信','Text','Enviar SMS','Envoyer un SMS','Enviar SMS','टेक्स्ट करें','发短信','發簡訊','SMS','رسالة نصية','SMS'],
    ['发送邮件','Email','Enviar correo','Envoyer un e-mail','Enviar e-mail','ईमेल करें','发送邮件','發送郵件','Email','بريد إلكتروني','E-posta'],
    ['申请职位','Apply','Solicitar','Postuler','Candidatar-se','आवेदन करें','申请职位','申請職位','Откликнуться','التقديم','Başvur'],
    ['其他','Other','Otro','Autre','Outro','अन्य','其他','其他','Другое','أخرى','Diğer'],
    ['类型未注明','Type not specified','Tipo no indicado','Type non précisé','Tipo não informado','प्रकार नहीं बताया','类型未注明','類型未註明','Тип не указан','النوع غير محدد','Tür belirtilmemiş']
  ];

  const dictionaries = Object.fromEntries(locales.map((locale) => [locale, new Map()]));
  rows.forEach((row) => locales.forEach((locale) => dictionaries[locale].set(row[0], row[columns.indexOf(locale)])));
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  let translating = false;

  function normalize(raw) {
    const value = String(raw || '').trim();
    if (locales.includes(value)) return value;
    const lower = value.toLowerCase().replace('_', '-');
    if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo') || lower.includes('hant')) return 'zh-Hant';
    if (lower.startsWith('zh')) return 'zh-Hans';
    if (lower.startsWith('pt')) return 'pt-BR';
    const base = lower.split('-')[0];
    return locales.find((item) => item.toLowerCase() === base) || '';
  }

  const explicit = normalize(new URLSearchParams(location.search).get('lang'));
  const stored = (() => { try { return normalize(localStorage.getItem(storageKey)); } catch { return ''; } })();
  const browser = (navigator.languages || [navigator.language || '']).map(normalize).find(Boolean) || '';
  let locale = explicit || stored || browser || 'zh-Hans';
  if (explicit) try { localStorage.setItem(storageKey, explicit); } catch {}

  function translate(source) {
    const clean = String(source || '').replace(/\s+/g, ' ').trim();
    if (!clean || locale === 'zh-Hans') return clean;
    return dictionaries[locale].get(clean) || clean;
  }

  function translateTextNode(node) {
    if (!node.parentElement || /^(SCRIPT|STYLE|CODE|PRE|NOSCRIPT)$/.test(node.parentElement.tagName) || node.parentElement.closest('[data-i18n-skip]')) return;
    if (!textSources.has(node)) textSources.set(node, node.nodeValue || '');
    const source = textSources.get(node);
    const clean = source.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (locale === 'zh-Hans') { node.nodeValue = source; return; }
    if (!dictionaries[locale].has(clean)) return;
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    node.nodeValue = `${leading}${locale === 'zh-Hans' ? clean : translate(clean)}${trailing}`;
  }

  function translateAttributes(element) {
    const attrs = ['placeholder', 'aria-label', 'title'];
    let sources = attributeSources.get(element);
    if (!sources) { sources = {}; attributeSources.set(element, sources); }
    attrs.forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      if (!(attr in sources)) sources[attr] = element.getAttribute(attr) || '';
      const source = sources[attr];
      element.setAttribute(attr, locale === 'zh-Hans' ? source : translate(source));
    });
  }

  function translateTree(root = document.body) {
    if (!root || translating) return;
    translating = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
      if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) node.nodeType === Node.TEXT_NODE ? translateTextNode(node) : translateAttributes(node);
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
      document.body?.classList.toggle('hg-rtl', locale === 'ar');
      document.querySelectorAll('[data-hg-language-select]').forEach((select) => { select.value = locale; });
    } finally { translating = false; }
  }

  function installControl() {
    if (document.querySelector('.hg-language-control')) return;
    const control = document.createElement('label');
    control.className = 'hg-language-control';
    control.innerHTML = `<span data-hg-language-label>${translate('语言')}</span><select data-hg-language-select aria-label="${translate('语言')}">${locales.map((item) => `<option value="${item}">${labels[item]}</option>`).join('')}</select>`;
    control.querySelector('select').value = locale;
    control.querySelector('select').addEventListener('change', (event) => setLocale(event.target.value, { explicit:true }));
    const homeHeader = document.querySelector('.site-header .header-inner');
    const domainHeader = document.querySelector('.hw-domain-inner');
    const pageHeader = document.querySelector('header.top, header.head');
    const host = homeHeader || domainHeader || pageHeader;
    if (host) host.appendChild(control);
    else {
      const row = document.createElement('div'); row.className = 'hg-language-row'; row.appendChild(control);
      (document.querySelector('main.shell') || document.body).prepend(row);
    }
  }

  function setLocale(next, options = {}) {
    const normalized = normalize(next) || 'zh-Hans';
    locale = normalized;
    try { localStorage.setItem(storageKey, locale); } catch {}
    if (options.explicit) {
      const url = new URL(location.href); url.searchParams.set('lang', locale);
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    document.querySelector('[data-hg-language-label]')?.replaceChildren(document.createTextNode(translate('语言')));
    translateTree(document.body);
    window.dispatchEvent(new CustomEvent('huarengongzuo:localechange', {detail:{locale}}));
  }

  const style = document.createElement('style');
  style.textContent = `.hg-language-control{display:flex;align-items:center;gap:8px;margin-inline-start:auto;white-space:nowrap;color:#475467;font-size:13px;font-weight:750}.site-header .hg-language-control,.hw-domain-inner .hg-language-control{margin-inline-start:0}.hg-language-control select{width:auto;min-width:86px;height:40px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#101828;padding:0 30px 0 12px;font:inherit;cursor:pointer}.hg-language-control select:focus{outline:3px solid rgba(23,105,210,.15);border-color:#1769d2}.hg-language-row{display:flex;justify-content:flex-end;margin-bottom:8px}.top,.head{flex-wrap:wrap}.hg-rtl .hg-language-control select{padding:0 12px 0 30px}.hg-rtl .bubble.mine{margin-left:0;margin-right:auto}@media(max-width:820px){.site-header .header-inner{flex-wrap:wrap}.site-header .hg-language-control{order:3;margin-left:auto}.hw-domain-inner{flex-wrap:wrap}.hg-language-control span{display:none}.hg-language-control select{min-width:76px;height:36px}}`;
  document.head.appendChild(style);
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';

  const start = () => {
    installControl();
    translateTree(document.body);
    const observer = new MutationObserver((records) => {
      if (translating) return;
      records.forEach((record) => record.addedNodes.forEach((node) => translateTree(node)));
    });
    observer.observe(document.body, {childList:true,subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();

  window.HuarenJobsI18n = { get locale(){ return locale; }, supported:locales, t:translate, setLocale };
})();

(() => {
  const standaloneHost = /^(?:www\.)?asylumjudge\.com$|^(?:.+--)?asylumjudge\.netlify\.app$/i.test(location.hostname);
  const trrbColumn = /^(?:www\.)?trrb\.net$/i.test(location.hostname) && /^\/asylumjudge(?:\/|$)/i.test(location.pathname);
  const brandHost = standaloneHost || trrbColumn;
  const root = trrbColumn ? '/asylumjudge' : '';
  const routes = new Map([
    ['/immigration-judge-approval-rate/', root || '/'],
    ['/immigration-judge-approval-rate/index.html', root || '/'],
    ['/immigration-judge-approval-rate/index', root || '/'],
    ['/immigration-judge-approval-rate/courts.html', `${root}/courts`],
    ['/immigration-judge-approval-rate/courts', `${root}/courts`],
    ['/immigration-judge-approval-rate/tools.html', `${root}/tools`],
    ['/immigration-judge-approval-rate/tools', `${root}/tools`],
    ['/immigration-judge-approval-rate/states.html', `${root}/states`],
    ['/immigration-judge-approval-rate/states', `${root}/states`],
    ['/immigration-judge-approval-rate/china-dashboard.html', `${root}/nationality`],
    ['/immigration-judge-approval-rate/china-dashboard', `${root}/nationality`],
    ['/immigration-judge-approval-rate/nationality.html', `${root}/nationality`],
    ['/immigration-judge-approval-rate/nationality', `${root}/nationality`],
    ['/immigration-judge-approval-rate/compare.html', `${root}/compare`],
    ['/immigration-judge-approval-rate/compare', `${root}/compare`],
    ['/immigration-judge-approval-rate/methodology.html', `${root}/methodology`],
    ['/immigration-judge-approval-rate/methodology', `${root}/methodology`],
    ['/immigration-judge-approval-rate/detail.html', `${root}/judge`],
    ['/immigration-judge-approval-rate/detail', `${root}/judge`],
    ['/immigration-judge-approval-rate/court-detail.html', `${root}/court`],
    ['/immigration-judge-approval-rate/court-detail', `${root}/court`]
  ]);
  const supported = ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr'];
  const aliases = { zh: 'zh-Hans', 'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant', pt: 'pt-BR', 'pt-PT': 'pt-BR' };
  const localePaths = { en: 'en', es: 'es', fr: 'fr', 'pt-BR': 'pt-br', hi: 'hi', 'zh-Hans': '', 'zh-Hant': 'zh-hant', ru: 'ru', ar: 'ar', tr: 'tr' };
  const pathLocales = new Map(Object.entries(localePaths).filter(([, path]) => path).map(([key, path]) => [path, key]));
  const labels = {
    en: { uscis: 'Interview data', judges: 'Find judges', courts: 'Find courts', states: 'State data', nationality: 'Nationality approval rates', tools: 'Immigration tools', community: 'Community', language: 'Language' },
    es: { uscis: 'Datos de entrevistas', judges: 'Buscar jueces', courts: 'Buscar tribunales', states: 'Datos estatales', nationality: 'Tasas por nacionalidad', tools: 'Herramientas migratorias', community: 'Comunidad', language: 'Idioma' },
    fr: { uscis: 'Données d’entretien', judges: 'Trouver un juge', courts: 'Trouver un tribunal', states: 'Données par État', nationality: 'Taux par nationalité', tools: 'Outils d’immigration', community: 'Communauté', language: 'Langue' },
    'pt-BR': { uscis: 'Dados de entrevistas', judges: 'Buscar juízes', courts: 'Buscar tribunais', states: 'Dados estaduais', nationality: 'Taxas por nacionalidade', tools: 'Ferramentas de imigração', community: 'Comunidade', language: 'Idioma' },
    hi: { uscis: 'साक्षात्कार डेटा', judges: 'न्यायाधीश खोजें', courts: 'अदालत खोजें', states: 'राज्य डेटा', nationality: 'राष्ट्रीयता अनुमोदन दर', tools: 'आव्रजन उपकरण', community: 'समुदाय', language: 'भाषा' },
    'zh-Hans': { uscis: '查面谈', judges: '查法官', courts: '查法院', states: '各州数据', nationality: '各国国籍批准率', tools: '移民工具', community: '移民社区', language: '语言' },
    'zh-Hant': { uscis: '查面談', judges: '查法官', courts: '查法院', states: '各州數據', nationality: '各國國籍批准率', tools: '移民工具', community: '移民社區', language: '語言' },
    ru: { uscis: 'Данные интервью', judges: 'Найти судью', courts: 'Найти суд', states: 'Данные штатов', nationality: 'Одобрение по гражданству', tools: 'Иммиграционные сервисы', community: 'Сообщество', language: 'Язык' },
    ar: { uscis: 'بيانات المقابلات', judges: 'بحث القضاة', courts: 'بحث المحاكم', states: 'بيانات الولايات', nationality: 'نسب الموافقة حسب الجنسية', tools: 'أدوات الهجرة', community: 'المجتمع', language: 'اللغة' },
    tr: { uscis: 'Mülakat verileri', judges: 'Hâkim ara', courts: 'Mahkeme ara', states: 'Eyalet verileri', nationality: 'Uyruğa göre onay oranı', tools: 'Göçmenlik araçları', community: 'Topluluk', language: 'Dil' }
  };
  const toolMenuLabels = {
    en: ['All official tools', 'Court addresses', 'EOIR case lookup', 'ICE detainee locator', 'EOIR-33 address change', 'USCIS case status', 'EOIR payment portal'],
    es: ['Todas las herramientas', 'Direcciones de tribunales', 'Consulta de caso EOIR', 'Localizador de ICE', 'Cambio de dirección EOIR-33', 'Estado de caso USCIS', 'Portal de pagos EOIR'],
    fr: ['Tous les outils officiels', 'Adresses des tribunaux', 'Dossier EOIR', 'Localisateur ICE', 'Changement d’adresse EOIR-33', 'Suivi USCIS', 'Paiement EOIR'],
    'pt-BR': ['Todas as ferramentas', 'Endereços dos tribunais', 'Consulta EOIR', 'Localizador ICE', 'Mudança de endereço EOIR-33', 'Status USCIS', 'Pagamento EOIR'],
    hi: ['सभी आधिकारिक उपकरण', 'अदालत के पते', 'EOIR केस खोज', 'ICE हिरासत खोज', 'EOIR-33 पता बदलें', 'USCIS केस स्थिति', 'EOIR भुगतान'],
    'zh-Hans': ['全部官方工具', '移民法院地址', '上庭案件查询', 'ICE 查人', 'EOIR-33 更改地址', 'USCIS 案件状态', '移民法庭费用缴纳'],
    'zh-Hant': ['全部官方工具', '移民法院地址', '上庭案件查詢', 'ICE 查人', 'EOIR-33 更改地址', 'USCIS 案件狀態', '移民法庭費用繳納'],
    ru: ['Все официальные сервисы', 'Адреса судов', 'Проверка дела EOIR', 'Поиск задержанных ICE', 'Смена адреса EOIR-33', 'Статус дела USCIS', 'Платежи EOIR'],
    ar: ['كل الأدوات الرسمية', 'عناوين المحاكم', 'بحث قضية EOIR', 'محدد محتجزي ICE', 'تغيير العنوان EOIR-33', 'حالة قضية USCIS', 'دفع EOIR'],
    tr: ['Tüm resmi araçlar', 'Mahkeme adresleri', 'EOIR dava sorgusu', 'ICE tutuklu bulucu', 'EOIR-33 adres değişikliği', 'USCIS dosya durumu', 'EOIR ödeme']
  };
  const brandLabels = {
    en: { descriptor: 'U.S. immigration judge and court data', nav: 'Immigration judge data navigation', skip: 'Skip to main content', footer: 'Shared EOIR database · continuously updated' },
    es: { descriptor: 'Datos de jueces y tribunales de inmigración de EE. UU.', nav: 'Navegación de datos de jueces', skip: 'Saltar al contenido principal', footer: 'Base EOIR compartida · actualización continua' },
    fr: { descriptor: 'Données des juges et tribunaux de l’immigration aux États-Unis', nav: 'Navigation des données des juges', skip: 'Aller au contenu principal', footer: 'Base EOIR partagée · mise à jour continue' },
    'pt-BR': { descriptor: 'Dados de juízes e tribunais de imigração dos EUA', nav: 'Navegação de dados de juízes', skip: 'Ir para o conteúdo principal', footer: 'Base EOIR compartilhada · atualização contínua' },
    hi: { descriptor: 'अमेरिकी इमिग्रेशन जज और अदालत डेटा', nav: 'इमिग्रेशन जज डेटा नेविगेशन', skip: 'मुख्य सामग्री पर जाएँ', footer: 'साझा EOIR डेटाबेस · लगातार अपडेट' },
    'zh-Hans': { descriptor: '美国移民法官与法院数据', nav: '移民法官数据导航', skip: '跳到主要内容', footer: '共用 EOIR 数据库 · 持续更新' },
    'zh-Hant': { descriptor: '美國移民法官與法院資料', nav: '移民法官資料導覽', skip: '跳到主要內容', footer: '共用 EOIR 資料庫 · 持續更新' },
    ru: { descriptor: 'Данные иммиграционных судей и судов США', nav: 'Навигация по данным судей', skip: 'Перейти к основному содержанию', footer: 'Общая база EOIR · постоянно обновляется' },
    ar: { descriptor: 'بيانات قضاة ومحاكم الهجرة الأمريكية', nav: 'التنقل في بيانات القضاة', skip: 'انتقل إلى المحتوى الرئيسي', footer: 'قاعدة EOIR مشتركة · تحديث مستمر' },
    tr: { descriptor: 'ABD göçmenlik hâkimi ve mahkeme verileri', nav: 'Hâkim verisi gezinmesi', skip: 'Ana içeriğe geç', footer: 'Ortak EOIR veri tabanı · sürekli güncellenir' }
  };
  const options = '<option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="pt-BR">PT-BR</option><option value="hi">HI</option><option value="zh-Hans">简中</option><option value="zh-Hant">繁中</option><option value="ru">RU</option><option value="ar">AR</option><option value="tr">TR</option>';
  const normalizeLocale = (value) => {
    const raw = String(value || '');
    if (supported.includes(raw)) return raw;
    if (aliases[raw]) return aliases[raw];
    const base = raw.split('-')[0].toLowerCase();
    return supported.find((item) => item.toLowerCase() === base) || (base === 'pt' ? 'pt-BR' : base === 'zh' ? 'zh-Hans' : 'zh-Hans');
  };
  const storedLocale = (() => { try { return localStorage.getItem('asylumjudge-language'); } catch { return ''; } })();
  const firstPathSegment = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || '';
  let locale = normalizeLocale(pathLocales.get(firstPathSegment) || new URLSearchParams(location.search).get('lang') || storedLocale || 'zh-Hans');
  const standaloneLocaleRoot = standaloneHost && localePaths[locale] ? `/${localePaths[locale]}` : '';
  const localizedRoot = trrbColumn ? root : standaloneLocaleRoot;
  const homeLabels = { en: 'Home', es: 'Inicio', fr: 'Accueil', 'pt-BR': 'Início', hi: 'होम', 'zh-Hans': '首页', 'zh-Hant': '首頁', ru: 'Главная', ar: 'الرئيسية', tr: 'Ana sayfa' };
  const homeHref = () => trrbColumn ? '/asylumjudge/' : (localePaths[locale] ? `/${localePaths[locale]}/` : '/');
  const isHome = () => location.pathname.replace(/\/+$/, '') === homeHref().replace(/\/+$/, '');
  const routeHref = (key) => ({ home: homeHref(), uscis: '/uscis-asylum-data/', judges: (location.pathname === '/' || location.pathname === `${localizedRoot}/` ? '#judge-search' : (localizedRoot || '/')), courts: `${localizedRoot}/courts`, states: `${localizedRoot}/states`, nationality: `${localizedRoot}/nationality`, tools: `${localizedRoot}/tools`, community: '/community/' }[key]);
  const activeKey = () => /\/uscis-asylum-data(?:\/|$)/.test(location.pathname) ? 'uscis' : isHome() ? 'home' : /\/tools|tools\.html/.test(location.pathname) ? 'tools' : /\/nationality|china-dashboard/.test(location.pathname) ? 'nationality' : /\/states/.test(location.pathname) ? 'states' : /\/courts|court-detail/.test(location.pathname) ? 'courts' : 'judges';
  const toolMenuMarkup = () => {
    const items = toolMenuLabels[locale] || toolMenuLabels['zh-Hans'];
    const links = [
      [routeHref('tools'), items[0], false],
      [routeHref('courts'), items[1], false],
      ['https://acis.eoir.justice.gov/', items[2], true],
      ['https://locator.ice.gov/odls', items[3], true],
      ['https://respondentaccess.eoir.justice.gov/en/forms/', items[4], true],
      ['https://egov.uscis.gov/', items[5], true],
      ['https://epay.eoir.justice.gov/', items[6], true]
    ];
    return `<details class="nav-tools ${activeKey() === 'tools' ? 'active' : ''}"><summary data-nav-key="tools">${labels[locale].tools}</summary><div class="nav-tools-panel">${links.map(([href, label, external]) => `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}${external ? '<span aria-hidden="true">↗</span>' : ''}</a>`).join('')}</div></details>`;
  };
  const navigationMarkup = () => ['uscis', 'judges', 'courts', 'states', 'nationality'].map((key) => `<a data-nav-key="${key}" class="${activeKey() === key ? 'active' : ''}" href="${routeHref(key)}">${labels[locale][key]}</a>`).join('') + toolMenuMarkup() + `<a data-nav-key="community" href="${routeHref('community')}">${labels[locale].community}</a>`;
  const languageMarkup = (id = 'language-select') => `<label for="${id}" data-language-label>${labels[locale].language}</label><select id="${id}" aria-label="${labels[locale].language}">${options}</select>`;
  const applyNavigationLabels = () => {
    const set = labels[locale] || labels['zh-Hans'];
    const brandSet = brandLabels[locale] || brandLabels['zh-Hans'];
    document.querySelectorAll('a.brand,.judge-brand > a.asylumjudge-logo,.judge-brand > a:first-child').forEach((link) => {
      link.href = homeHref();
      link.setAttribute('aria-label', `AsylumJudge · ${homeLabels[locale]}`);
    });
    document.querySelectorAll('.asylumjudge-primary-nav,.home-nav').forEach((node) => { node.innerHTML = navigationMarkup(); });
    document.querySelectorAll('[data-nav-key]').forEach((node) => { node.textContent = set[node.dataset.navKey] || node.textContent; });
    document.querySelectorAll('[data-language-label]').forEach((node) => {
      if (node.matches('label')) {
        const textNode = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
        if (textNode) textNode.textContent = set.language;
      } else {
        node.textContent = set.language;
      }
    });
    document.querySelectorAll('#language-select,#site-language-select').forEach((select) => {
      select.value = locale;
      select.setAttribute('aria-label', set.language);
    });
    const descriptor = document.querySelector('.judge-brand > div:not(.language-control)');
    if (descriptor) descriptor.innerHTML = `<b>${brandSet.descriptor}</b><span>EOIR Immigration Court Data</span>`;
    const primaryNav = document.querySelector('.asylumjudge-primary-nav');
    if (primaryNav) primaryNav.setAttribute('aria-label', brandSet.nav);
    const skipLink = document.querySelector('.domain-skip-link');
    if (skipLink) skipLink.textContent = brandSet.skip;
    const footer = document.querySelector('.judge-footer .judge-shell');
    if (footer) footer.innerHTML = `<b>${standaloneHost ? 'AsylumJudge.com' : 'Tang Ren Daily · AsylumJudge'}</b><span>${brandSet.footer}</span>`;
    if (!window.AsylumI18n) {
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    }
  };
  const handleLanguageChange = (event) => {
    locale = normalizeLocale(event.target.value);
    try { localStorage.setItem('asylumjudge-language', locale); } catch {}
    if (window.AsylumI18n && window.AsylumI18n.locale !== locale) {
      window.AsylumI18n.setLocale(locale);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', locale);
    location.href = `${url.pathname}${url.search}${url.hash}`;
  };
  const slugify = (value) => {
    const raw = String(value || '').trim();
    const reordered = raw.includes(',') ? `${raw.split(',').slice(1).join(' ').trim()} ${raw.split(',')[0].trim()}` : raw;
    return reordered.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
  };
  const shortId = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
  window.asylumJudgeProfileUrl = (rowOrId, name = '') => {
    const row = typeof rowOrId === 'object' && rowOrId ? rowOrId : { id: rowOrId, judge_name: name };
    if (trrbColumn) return `${root}/judge?id=${encodeURIComponent(row.id || '')}`;
    return `${standaloneLocaleRoot}/judges/${slugify(row.judge_name || name)}--${shortId(row.id)}/`;
  };
  window.asylumCourtProfileUrl = (row = {}) => {
    if (trrbColumn) return `${root}/court?court=${encodeURIComponent(row.court_name || '')}&state=${encodeURIComponent(row.court_state || row.state || '')}`;
    const code = String(row.court_code || '').toLowerCase() || slugify(`${row.court_name}-${row.court_state || row.state || ''}`);
    return `${standaloneLocaleRoot}/courts/${slugify(row.court_name)}--${code}/`;
  };
  window.asylumNationalityProfileUrl = (row = {}) => {
    if (trrbColumn) return `${root}/nationality?country=${encodeURIComponent(row.nationality || '')}`;
    const code = String(row.nationality_code || '').toLowerCase();
    return `${standaloneLocaleRoot}/nationalities/${slugify(row.nationality || row.nationality_zh)}${code ? `--${code}` : ''}/`;
  };
  window.judgePagePath = (file) => brandHost ? (routes.get(`/immigration-judge-approval-rate/${file}`) || `/immigration-judge-approval-rate/${file}`) : `/immigration-judge-approval-rate/${file}`;
  if (!brandHost) return;
  document.documentElement.classList.add('asylumjudge-domain');
  const main = document.querySelector('main');
  if (main && !document.querySelector('.skip-link[href^="#"],.domain-skip-link[href^="#"]')) {
    if (!main.id) main.id = 'main-content';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    const skipLink = document.createElement('a');
    skipLink.className = 'domain-skip-link';
    skipLink.href = `#${main.id}`;
    skipLink.textContent = brandLabels[locale].skip;
    document.body.prepend(skipLink);
  }
  const canonicalPath = routes.get(location.pathname) || location.pathname;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${standaloneHost ? 'https://asylumjudge.com' : 'https://trrb.net'}${canonicalPath}`;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = canonical.href;

  const normalizeTitle = () => {
    const next = standaloneHost ? document.title.replace(/｜唐人日报/g, '｜移民法官通过率') : document.title;
    if (next !== document.title) document.title = next;
  };
  normalizeTitle();
  new MutationObserver(normalizeTitle).observe(document.querySelector('title'), { childList: true });

  const rewriteLinks = (scope = document) => scope.querySelectorAll('a[href]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), location.origin);
    if (url.origin !== location.origin) return;
    const replacement = routes.get(url.pathname);
    if (replacement) link.href = `${replacement}${url.search}${url.hash}`;
  });
  rewriteLinks();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) rewriteLinks(node.matches?.('a[href]') ? node.parentElement : node);
  }))).observe(document.body, { childList: true, subtree: true });

  const brand = document.querySelector('.judge-brand');
  if (brand) {
    const logo = brand.querySelector('a');
    if (logo) {
      logo.className = 'asylumjudge-logo';
      logo.href = homeHref();
      logo.innerHTML = '<img class="asylumjudge-lockup" src="/asylumjudge/logo.svg" alt="AsylumJudge.com">';
    }
    const descriptor = brand.querySelector(':scope > div:not(.language-control)');
    if (descriptor) descriptor.innerHTML = `<b>${brandLabels[locale].descriptor}</b><span>EOIR Immigration Court Data</span>`;
    let primaryNav = brand.querySelector('.asylumjudge-primary-nav');
    if (!primaryNav) {
      primaryNav = document.createElement('nav');
      primaryNav.className = 'asylumjudge-primary-nav';
      primaryNav.setAttribute('aria-label', brandLabels[locale].nav);
      brand.appendChild(primaryNav);
    }
    primaryNav.innerHTML = navigationMarkup();
    let control = brand.querySelector('.language-control');
    if (!control) {
      control = document.createElement('div');
      control.className = 'language-control';
      control.innerHTML = languageMarkup();
    }
    brand.appendChild(primaryNav);
    brand.appendChild(control);
    const back = brand.querySelector('.back');
    if (back) back.hidden = true;
  }

  const homeNav = document.querySelector('.home-nav');
  if (homeNav) {
    homeNav.innerHTML = navigationMarkup();
    const homeSelect = document.querySelector('#site-language-select');
    if (homeSelect) homeSelect.innerHTML = options;
  }

  document.querySelectorAll('#language-select,#site-language-select').forEach((select) => select.addEventListener('change', handleLanguageChange));
  window.addEventListener('asylumjudge:localechange', (event) => {
    locale = normalizeLocale(event.detail?.locale);
    applyNavigationLabels();
  });
  applyNavigationLabels();

  const nav = document.querySelector('.judge-nav .judge-shell');
  if (nav) nav.innerHTML = '';
  const footer = document.querySelector('.judge-footer .judge-shell');
  if (footer) footer.innerHTML = `<b>${standaloneHost ? 'AsylumJudge.com' : 'Tang Ren Daily · AsylumJudge'}</b><span>${brandLabels[locale].footer}</span>`;
})();

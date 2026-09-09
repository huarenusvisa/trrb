(() => {
  const host = location.hostname.toLowerCase();
  const standalone = host === 'asylumjudge.com' || host === 'www.asylumjudge.com' || /--asylumjudge\.netlify\.app$/.test(host);
  if (!standalone) return;

  const localePaths = { en: 'en', es: 'es', fr: 'fr', 'pt-BR': 'pt-br', hi: 'hi', 'zh-Hans': '', 'zh-Hant': 'zh-hant', ru: 'ru', ar: 'ar', tr: 'tr' };
  const pathLocales = new Set(Object.values(localePaths).filter(Boolean));
  const aliases = { zh: 'zh-Hans', 'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant', pt: 'pt-BR', 'pt-PT': 'pt-BR' };
  const supported = new Set(Object.keys(localePaths));

  function normalize(value) {
    const raw = String(value || '');
    if (supported.has(raw)) return raw;
    if (aliases[raw]) return aliases[raw];
    const base = raw.split('-')[0].toLowerCase();
    for (const key of supported) if (key.toLowerCase() === base) return key;
    if (base === 'pt') return 'pt-BR';
    if (base === 'zh') return 'zh-Hans';
    return 'zh-Hans';
  }

  function stripLocale(pathname) {
    const trailing = pathname.endsWith('/');
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length && pathLocales.has(parts[0].toLowerCase())) parts.shift();
    let path = `/${parts.join('/')}`;
    if (path === '/') return '/';
    if (trailing) path += '/';
    return path || '/';
  }

  function pathForLocale(pathname, nextLocale) {
    const bare = stripLocale(pathname);
    const normalizedBare = bare.replace(/\/+$/, '') || '/';

    if (normalizedBare === '/community') return '/community/';
    if (normalizedBare === '/methodology' && nextLocale !== 'zh-Hans') {
      const methodologyPrefix = localePaths[nextLocale] || '';
      return methodologyPrefix ? `/${methodologyPrefix}/` : '/';
    }

    if (normalizedBare === '/asylum-judge-approval-rate' || normalizedBare === '/asylum-judge-rating') {
      if (nextLocale === 'en') return '/en/asylum-judge-rating/';
      if (nextLocale === 'zh-Hans') return '/asylum-judge-approval-rate/';
      const keywordPrefix = localePaths[nextLocale] || '';
      return keywordPrefix ? `/${keywordPrefix}/` : '/';
    }

    const prefix = localePaths[nextLocale] || '';
    if (!prefix) return bare || '/';
    if (bare === '/') return `/${prefix}/`;
    return `/${prefix}${bare.startsWith('/') ? bare : `/${bare}`}`;
  }

  document.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.id !== 'language-select' && select.id !== 'site-language-select') return;

    const locale = normalize(select.value);
    try { localStorage.setItem('asylumjudge-language', locale); } catch {}

    const nextPath = pathForLocale(location.pathname, locale);
    const params = new URLSearchParams(location.search);
    params.delete('lang');
    const query = params.toString();
    const nextUrl = `${nextPath}${query ? `?${query}` : ''}${location.hash || ''}`;

    if (nextUrl === `${location.pathname}${location.search}${location.hash}`) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(nextUrl);
  }, true);
})();

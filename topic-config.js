window.TRRB_TOPIC_CONFIG={trump:{title:'特朗普实时动态'},ice:{title:'ICE执法追踪'},election:{title:'2026中期选举实时动态'}};

(function installUnifiedHomepageChannels() {
  const fallbackChannels = [
    { name: "重要新闻", slug: "important", priority: 1, enabled: true },
    { name: "热门头条", slug: "hot", priority: 2, enabled: true },
    { name: "驱逐快报", slug: "deport", priority: 3, enabled: true },
    { name: "美国时政", slug: "politics", priority: 4, enabled: true },
    { name: "美国警情", slug: "crime", priority: 5, enabled: true },
    { name: "中国官场", slug: "china", priority: 6, enabled: true },
    { name: "移民美国", slug: "immigration", priority: 7, enabled: true },
    { name: "庇护百科", slug: "asylum", priority: 8, enabled: true }
  ];

  const enforcementPattern = /\bICE\b|移民与海关执法局|移民执法|遣返|驱逐|递解|自愿离境|非法移民|逮捕.{0,8}移民|拘捕.{0,8}移民/i;

  function installHomepageStyles() {
    if (document.querySelector('link[data-trrb-home-v31="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./homepage-v31.css?v=31.3";
    link.dataset.trrbHomeV31 = "true";
    document.head.appendChild(link);
  }

  function inferArticleCategory(article) {
    const raw = String(article?.category || article?.category_name || "新闻").trim() || "新闻";
    const text = `${article?.title || ""} ${article?.excerpt || article?.summary || ""}`;

    if ((raw === "移民美国" || raw === "新闻" || raw === "ICE执法") && enforcementPattern.test(text)) {
      return "驱逐快报";
    }

    return raw;
  }

  function normalizeHomepageArticles(articles) {
    return (Array.isArray(articles) ? articles : []).map((article) => ({
      ...article,
      category: inferArticleCategory(article)
    }));
  }

  function activeNewsCategories() {
    const source = Array.isArray(window.TRRB_CHANNELS) && window.TRRB_CHANNELS.length
      ? window.TRRB_CHANNELS
      : fallbackChannels;

    return source
      .filter((channel) => channel && channel.enabled !== false && channel.slug !== "expose" && channel.name)
      .slice()
      .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))
      .map((channel) => String(channel.name || "").trim())
      .filter(Boolean)
      .filter((name, index, list) => list.indexOf(name) === index);
  }

  function canInstall() {
    return typeof window.renderCategorySection === "function"
      && typeof window.renderExposureWallCard === "function";
  }

  function installRenderer() {
    if (!canInstall()) return false;

    window.renderSections = function renderUnifiedSections(articles) {
      const normalizedArticles = normalizeHomepageArticles(articles);
      window.TRRB_LAST_HOME_ARTICLES = normalizedArticles;

      const sections = activeNewsCategories()
        .map((category) => window.renderCategorySection(category, normalizedArticles));

      sections.push(window.renderExposureWallCard());

      const root = document.querySelector("#sections-grid");
      if (root) root.innerHTML = sections.join("");
    };

    const currentArticles = Array.isArray(window.TRRB_LAST_HOME_ARTICLES)
      ? window.TRRB_LAST_HOME_ARTICLES
      : (typeof window.localArticleIndex === "function" ? window.localArticleIndex() : []);

    if (currentArticles.length) window.renderSections(currentArticles);
    return true;
  }

  function loadChannelConfig() {
    if (Array.isArray(window.TRRB_CHANNELS) && window.TRRB_CHANNELS.length) {
      installRenderer();
      return;
    }

    const existing = document.querySelector('script[data-trrb-channel-config="true"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "./config/channels.js?v=31.1";
    script.async = true;
    script.dataset.trrbChannelConfig = "true";
    script.addEventListener("load", () => installRenderer());
    script.addEventListener("error", () => {
      console.warn("TRRB channel config unavailable; using safe fallback.");
      installRenderer();
    });
    document.head.appendChild(script);
  }

  window.TRRB_inferArticleCategory = inferArticleCategory;
  installHomepageStyles();
  installRenderer();
  loadChannelConfig();
})();

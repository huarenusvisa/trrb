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
      const safeArticles = Array.isArray(articles) ? articles : [];
      window.TRRB_LAST_HOME_ARTICLES = safeArticles;

      const sections = activeNewsCategories()
        .map((category) => window.renderCategorySection(category, safeArticles));

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

  installRenderer();
  loadChannelConfig();
})();

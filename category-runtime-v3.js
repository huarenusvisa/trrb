(() => {
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const FALLBACK = Array.isArray(window.TRRB_CHANNELS) ? window.TRRB_CHANNELS : [];
  // These remain valid collection/topic routes, without separate CMS cards.
  const TOPIC_ONLY_SLUGS = new Set(["ice", "xijinping", "xi-jinping"]);

  const ROUTE_ALIASES = { ice: "/iceandpolice", "us-enforcement": "/iceandpolice", "midterm-elections": "/midterm-elections", "xi-jinping": "/xijinping", "immigration-judge-approval-rate": "https://asylumjudge.com/" };
  const listingUrl = (item) => ROUTE_ALIASES[item.slug] || `/${encodeURIComponent(String(item.slug || "").trim())}`;

  async function fetchCategories() {
    const fields = [
      "id","name","slug","sort_order","is_active","show_in_navigation","show_on_homepage","auto_fetch","ai_rewrite","auto_publish",
      "include_in_sitemap","include_in_google_news","include_in_rss","push_x","push_telegram",
      "seo_title","seo_description","seo_keywords","ai_prompt"
    ].join(",");
    const url = new URL(`${SUPABASE_URL}/rest/v1/categories`);
    url.searchParams.set("select", fields);
    url.searchParams.set("is_active", "eq.true");
    url.searchParams.set("order", "sort_order.asc,name.asc");
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`categories ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  function normalize(rows) {
    return rows.map((item) => ({
      ...item,
      priority: Number(item.sort_order ?? 999),
      enabled: item.is_active !== false,
      showInNav: item.show_in_navigation !== false && !TOPIC_ONLY_SLUGS.has(item.slug),
      showOnHome: item.show_on_homepage !== false && !TOPIC_ONLY_SLUGS.has(item.slug),
      href: listingUrl(item)
    }));
  }

  function routeKey(value) {
    try {
      const url = new URL(value, location.origin);
      const path = url.pathname.replace(/\/$/, "") || "/";
      return url.origin === location.origin ? path : url.origin + path;
    } catch {
      return String(value || "").replace(/\/$/, "") || "/";
    }
  }

  // The eight public destinations mirror the homepage cards, including products
  // which have no article-category row in the CMS.
  const PUBLIC_NAVIGATION = [
    {name:"中国热门头条",slug:"hot-headlines",href:"/hot-headlines"},
    {name:"美国时政",slug:"us-politics",href:"/us-politics"},
    {name:"ICE执法与警情",slug:"iceandpolice",href:"/iceandpolice"},
    {name:"中国政治",slug:"china-politics",href:"/china-politics"},
    {name:"移民法官通过率",slug:"immigration-judge-approval-rate",href:"https://asylumjudge.com/"},
    {name:"美国判例与新规",slug:"legal",href:"/legal/"},
    {name:"招聘求职",slug:"jobs",href:"https://huarengongzuo.com/"},
    {name:"移民社区",slug:"community",href:"/community/"}
  ];
  function publicNavigation(channels) {
    return PUBLIC_NAVIGATION.map((entry,index) => ({...channels.find(row=>row.slug===entry.slug),...entry,priority:index+1,showInNav:true}));
  }
  function renderNavigation(channels) {
    channels = publicNavigation(channels);
    const nav = document.querySelector("#site-navigation .nav-inner");
    if (!nav) return;

    nav.querySelectorAll(":scope > a").forEach(node => node.remove());
    const anchor = nav.querySelector(".nav-search, .mobile-utility-links");
    channels.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.name;
      link.dataset.dynamicCategory = item.slug;
      nav.insertBefore(link, anchor || null);
    });
  }

  function renderFooter(channels) {
    channels = publicNavigation(channels);
    const heading = [...document.querySelectorAll("footer h3")].find((node) => node.textContent.trim() === "栏目导航");
    const section = heading?.parentElement;
    if (!section) return;
    section.querySelectorAll("a").forEach((node) => node.remove());
    channels.filter((item) => item.showInNav).slice(0, 8).forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.name;
      section.appendChild(link);
    });
  }

  function applySeo(channels) {
    const path = location.pathname.replace(/^\/+|\/+$/g, "");
    const active = channels.find((item) => item.slug === path);
    if (!active) return;
    if (active.seo_title) document.title = active.seo_title;
    if (active.seo_description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = active.seo_description;
    }
    if (active.seo_keywords) {
      let keywords = document.querySelector('meta[name="keywords"]');
      if (!keywords) {
        keywords = document.createElement("meta");
        keywords.name = "keywords";
        document.head.appendChild(keywords);
      }
      keywords.content = active.seo_keywords;
    }
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(active.href, "https://trrb.net").href;
  }

  function publish(channels) {
    window.TRRB_CATEGORIES = channels;
    window.TRRB_CHANNELS = channels.filter((item) => item.showOnHome).map((item) => ({
      name: item.name,
      slug: item.slug,
      priority: item.priority,
      enabled: item.enabled,
      href: item.href
    }));
    renderNavigation(channels);
    renderFooter(channels);
    applySeo(channels);
    window.dispatchEvent(new CustomEvent("trrb:categories-ready", { detail: { categories: channels } }));
  }

  fetchCategories().then((rows) => {
    if (!rows.length) throw new Error("empty categories");
    publish(normalize(rows));
  }).catch((error) => {
    console.warn("TRRB category CMS unavailable, using static fallback:", error);
    const fallback = FALLBACK.map((item, index) => ({
      ...item,
      priority: Number(item.priority ?? index + 1),
      enabled: item.enabled !== false,
      showInNav: item.show_in_navigation !== false && !TOPIC_ONLY_SLUGS.has(item.slug),
      showOnHome: item.show_on_homepage !== false && !TOPIC_ONLY_SLUGS.has(item.slug),
      href: item.slug ? listingUrl(item) : `./listing.html?category=${encodeURIComponent(item.name)}`
    }));
    publish(fallback);
  });
})();

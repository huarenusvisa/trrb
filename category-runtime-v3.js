(() => {
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const FALLBACK = Array.isArray(window.TRRB_CHANNELS) ? window.TRRB_CHANNELS : [];

  const listingUrl = (item) => `/${encodeURIComponent(String(item.slug || "").trim())}`;

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
      showInNav: item.show_in_navigation !== false,
      showOnHome: item.show_on_homepage !== false,
      href: listingUrl(item)
    }));
  }

  function renderNavigation(channels) {
    const nav = document.querySelector("#site-navigation .nav-inner");
    if (!nav) return;
    nav.querySelectorAll("a[data-dynamic-category]").forEach((node) => node.remove());
    nav.querySelectorAll(":scope > a:not(.nav-expose-link)").forEach((node) => node.remove());
    const anchor = nav.querySelector(".nav-expose-link");
    channels.filter((item) => item.showInNav).forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.name;
      link.dataset.dynamicCategory = item.slug;
      nav.insertBefore(link, anchor || null);
    });
  }

  function renderFooter(channels) {
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
    canonical.href = `https://www.trrb.net/${encodeURIComponent(active.slug)}`;
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
      showInNav: true,
      showOnHome: true,
      href: item.slug ? `/${encodeURIComponent(item.slug)}` : `./listing.html?category=${encodeURIComponent(item.name)}`
    }));
    publish(fallback);
  });
})();
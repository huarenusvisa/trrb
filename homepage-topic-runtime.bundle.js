/* TRRB homepage topic runtime bundle. Generated from ordered production modules; keep source order stable. */
/* bundled source: category-runtime-v3.js */
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

  function routeKey(value) {
    try {
      const url = new URL(value, location.origin);
      return url.pathname.replace(/\/$/, "") || "/";
    } catch {
      return String(value || "").replace(/\/$/, "") || "/";
    }
  }

  function renderNavigation(channels) {
    const nav = document.querySelector("#site-navigation .nav-inner");
    if (!nav) return;

    // Only remove links that this runtime created on a previous pass. Static
    // independent products such as /jobs/, /niulai/ or /legal/ must survive a
    // category refresh even though they are not rows in the categories table.
    nav.querySelectorAll("a[data-dynamic-category]").forEach((node) => node.remove());

    const anchor = nav.querySelector(".nav-expose-link");
    const existing = Array.from(nav.querySelectorAll(":scope > a:not(.nav-expose-link)"));

    channels.filter((item) => item.showInNav).forEach((item) => {
      const desiredRoute = routeKey(item.href);
      const match = existing.find((node) =>
        node.textContent.trim() === String(item.name || "").trim() || routeKey(node.getAttribute("href") || "") === desiredRoute
      );

      if (match) {
        // Correct stale static aliases (for example /immigrate/ used as the old
        // 移民美国 nav target) without deleting unrelated standalone entries.
        match.href = item.href;
        match.textContent = item.name;
        return;
      }

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
    canonical.href = `https://trrb.net/${encodeURIComponent(active.slug)}`;
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


/* bundled source: topic-config.js */
window.TRRB_TOPIC_CONFIG={trump:{title:'特朗普实时动态'},ice:{title:'ICE执法追踪'},election:{title:'2026中期选举实时动态'}};

(function installUnifiedHomepageChannels() {
  const fallbackChannels = [
    { name: "重要新闻", slug: "important", priority: 1, enabled: true },
    { name: "热门头条", displayName: "中国热门头条", slug: "hot", priority: 2, enabled: true },
    { name: "驱逐快报", slug: "deport", priority: 3, enabled: true },
    { name: "美国时政", slug: "politics", priority: 4, enabled: true },
    { name: "美国警情", slug: "crime", priority: 5, enabled: true },
    { name: "中国官场", slug: "china", priority: 6, enabled: true },
    { name: "移民美国", slug: "immigration", priority: 7, enabled: true },
    { name: "庇护百科", slug: "asylum", priority: 8, enabled: true }
  ];
  const enforcementPattern = /\bICE\b|移民与海关执法局|移民执法|遣返|驱逐|递解|自愿离境|非法移民|逮捕.{0,8}移民|拘捕.{0,8}移民/i;

  function installHomepageStyles(){if(document.querySelector('link[data-trrb-home-v31="true"]'))return;const link=document.createElement("link");link.rel="stylesheet";link.href="./homepage-v31.css?v=31.3";link.dataset.trrbHomeV31="true";document.head.appendChild(link);}
  function installFocusHero(){if(document.querySelector('script[data-trrb-focus-hero="34"]'))return;const script=document.createElement("script");script.src="./homepage-focus-v34.js?v=34.0";script.dataset.trrbFocusHero="34";document.body.appendChild(script);}
  function inferArticleCategory(article){const raw=String(article?.category||article?.category_name||"新闻").trim()||"新闻";const text=`${article?.title||""} ${article?.excerpt||article?.summary||""}`;if((raw==="移民美国"||raw==="新闻"||raw==="ICE执法")&&enforcementPattern.test(text))return "驱逐快报";return raw;}
  function normalizeHomepageArticles(articles){return(Array.isArray(articles)?articles:[]).map(article=>({...article,category:inferArticleCategory(article)}));}
  function activeNewsCategories(){const source=Array.isArray(window.TRRB_CHANNELS)&&window.TRRB_CHANNELS.length?window.TRRB_CHANNELS:fallbackChannels;return source.filter(channel=>channel&&channel.enabled!==false&&channel.slug!=="expose"&&channel.name).slice().sort((a,b)=>Number(a.priority||999)-Number(b.priority||999)).map(channel=>String(channel.name||"").trim()).filter(Boolean).filter((name,index,list)=>list.indexOf(name)===index);}
  function canInstall(){return typeof window.renderCategorySection==="function"&&typeof window.renderExposureWallCard==="function";}
  function installRenderer(){if(!canInstall())return false;window.renderSections=function renderUnifiedSections(articles){const normalized=normalizeHomepageArticles(articles);window.TRRB_LAST_HOME_ARTICLES=normalized;const sections=activeNewsCategories().map(category=>window.renderCategorySection(category,normalized));sections.push(window.renderExposureWallCard());const root=document.querySelector("#sections-grid");if(root)root.innerHTML=sections.join("");};const current=Array.isArray(window.TRRB_LAST_HOME_ARTICLES)?window.TRRB_LAST_HOME_ARTICLES:(typeof window.localArticleIndex==="function"?window.localArticleIndex():[]);if(current.length)window.renderSections(current);return true;}
  function loadChannelConfig(){if(Array.isArray(window.TRRB_CHANNELS)&&window.TRRB_CHANNELS.length){installRenderer();return;}const existing=document.querySelector('script[data-trrb-channel-config="true"]');if(existing)return;const script=document.createElement("script");script.src="./config/channels.js?v=31.1";script.async=true;script.dataset.trrbChannelConfig="true";script.addEventListener("load",()=>installRenderer());script.addEventListener("error",()=>installRenderer());document.head.appendChild(script);}

  window.TRRB_inferArticleCategory=inferArticleCategory;
  window.addEventListener("trrb:categories-ready",()=>installRenderer());
  installHomepageStyles();installRenderer();loadChannelConfig();installFocusHero();
})();


/* bundled source: trump-parser.js */
function generateTrumpTitle(content){const a=[['签署','签署'],['宣布','宣布'],['下令','下令'],['要求','要求'],['批准','批准'],['制裁','制裁'],['回应','回应']];const e=['移民','ICE','边境','关税','伊朗','乌克兰','俄罗斯','中国','经济','美联储','降息','军队'];let ac='',ev='';for(const x of a){if(content.includes(x[0])){ac=x[1];break}}for(const x of e){if(content.includes(x)){ev=x;break}}return ac&&ev?`特朗普${ac}${ev}`:'特朗普回应具体事件';}

/* bundled source: ice-parser.js */
/**
 * ICE 实时执法过滤器
 * v36
 *
 * 规则：
 * 只显示网站上线之后的数据
 * 历史数据全部忽略
 */


async function filterICEData(data){


    let config;


    try{

        const response =
        await fetch(
            "/data/ice-config.json?v="+Date.now()
        );


        config =
        await response.json();


    }catch(error){


        console.warn(
            "ICE config missing",
            error
        );


        return [];


    }



    const startTime =
    new Date(
        config.startTime
    );



    const result =
    data.filter(item=>{


        const itemTime =
        new Date(

            item.created_at ||
            item.time ||
            item.date ||
            0

        );



        return (
            itemTime >= startTime
        );


    });



    return result;


}



/**
 * ICE统计
 */

function getICEStats(data){


    const now =
    new Date();



    const today =
    new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );



    const todayData =
    data.filter(item=>{


        const t =
        new Date(
            item.time ||
            item.created_at ||
            item.date
        );


        return t>=today;


    });



    return {


        people:
        todayData.reduce(
            (sum,item)=>{

                return sum +
                Number(
                    item.arrests ||
                    item.people ||
                    0
                );

            },
            0
        ),



        locations:
        [
            ...new Set(
                todayData
                .map(
                    x=>x.location
                )
                .filter(Boolean)
            )
        ].length,



        newsCount:
        todayData.length



    };


}



/**
 * ICE新闻过滤
 */

function filterICEArticle(article){


    return filterICEData(
        [article]
    )
    .then(
        result=>
        result.length>0
    );


}


/* bundled source: election-parser.js */
function generateElectionTitle(content){

if(!content){
return "2026中期选举最新选情变化";
}


const states=[
["宾州","宾州选情"],
["佐治亚","佐治亚选情"],
["亚利桑那","亚利桑那选情"],
["密歇根","密歇根选情"],
["威斯康星","威斯康星选情"],
["内华达","内华达选情"]
];


const actions=[
["领先","支持率变化"],
["民调","民调出现变化"],
["竞选","竞选争夺升级"],
["翻转","席位争夺升温"],
["支持","阵营支持变化"]
];


let state="";


for(const s of states){

if(content.includes(s[0])){
state=s[1];
break;
}

}



for(const a of actions){

if(content.includes(a[0])){

return `${state || "中期选举"}${a[1]}`;

}

}



if(content.includes("共和党")){

return "共和党关键州争夺升级";

}



if(content.includes("民主党")){

return "民主党调整中期选举策略";

}



return "2026中期选举竞争升温";

}


/* bundled source: topic-feed.js */
(() => {
  "use strict";
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function shortTitle(title, max = 26) {
    const text = String(title || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  async function fetchLatestTopic(topic) {
    const select = "id,title,content,topic_key,published_at,created_at,status";
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", select);
    url.searchParams.set("topic_key", `eq.${topic}`);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { cache: "no-store", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function loadFallback() {
    try {
      const response = await fetch(`/data/topic-feed.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  function render(topic, item) {
    document.querySelectorAll(`[data-topic-latest="${topic}"]`).forEach((box) => {
      if (!item) {
        box.textContent = "暂无最新动态";
        return;
      }
      let title = item.title || item.content || "暂无最新动态";
      if (topic === "ice") title = shortTitle(title, 18);
      else title = shortTitle(title, 28);
      box.innerHTML = `<div class="topic-update"><strong>${escapeHtml(title)}</strong></div>`;
    });
  }

  function syncFinanceCard() {
    document.querySelectorAll('.topic-finance .topic-latest').forEach((box) => {
      box.textContent = '新闻｜自选｜行情｜基金｜我的';
    });
    document.querySelectorAll('.topic-finance .topic-focus-copy > p').forEach((box) => {
      box.textContent = '财经新闻 · 自选行情 · ETF基金 · 投资研究';
    });
  }

  async function loadTopicFeed() {
    syncFinanceCard();
    const fallback = await loadFallback();
    await Promise.all(["trump", "ice"].map(async (topic) => {
      try {
        const live = await fetchLatestTopic(topic);
        render(topic, live || fallback.find((item) => item?.topic === topic));
      } catch (error) {
        console.warn(`${topic} topic feed unavailable`, error);
        render(topic, fallback.find((item) => item?.topic === topic));
      }
    }));
    render("election", fallback.find((item) => item?.topic === "election"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadTopicFeed, { once: true });
  else loadTopicFeed();
})();


/* bundled source: homepage-startup-stability.js */
(() => {
  "use strict";

  const html = document.documentElement;
  let finalized = false;
  let recoveryAttempted = false;

  function heroReady() {
    const hero = document.querySelector("#hero");
    if (!hero) return false;
    if (hero.querySelector(".hero-slide")) return true;
    return Boolean(String(hero.textContent || "").trim());
  }

  function rankReady() {
    const rank = document.querySelector("#rank-list");
    if (!rank) return false;
    return rank.querySelectorAll("li").length > 0 || Boolean(String(rank.textContent || "").trim());
  }

  function sectionsReady() {
    const root = document.querySelector("#sections-grid");
    const hot = root?.querySelector("#hot");
    return Boolean(root?.children?.length && hot && !hot.classList.contains("category-empty") && hot.querySelector(".section-lead"));
  }

  function repairLegacyEmptyHeroOnce() {
    if (recoveryAttempted) return false;
    const hero = document.querySelector("#hero");
    if (!hero || !hero.querySelector(".hero-focus-empty")) return false;

    const source = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    if (!source.length || typeof window.renderHeroCarousel !== "function") return false;

    const visual = source.filter((item) => {
      if (typeof window.hasRealImage === "function") return window.hasRealImage(item);
      return Boolean(String(item?.image || item?.cover_image || "").trim());
    });
    const candidates = (visual.length ? visual : source)
      .filter((item) => String(item?.category || item?.category_name || "").trim() === "美国时政")
      .filter((item) => {
        const body = Array.isArray(item?.body) ? item.body.join("") : "";
        return body.replace(/\s+/g, "").length >= 1500;
      })
      .slice(0, 5);
    if (!candidates.length) return false;

    recoveryAttempted = true;
    window.renderHeroCarousel(candidates);
    hero.dataset.recommendationMode = "us-politics-longform-recovery";
    hero.dataset.recommendationCount = String(candidates.length);
    hero.dataset.focusOnly = "false";
    hero.dataset.focusCount = "0";
    return true;
  }

  function finalize(force = false) {
    if (finalized) return;
    if (!force && !(heroReady() && rankReady() && sectionsReady() &&
      html.dataset.homeEnhancementsStable === "true")) return;
    finalized = true;
    html.dataset.homeFinalUi = "true";
    html.dataset.homeFinalUiAt = new Date().toISOString();
  }

  function check() {
    finalize(false);
    return finalized;
  }

  function start() {
    // This guard is intentionally passive. CSS owns section order; normal data
    // rendering is owned by articles-home.js. Do not mutate the DOM in response
    // to every mutation or run repeated repair loops.
    [120, 320, 700, 1100].forEach((delay) => {
      window.setTimeout(() => {
        if (!finalized) check();
      }, delay);
    });

    // The primary renderer and enhancement pass must finish before reveal.
    // Do not rebuild the hero on a timer: that caused visible mobile jumps.
    window.setTimeout(() => finalize(false), 1800);

    // Safety watchdog only. It reveals the existing DOM without rebuilding it.
    window.setTimeout(() => finalize(true), 4200);

    window.addEventListener("pageshow", () => finalize(true));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();


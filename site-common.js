(function () {
  const CATEGORY_PLACEHOLDERS = {
    "重要新闻": "./assets/category-placeholders/important.svg",
    "热门头条": "./assets/category-placeholders/hot.svg",
    "驱逐快报": "./assets/category-placeholders/deport.svg",
    "美国时政": "./assets/category-placeholders/politics.svg",
    "美国警情": "./assets/category-placeholders/crime.svg",
    "中国官场": "./assets/category-placeholders/china.svg",
    "移民美国": "./assets/category-placeholders/immigration.svg",
    "庇护百科": "./assets/category-placeholders/asylum.svg",
    "深度专题": "./assets/category-placeholders/deep.svg",
    "default": "./assets/category-placeholders/generic.svg"
  };

  function categoryPlaceholder(category) {
    return CATEGORY_PLACEHOLDERS[category] || CATEGORY_PLACEHOLDERS.default;
  }

  function normalizeImageUrl(value, category) {
    let text = String(value || "").replace(/\\u0026/g, "&").trim();
    if (!text || text.includes("image-placeholder.svg")) return categoryPlaceholder(category);
    if (/^(?:javascript|vbscript):/i.test(text)) return categoryPlaceholder(category);
    if (text.startsWith("//")) text = "https:" + text;
    if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, "https://");
    if (text.startsWith("/assets/news-images/")) return "." + text;
    if (text.startsWith("assets/news-images/")) return "./" + text;
    text = text.replace(/^https?:\/\/(?:www\.)?(?:new\.)?trrb\.net\/wp-content\/uploads\//i, "./assets/news-images/");
    return text;
  }

  function weatherInfo(code) {
    const map = {
      0: ["☀️", "晴"], 1: ["🌤️", "晴间多云"], 2: ["⛅", "多云"], 3: ["☁️", "阴"],
      45: ["🌫️", "有雾"], 48: ["🌫️", "雾凇"], 51: ["🌦️", "毛毛雨"], 53: ["🌦️", "小雨"],
      55: ["🌦️", "细雨"], 61: ["🌧️", "小雨"], 63: ["🌧️", "中雨"], 65: ["🌧️", "大雨"],
      71: ["🌨️", "小雪"], 73: ["🌨️", "中雪"], 75: ["❄️", "大雪"], 80: ["🌧️", "阵雨"],
      81: ["🌧️", "阵雨"], 82: ["⛈️", "强阵雨"], 95: ["⛈️", "雷暴"], 96: ["⛈️", "雷暴夹冰雹"],
      99: ["⛈️", "强雷暴"]
    };
    return map[code] || ["🌤️", "天气"];
  }

  function formatDate(date, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short", timeZone }).formatToParts(date);
      const get = (type) => (parts.find((item) => item.type === type) || {}).value || "";
      return `${get("month")}月${get("day")}日 ${get("weekday")}`;
    } catch {
      return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
    }
  }

  function normalizeLocationName(loc) {
    if (!loc) return "本地";
    const raw = String(loc);
    const mapping = {
      "new york": "纽约", "los angeles": "洛杉矶", "san francisco": "旧金山", "flushing": "法拉盛",
      "queens": "皇后区", "brooklyn": "布鲁克林", "manhattan": "曼哈顿", "boston": "波士顿",
      "chicago": "芝加哥", "miami": "迈阿密", "houston": "休斯敦", "seattle": "西雅图",
      "washington": "华盛顿", "atlanta": "亚特兰大", "philadelphia": "费城", "dallas": "达拉斯"
    };
    return mapping[raw.toLowerCase()] || raw;
  }

  async function fetchJsonWithTimeout(url, timeout) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout || 4500) : null;
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller ? controller.signal : undefined });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function updateTopbar() {
    const locationEl = document.querySelector(".meta-location");
    const dateEl = document.querySelector(".meta-date");
    const weatherEl = document.querySelector(".meta-weather");
    if (!locationEl || !dateEl || !weatherEl) return;

    const fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    const state = { city: "本地", timeZone: fallbackTimeZone };
    const renderDate = () => { dateEl.textContent = formatDate(new Date(), state.timeZone || fallbackTimeZone); };

    locationEl.textContent = `📍 ${state.city}`;
    weatherEl.textContent = "🌤️ 天气暂不可用";
    renderDate();
    setInterval(renderDate, 60000);

    try {
      const geo = await fetchJsonWithTimeout("https://ipwho.is/", 4200);
      if (!geo || geo.success === false) return;
      state.city = normalizeLocationName(geo.city || geo.region || geo.country || "本地");
      if (geo.timezone && geo.timezone.id) state.timeZone = geo.timezone.id;
      locationEl.textContent = `📍 ${state.city}`;
      renderDate();
      if (typeof geo.latitude !== "number" || typeof geo.longitude !== "number") return;

      try {
        const weather = await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`, 4200);
        const current = weather && weather.current;
        if (!current) return;
        const temperature = Math.round(Number(current.temperature_2m));
        const [icon, label] = weatherInfo(current.weather_code);
        weatherEl.textContent = `${icon} ${temperature}°C ${label}`;
      } catch {
        weatherEl.textContent = "🌤️ 天气暂不可用";
      }
    } catch {
      weatherEl.textContent = "🌤️ 天气暂不可用";
    }
  }

  function initMobileNavigation() {
    const body = document.body;
    const nav = document.querySelector("#site-navigation");
    const menuButton = document.querySelector(".mobile-menu-toggle");
    const searchButton = document.querySelector(".mobile-search-toggle");
    const closeButton = document.querySelector(".mobile-nav-close");
    const backdrop = document.querySelector(".mobile-nav-backdrop");
    const searchInput = nav && nav.querySelector('input[type="search"]');
    if (!nav || !menuButton) return;

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let historyEntryAdded = false;

    function setExpanded(expanded) {
      menuButton.setAttribute("aria-expanded", String(expanded));
      nav.setAttribute("aria-hidden", mobileQuery.matches ? String(!expanded) : "false");
    }

    function openMenu(focusSearch) {
      if (!mobileQuery.matches) {
        if (focusSearch) window.location.href = "./listing.html?type=search";
        return;
      }
      if (body.classList.contains("mobile-nav-open")) {
        if (focusSearch && searchInput) searchInput.focus();
        return;
      }
      body.classList.add("mobile-nav-open");
      setExpanded(true);
      if (!history.state || !history.state.trrbMobileNav) {
        history.pushState(Object.assign({}, history.state || {}, { trrbMobileNav: true }), "", window.location.href);
        historyEntryAdded = true;
      }
      window.setTimeout(() => (focusSearch && searchInput ? searchInput : closeButton || nav).focus(), 180);
    }

    function closeMenu(useHistory) {
      if (!body.classList.contains("mobile-nav-open")) return;
      body.classList.remove("mobile-nav-open");
      setExpanded(false);
      menuButton.focus({ preventScroll: true });
      if (useHistory !== false && historyEntryAdded && history.state && history.state.trrbMobileNav) {
        historyEntryAdded = false;
        history.back();
      } else {
        historyEntryAdded = false;
      }
    }

    menuButton.addEventListener("click", () => openMenu(false));
    if (searchButton) searchButton.addEventListener("click", () => openMenu(true));
    if (closeButton) closeButton.addEventListener("click", () => closeMenu(true));
    if (backdrop) backdrop.addEventListener("click", () => closeMenu(true));
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a") && mobileQuery.matches) closeMenu(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu(true);
    });
    window.addEventListener("popstate", () => {
      if (body.classList.contains("mobile-nav-open")) {
        historyEntryAdded = false;
        body.classList.remove("mobile-nav-open");
        setExpanded(false);
      }
    });
    const handleBreakpoint = () => {
      if (!mobileQuery.matches) {
        body.classList.remove("mobile-nav-open");
        historyEntryAdded = false;
      }
      setExpanded(body.classList.contains("mobile-nav-open"));
    };
    if (typeof mobileQuery.addEventListener === "function") mobileQuery.addEventListener("change", handleBreakpoint);
    else if (typeof mobileQuery.addListener === "function") mobileQuery.addListener(handleBreakpoint);
    handleBreakpoint();
  }

  window.TRRB_getImageUrl = normalizeImageUrl;
  window.TRRB_categoryPlaceholder = categoryPlaceholder;
  window.TRRB_updateTopbar = updateTopbar;
  document.addEventListener("DOMContentLoaded", () => {
    updateTopbar();
    initMobileNavigation();
  }, { once: true });
})();

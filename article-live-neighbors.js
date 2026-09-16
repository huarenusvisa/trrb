(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SECTIONS = {
    "重要新闻": "important-news",
    "热门头条": "hot-headlines",
    "中国热门头条": "hot-headlines",
    "美国时政": "us-politics",
    "美国警情": "us-crime",
    "中国官场": "china-officialdom",
    "移民美国": "immigration",
    "庇护百科": "asylum",
    "驱逐快报": "deport",
    "ICE执法动态": "ice",
    "ICE执法": "ice"
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function imageUrl(value, category) {
    let url = String(value || "").trim();
    if (!url || url.includes("image-placeholder.svg") || /^(?:javascript|vbscript):/i.test(url)) return "";
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, "https://");
    if (typeof window.TRRB_getImageUrl === "function") {
      const resolved = String(window.TRRB_getImageUrl(url, category || "") || "").trim();
      if (resolved) return resolved;
    }
    return url;
  }

  function articleHref(article) {
    if (!article) return "/";
    if (typeof window.TRRB_articleUrl === "function") {
      const routed = window.TRRB_articleUrl(article.category_name === "中国热门头条"
        ? { ...article, category_name: "热门头条" } : article);
      if (routed) return routed;
    }
    const slug = String(article.slug || "").trim();
    const id = String(article.id || "").trim();
    const topic = String(article.topic_key || "").trim().toLowerCase();
    const category = String(article.category_name || "").trim();
    const section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : (SECTIONS[category] || "news");
    if (slug) return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
    if (UUID_RE.test(id)) return `/${encodeURIComponent(section)}/${encodeURIComponent(id)}`;
    return id ? `/article.html?id=${encodeURIComponent(id)}` : "/";
  }

  function neighborHtml(article, label, title) {
    if (!article) return "";
    return `<a class="article-neighbor" href="${esc(articleHref(article))}"><span>${label}</span><strong>${title}：${esc(article.title)}</strong></a>`;
  }

  function relatedHtml(article) {
    const category = article.category_name || "新闻";
    const image = imageUrl(article.cover_image, category);
    const fallback = typeof window.TRRB_categoryPlaceholder === "function"
      ? window.TRRB_categoryPlaceholder(category)
      : "/image-placeholder.svg";
    return `<a class="related-item${image ? "" : " has-no-image"}" href="${esc(articleHref(article))}">${image ? `<img src="${esc(image)}" width="500" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback="${esc(fallback)}" onerror="if(!this.dataset.fallbackTried&&this.dataset.fallback){this.dataset.fallbackTried='1';this.src=this.dataset.fallback;}else{this.remove()}" alt="" />` : ""}<span>${esc(category)}</span><strong>${esc(article.title || "")}</strong></a>`;
  }

  async function api(path) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`recommendations ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows.filter((row) => row?.id && row?.title) : [];
  }

  async function fetchCurrent(id) {
    const fields = "id,title,slug,summary,category_id,category_name,topic_key,cover_image,published_at,created_at";
    const rows = await api(`select=${encodeURIComponent(fields)}&id=eq.${encodeURIComponent(id)}&${PUBLIC_FILTER}&limit=1`);
    return rows[0] || null;
  }

  const PUBLIC_FILTER = "status=eq.published&visibility=eq.public&hidden_at=is.null&archived_at=is.null";
  const FIELDS = "id,title,slug,summary,category_id,category_name,topic_key,cover_image,published_at,created_at";
  async function fetchPublished(limit = 180, extra = "") {
    return api(`select=${encodeURIComponent(FIELDS)}&${PUBLIC_FILTER}&order=published_at.desc.nullslast,created_at.desc&limit=${limit}${extra}`);
  }

  function timestamp(article) {
    const value = article?.published_at || article?.created_at || "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  function safeUrl(value, base = location.href) {
    try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; }
  }

  // Copy only readable article markup, never scripts, event handlers or page IDs.
  function readableCopy(source, base) {
    const allowed = new Set("P DIV SPAN BR STRONG EM B I H2 H3 H4 BLOCKQUOTE UL OL LI FIGURE FIGCAPTION A IMG TABLE THEAD TBODY TR TH TD PRE CODE HR".split(" "));
    const blocked = new Set("SCRIPT STYLE IFRAME OBJECT EMBED FORM INPUT BUTTON SVG MATH LINK META NOSCRIPT".split(" "));
    function copy(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      if (node.nodeType !== 1 || blocked.has(node.tagName)) return document.createDocumentFragment();
      const element = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
      if (node.tagName === "A") {
        const href = safeUrl(node.getAttribute("href") || "", base);
        if (href) { element.href = href; element.rel = "noopener noreferrer"; }
      }
      if (node.tagName === "IMG") {
        const src = safeUrl(node.getAttribute("src") || "", base);
        if (!src) return document.createDocumentFragment();
        element.src = src; element.alt = node.getAttribute("alt") || "";
        element.loading = "lazy"; element.decoding = "async";
        element.addEventListener("error", () => element.remove(), { once: true });
      }
      for (const child of node.childNodes) element.append(copy(child));
      return element;
    }
    return copy(source);
  }

  async function publicStory(article) {
    const url = new URL(articleHref(article), location.origin);
    if (url.origin !== location.origin) throw new Error("文章网址无效");
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if ([404, 410].includes(response.status)) return null;
    if (!response.ok) throw new Error("正文暂时加载失败");
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const articleRoot = doc.querySelector("#article-root");
    const body = articleRoot?.querySelector(".article-body");
    const canonical = safeUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute("href"), response.url);
    if (!body?.textContent.trim() || !canonical || new URL(canonical).origin !== location.origin
        || articleRoot.dataset.articleId !== String(article.id)) return null;
    return { doc, body, canonical };
  }

  function appendStory(container, item, story) {
    const { article, reason } = item;
    const section = document.createElement("article");
    section.className = "continued-article";
    section.dataset.articleId = article.id;
    const sourceRoot = story.doc.querySelector("#article-root");
    const title = sourceRoot.querySelector("h1")?.textContent || article.title;
    const meta = sourceRoot.querySelector(".story-meta")?.textContent || "";
    const date = timestamp(article), old = date && Date.now() - date > 30 * 86400000;
    section.innerHTML = `<header class="continued-header"><p class="continued-reason">${esc(reason)}${old ? " · 往期报道" : ""}</p><h2><a href="${esc(story.canonical)}">${esc(title)}</a></h2><p class="continued-meta">${esc(meta)}</p></header>`;
    const cover = sourceRoot.querySelector(".article-image");
    if (cover?.getAttribute("src")) {
      const img = document.createElement("img");
      const src = safeUrl(cover.getAttribute("src"), story.canonical);
      if (src) { img.src = src; img.alt = title; img.className = "continued-image"; img.loading = "lazy"; img.decoding = "async"; img.addEventListener("error", () => img.remove(), { once: true }); section.append(img); }
    }
    const warning = sourceRoot.querySelector(".article-content-warning");
    if (warning) { const aside = document.createElement("aside"); aside.className = "article-content-warning"; aside.textContent = warning.textContent; section.append(aside); }
    const body = document.createElement("div"); body.className = "continued-body";
    body.append(readableCopy(story.body, story.canonical)); section.append(body);
    const actions = document.createElement("div"); actions.className = "continued-actions";
    const open = document.createElement("a"); open.href = story.canonical; open.textContent = "单独打开这篇报道";
    const share = document.createElement("button"); share.type = "button"; share.textContent = "分享这篇";
    share.addEventListener("click", async () => {
      try {
        if (navigator.share) await navigator.share({ title, url: story.canonical });
        else if (navigator.clipboard) { await navigator.clipboard.writeText(story.canonical); share.textContent = "链接已复制"; }
        else share.textContent = "请打开报道后分享";
      } catch (error) { if (error.name !== "AbortError") share.textContent = "请打开报道后分享"; }
    });
    actions.append(open, share); section.append(actions); container.append(section);
  }

  async function repair() {
    const root = document.querySelector("#article-root");
    const queryId = new URLSearchParams(location.search).get("id") || "";
    const id = String(root?.dataset.articleId || queryId || "").trim();
    const nav = root?.querySelector(".article-neighbors");
    const relatedSection = root?.querySelector(".related-news");
    const track = root?.querySelector(".related-track");
    if (!root || !nav || !relatedSection || !track) return;
    root.dataset.relatedOwner = "continuous";
    const engine = await import("/article-related-ranking.mjs?v=20260916-editorial-1");
    let embedded = null;
    try { embedded = JSON.parse(document.querySelector("#trrb-prerendered-article")?.textContent || "null"); } catch {}
    const [current, latest] = await Promise.all([
      embedded || (UUID_RE.test(id) ? fetchCurrent(id) : Promise.resolve({ id: id || location.pathname, title: root.querySelector("h1")?.textContent || "", summary: root.querySelector(".article-body")?.textContent?.slice(0, 500) || "" })),
      fetchPublished()
    ]);
    if (!current) return;

    const merged = latest.some((item) => String(item.id) === id) ? latest.slice() : latest.concat(current);
    merged.sort((a, b) => timestamp(b) - timestamp(a));

    const index = merged.findIndex((item) => String(item.id) === id);
    const previous = index > 0 ? merged[index - 1] : null;
    const next = index >= 0 && index < merged.length - 1 ? merged[index + 1] : null;

    const neighborMarkup = `${neighborHtml(previous, "PREVIOUS", "上一篇")}${neighborHtml(next, "NEXT", "下一篇")}`;
    nav.innerHTML = neighborMarkup;
    nav.hidden = !neighborMarkup;

    // Search the archive as well as recent headlines so older event coverage is discoverable.
    const searches = await Promise.allSettled(engine.searchTerms(current).map(term => {
      const safe = term.replace(/[^\p{L}\p{N}-]/gu, "");
      return fetchPublished(60, `&or=${encodeURIComponent(`(title.ilike.*${safe}*,summary.ilike.*${safe}*)`)}`);
    }));
    let pool = latest.concat(searches.flatMap(result => result.status === "fulfilled" ? result.value : []));
    const seen = new Set([String(current.id)]), displayedTitles = new Set([engine.plain(current.title)]);
    let last = current, busy = false, offset = 180, archivePages = 0, exhausted = latest.length < 180;
    relatedSection.classList.add("continuous-reading");
    relatedSection.querySelector("h2").textContent = "接着读相关报道";
    track.className = "related-reading-links";
    track.setAttribute("aria-label", "相关报道独立链接");
    const directory = document.createElement("details"); directory.className = "related-reading-directory";
    const directoryTitle = document.createElement("summary"); directoryTitle.textContent = "查看相关报道目录";
    directory.append(directoryTitle); track.parentElement.replaceWith(directory); directory.append(track);
    const stream = document.createElement("div"); stream.className = "related-reading-stream";
    const footer = document.createElement("div"); footer.className = "related-reading-footer";
    const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = "往下滑，继续阅读相关报道";
    const more = document.createElement("button"); more.type = "button"; more.textContent = "继续阅读";
    footer.append(status, more); relatedSection.insertBefore(stream, directory); relatedSection.append(footer); relatedSection.hidden = false;
    // Continue with article content immediately after the entry story.
    relatedSection.after(nav);
    function ranked() { return engine.rankRelated(current, pool, { seen: [...seen], last, limit: 24 }).filter(item => !displayedTitles.has(engine.plain(item.article.title))); }
    function links() {
      track.innerHTML = ranked().slice(0, 4).map(({ article }) => `<a href="${esc(articleHref(article))}">${esc(article.title)}</a>`).join("");
    }
    links();
    async function extendPool() {
      if (exhausted || archivePages >= 3) return;
      const rows = await fetchPublished(180, `&offset=${offset}`);
      offset += 180; archivePages++; exhausted = rows.length < 180; pool = pool.concat(rows);
    }
    async function loadNext() {
      if (busy || more.hidden) return;
      busy = true; more.disabled = true; footer.setAttribute("aria-busy", "true"); status.textContent = "正在加载相关报道…";
      try {
        let choices = ranked();
        while (!choices.length && !exhausted && archivePages < 3) { await extendPool(); choices = ranked(); }
        while (choices.length) {
          const item = choices[0], story = await publicStory(item.article);
          seen.add(String(item.article.id));
          if (story) {
            appendStory(stream, item, story); displayedTitles.add(engine.plain(item.article.title)); last = item.article;
            status.textContent = "往下滑，继续阅读相关报道"; more.textContent = "继续阅读"; links(); return;
          }
          choices = ranked();
        }
        status.textContent = "你已读完本次找到的相关报道。"; more.hidden = true; observer?.disconnect(); links();
      } catch {
        status.textContent = "暂时无法加载，请点击重试。"; more.textContent = "重试加载";
      } finally { busy = false; more.disabled = false; footer.removeAttribute("aria-busy"); }
    }
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && more.textContent !== "重试加载") loadNext();
    }, { rootMargin: "450px 0px" }) : null;
    more.addEventListener("click", loadNext); observer?.observe(footer);
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const ready = document.querySelector("#article-root .article-neighbors") && document.querySelector("#article-root .related-track");
    if (!ready && attempts < 50) return;
    clearInterval(timer);
    if (ready) repair().catch((error) => console.warn("Live article recommendations unavailable", error));
  }, 120);
})();

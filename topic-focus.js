(function () {
  "use strict";

  const TOPICS = [
    {
      key: "trump",
      title: "特朗普实时动态",
      subtitle: "每30分钟自动检查更新",
      badge: "实时追踪",
      link: "./listing.html?q=" + encodeURIComponent("特朗普"),
      keywords: ["特朗普", "川普", "trump", "白宫", "总统"],
      icon: "TRUMP"
    },
    {
      key: "ice",
      title: "ICE执法",
      subtitle: "执法行动与法律应对",
      badge: "自动更新",
      link: "/topic/ice/",
      keywords: ["ice", "移民执法", "拘留", "驱逐", "遣返", "海关执法"],
      icon: "ICE"
    },
    {
      key: "election",
      title: "2026中期选举实时动态",
      subtitle: "选情变化与关键州追踪",
      badge: "实时更新",
      link: "./listing.html?q=" + encodeURIComponent("中期选举"),
      keywords: ["中期选举", "2026选举", "国会选举", "参议院", "众议院", "选情"],
      icon: "✓"
    }
  ];

  function hasImage(article) {
    const image = String((article && article.image) || "").trim();
    return Boolean(image) && !/placeholder|category-placeholders/i.test(image);
  }

  function imageUrl(article) {
    if (typeof window.TRRB_getImageUrl === "function") {
      return window.TRRB_getImageUrl(article.image || "", article.category || "");
    }
    const image = String(article.image || "").trim();
    if (image.startsWith("/assets/")) return "." + image;
    return image;
  }

  function searchText(article) {
    return [article && article.title, article && article.excerpt, article && article.category]
      .filter(Boolean).join(" ").toLowerCase();
  }

  function topicArticles(topic, articles) {
    return articles.filter(function (article) {
      const text = searchText(article);
      return topic.keywords.some(function (keyword) {
        return text.includes(keyword.toLowerCase());
      });
    });
  }

  function shortTitle(value) {
    const clean = String(value || "最新动态持续更新")
      .replace(/[\s\n\r]+/g, "")
      .replace(/[，。！？、；：,.!?;:]/g, "");
    if (clean.length < 8) return (clean + "最新消息持续更新").slice(0, 18);
    return clean.slice(0, 18);
  }

  function summary(value) {
    const clean = String(value || "最新公开信息正在持续整理与更新。")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ").trim();
    return clean.slice(0, 52) || "最新公开信息正在持续整理与更新。";
  }

  function esc(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function articleLink(article, fallback) {
    if (!article || article.id == null) return fallback;
    return "./article.html?id=" + encodeURIComponent(article.id);
  }

  function renderNews(topic, article) {
    if (!article) {
      return '<div class="topic-story topic-story-text"><div><h4>最新动态持续更新</h4><p>系统正在汇总最新公开信息。</p></div></div>';
    }

    if (hasImage(article)) {
      return '<div class="topic-story topic-story-image">' +
        '<img src="' + esc(imageUrl(article)) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest(\'.topic-story\').classList.add(\'image-failed\');this.remove()">' +
        '<div><h4>' + esc(article.title) + '</h4><p>' + esc(summary(article.excerpt)) + '</p></div>' +
      '</div>';
    }

    return '<div class="topic-story topic-story-text"><div><h4>' + esc(shortTitle(article.title)) + '</h4><p>' + esc(summary(article.excerpt)) + '</p></div></div>';
  }

  function renderCard(topic, matches) {
    const article = matches[0] || null;
    const count = matches.length;
    return '<article class="topic-card topic-' + topic.key + '">' +
      '<a class="topic-card-link" href="' + esc(topic.link) + '">' +
        '<div class="topic-card-visual" aria-hidden="true"><span>' + esc(topic.icon) + '</span></div>' +
        '<div class="topic-card-main">' +
          '<h3>' + esc(topic.title) + '</h3>' +
          '<p class="topic-subtitle">' + esc(topic.subtitle) + '</p>' +
          '<div class="topic-status"><span class="topic-live-dot"></span><span>' + esc(topic.badge) + '</span>' +
            (topic.key === "ice" ? '<strong>今日 ' + count + ' 条</strong>' : '') +
          '</div>' +
          '<a class="topic-article-link" href="' + esc(articleLink(article, topic.link)) + '">' + renderNews(topic, article) + '</a>' +
        '</div>' +
      '</a>' +
    '</article>';
  }

  window.TRRB_renderTopicFocus = function (articles) {
    const root = document.querySelector("#topic-focus-list");
    if (!root || !Array.isArray(articles)) return;
    root.innerHTML = TOPICS.map(function (topic) {
      return renderCard(topic, topicArticles(topic, articles));
    }).join("");
  };
})();

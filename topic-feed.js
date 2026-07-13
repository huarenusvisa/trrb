async function loadTopicFeed() {
  let data = [];

  try {
    const response = await fetch(
      "/data/topic-feed.json?v=" + Date.now(),
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        "Topic feed HTTP error: " + response.status
      );
    }

    const result = await response.json();

    data = Array.isArray(result)
      ? result
      : [];
  } catch (error) {
    console.warn(
      "topic feed loading error",
      error
    );
  }

  window.TRRB_TOPIC_DATA = data;

  renderTopicLatest(data);
}

function renderTopicLatest(data) {
  document
    .querySelectorAll("[data-topic-latest]")
    .forEach(function (box) {
      const topic =
        box.dataset.topicLatest;

      const item =
        data.find(function (entry) {
          return (
            entry &&
            entry.topic === topic
          );
        });

      if (!item) {
        box.textContent =
          "暂无最新动态";

        return;
      }

      let title =
        item.title ||
        item.content ||
        "暂无最新动态";

      /*
       * 特朗普：
       * 特朗普 + 动作 + 具体事件
       */
      if (
        topic === "trump" &&
        typeof window.generateTrumpTitle === "function"
      ) {
        title =
          window.generateTrumpTitle(
            item.content ||
            item.title ||
            ""
          );
      }

      /*
       * 中期选举
       */
      if (
        topic === "election" &&
        typeof window.generateElectionTitle === "function"
      ) {
        title =
          window.generateElectionTitle(
            item.content ||
            item.title ||
            ""
          );
      }

      /*
       * ICE：
       * 只显示8—18字标题
       */
      if (topic === "ice") {
        title =
          shortTopicTitle(
            item.title ||
            "ICE执法行动",
            18
          );
      }

      /*
       * 只输出最新标题。
       * 不输出摘要、时间、来源和图片。
       */
      box.innerHTML =
        '<div class="topic-update">' +
          "<strong>" +
            escapeTopicHtml(title) +
          "</strong>" +
        "</div>";
    });
}

function shortTopicTitle(
  title,
  maxLength
) {
  const text =
    String(title || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(
    0,
    maxLength
  );
}

function escapeTopicHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener(
  "DOMContentLoaded",
  loadTopicFeed
);

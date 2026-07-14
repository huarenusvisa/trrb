function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

const STOP = new Set([
  "the","and","for","with","from","that","this","was","were","has","have","into","after","before","about","their","they","them","his","her","its","who","what","when","where","will","official","officials","said","says","according","department","agency","news","today",
  "一个","一名","有关","相关","已经","正在","表示","指出","消息","报道","记者","目前","此次","进行","以及","其中","美国","新闻","发布","通报","当地","人员","事件"
]);

function normalized(value) {
  return safeText(value, 60000)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9_]+/gi, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(value, limit = 30) {
  const scores = new Map();
  const add = (token, score) => {
    const word = String(token || "").trim();
    if (!word || STOP.has(word) || /^\d+$/.test(word) || word.length < 2 || word.length > 28) return;
    scores.set(word, (scores.get(word) || 0) + score);
  };
  const text = normalized(value);
  (text.match(/[a-z][a-z0-9'-]{2,}/g) || []).forEach((word) => add(word, word.length >= 7 ? 4 : 2));
  for (const run of text.match(/[\u3400-\u9fff]{2,24}/g) || []) {
    if (run.length <= 8) add(run, 6);
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) add(run.slice(index, index + size), size);
    }
  }
  return new Set([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word));
}

function sameEvent(a, b) {
  const left = normalized(a.text);
  const right = normalized(b.text);
  if (left.length >= 80 && right.length >= 80 && (left.includes(right) || right.includes(left))) return true;
  if (a.event_type && b.event_type && a.event_type !== "other" && b.event_type !== "other" && a.event_type !== b.event_type) return false;
  if (a.state_code && b.state_code && a.state_code !== b.state_code) return false;
  if (a.event_date && b.event_date && a.event_date !== b.event_date) return false;
  const common = [...a.words].filter((word) => b.words.has(word)).length;
  const union = new Set([...a.words, ...b.words]).size || 1;
  return common >= 5 && common / union >= 0.42;
}

function firstSentence(value, max = 72) {
  const clean = safeText(value, 5000).replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  const first = clean.split(/(?<=[。！？.!?])\s*/)[0] || clean || "ICE候选新闻待审核";
  const chars = Array.from(first);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : first;
}

function summary(value, max = 260) {
  const clean = safeText(value, 10000).replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : clean;
}

function mediaUrl(post) {
  for (const item of Array.isArray(post?.media) ? post.media : []) {
    if (item?.type === "photo" && item.url) return item.url;
    if (item?.preview_image_url) return item.preview_image_url;
    if (item?.url) return item.url;
  }
  return "";
}

function priority(story) {
  return ({ published: 600, approved: 500, pending_review: 400, pending_corroboration: 300, collecting: 200 }[story.status] || 0)
    + Number(story.official_source_count || 0) * 20 + Number(Boolean(story.cover_image)) * 5;
}

function prepareStories(stories, postsByFingerprint) {
  const prepared = stories.map((story) => {
    const post = postsByFingerprint.get(String(story.event_fingerprint || "")) || {};
    const raw = safeText(post.source_text || story.content || story.summary || story.title, 30000);
    const text = [story.title, story.summary, story.content, raw].filter(Boolean).join(" ");
    return {
      ...story,
      original_status: story.status,
      status: story.status === "collecting" ? "pending_review" : story.status,
      human_review_status: story.status === "collecting" ? "required" : story.human_review_status,
      title: safeText(story.title, 220) || firstSentence(raw),
      summary: safeText(story.summary, 1200) || summary(raw),
      content: safeText(story.content, 30000) || raw,
      cover_image: safeText(story.cover_image, 3000) || mediaUrl(post),
      source_preview: raw,
      source_username: post.source_username || "",
      source_created_at: post.source_created_at || story.last_seen_at || "",
      _dedupe: {
        text,
        words: keywords(text),
        event_type: story.event_type || post.event_type || "other",
        event_date: post.event_date || "",
        state_code: post.state_code || ""
      }
    };
  });

  const output = [];
  for (const item of prepared) {
    const duplicate = output.find((candidate) => sameEvent(candidate._dedupe, item._dedupe));
    if (!duplicate) {
      item.duplicate_count = 0;
      output.push(item);
      continue;
    }
    if (priority(item) > priority(duplicate)) {
      item.duplicate_count = Number(duplicate.duplicate_count || 0) + 1;
      output.splice(output.indexOf(duplicate), 1, item);
    } else {
      duplicate.duplicate_count = Number(duplicate.duplicate_count || 0) + 1;
    }
  }

  return output.map(({ _dedupe, ...story }) => story);
}

module.exports = { prepareStories, keywords, sameEvent, firstSentence, summary };

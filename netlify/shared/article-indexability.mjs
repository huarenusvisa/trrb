// Article length is an editorial choice, not an indexing requirement.
// Publication/visibility, category and duplicate checks remain with callers.
export const ARTICLE_INDEXABILITY_POLICY = 'nonempty-content-v1';

export function visibleArticleText(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point = code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&(?:nbsp|ensp|emsp|thinsp|ZeroWidthSpace);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function articleIndexability(article) {
  const title = visibleArticleText(article?.title);
  const body = visibleArticleText(article?.content) || visibleArticleText(article?.summary);
  const reasons = [];
  if (!title) reasons.push('missing-title');
  if (!body) reasons.push('missing-body');
  return { indexable: reasons.length === 0, title, body, reasons };
}

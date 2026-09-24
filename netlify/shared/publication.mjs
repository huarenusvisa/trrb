// Shared by Edge and build workers. Only the database pins this path.
export function publicationUrl(article, origin = 'https://trrb.net') {
  const path = article?.publication_path;
  if (typeof path !== 'string' || !/^\/[^/?#]+\/[^/?#]+$/.test(path) || /[\\\s]/.test(path)) return '';
  try { const u = new URL(path, origin); return u.origin === origin && u.pathname === path ? u.href : ''; } catch { return ''; }
}
export function publicEvidence(article) {
  const values = [article?.source_url, ...(Array.isArray(article?.metadata?.evidence) ? article.metadata.evidence.map(x => x?.url) : [])];
  return [...new Set(values.flatMap(value => {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password && !/(^|\.)(trrb\.net|trrb\.cc|tangrenribao\.com)$/.test(u.hostname) ? [u.href] : []; } catch { return []; }
  }))].slice(0, 10);
}

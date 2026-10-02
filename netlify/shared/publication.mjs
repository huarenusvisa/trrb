// Shared by Edge and build workers. Only the database pins this path.
export function publicationUrl(article, origin = 'https://trrb.net') {
  const path = article?.publication_path;
  if (typeof path !== 'string' || !/^\/[^/?#]+\/[^/?#]+$/.test(path) || /[\\\s]/.test(path)) return '';
  try { const u = new URL(path, origin); return u.origin === origin && u.pathname === path ? u.href : ''; } catch { return ''; }
}
export function publicEvidence(article) {
  const values = [article?.source_url, ...(Array.isArray(article?.metadata?.source_links) ? article.metadata.source_links.map(x => typeof x === 'string' ? x : x?.url) : []), ...(Array.isArray(article?.metadata?.evidence) ? article.metadata.evidence.map(x => x?.url) : [])];
  return [...new Set(values.flatMap(value => {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password && !/\/(?:whyyoutouzhele)(?:\/|$)/i.test(u.pathname) && !/(^|\.)(trrb\.net|trrb\.cc|tangrenribao\.com)$/.test(u.hostname) ? [u.href] : []; } catch { return []; }
  }))].slice(0, 10);
}

const PUBLIC_METADATA_KEYS=['unverified_public_claim','content_warning','editorial_depth','body_character_count','editorial_policy_version','editorial_standard_version','publication_scope','homepage_focus_override','category_display_name','editorial_topics','person_topic','publication_mode','text_only_verified'];
export function publicArticleData(article) {
 if(!article || typeof article!=='object')return article;
 const metadata=Object.fromEntries(PUBLIC_METADATA_KEYS.filter(k=>article.metadata?.[k]!==undefined).map(k=>[k,article.metadata[k]]));
 // Collection provenance and correction backups belong only in editorial storage.
 const copy={...article,metadata};
 if(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/whyyoutouzhele(?:\/|$)/i.test(copy.source_url || ''))copy.source_url='';
 return copy;
}

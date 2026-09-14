export function canonicalHref(html) {
  return (String(html || '').match(/<link\b[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)/i)?.[1]
    || String(html || '').match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'][^"']*canonical/i)?.[1]
    || '').replace(/&amp;|&#0*38;|&#x0*26;/gi, '&').trim();
}

export function hasNoindex(html, headers = {}) {
  const header = Object.entries(headers).find(([name]) => name.toLowerCase() === 'x-robots-tag')?.[1] || '';
  if (/\b(?:noindex|none)\b/i.test(header)) return true;
  return (String(html || '').match(/<meta\b[^>]*>/gi) || []).some((tag) => {
    const name = tag.match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    return /^(?:robots|googlebot|bingbot)$/i.test(name.trim()) && /\b(?:noindex|none)\b/i.test(content);
  });
}

// Length is not an indexing requirement: a complete short news item can pass.
export function livePageBlockingIssues({ url, status, title, description, h1, missingAlt = 0, canonical, noindex }) {
  const issues = [];
  if (status !== 200) issues.push(`HTTP ${status}`);
  if (!String(title || '').trim()) issues.push('title missing');
  if (!String(description || '').trim()) issues.push('description missing');
  if (!String(h1 || '').trim()) issues.push('H1 missing');
  if (missingAlt) issues.push(`${missingAlt} image(s) missing alt`);
  if (noindex) issues.push('noindex');
  let canonicalMatches = false;
  if (canonical) {
    try { canonicalMatches = new URL(canonical, url).href === new URL(url).href; } catch { /* Invalid canonical is blocking. */ }
  }
  if (!canonicalMatches) issues.push(`canonical mismatch: ${canonical || 'missing'}`);
  return issues;
}

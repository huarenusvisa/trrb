// Narrow cross-language incident anchors. These identify events, not people to ban.
// New outcomes still enter the existing reviewed update path at the original URL.
function text(row) {
  const p=row?.ai_payload||row?.metadata||{};
  return [row?.source_text,p.lead_source_text_original,row?.title,row?.summary,row?.content]
    .filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
}
export function coveredIncident(row) {
  const t=text(row), date=String(row?.event_date||row?.ai_payload?.event_date||'').slice(0,10);
  if ((!date||date==='2026-11-19') && /princeton|普林斯顿/.test(t) &&
      /eva\s+yi\s+xie|谢怡(?:毅)?|谢翌/.test(t) && /ice|拘留|拘押/.test(t)) return 'princeton-xie-detention-20261119';
  if ((!date||date==='2026-11-21') && /seattle|西雅图/.test(t) &&
      /airport|机场/.test(t) && /ice|移民执法/.test(t) &&
      /1306|larrondo|hernandez|阿拉斯加航空|alaska airlines/.test(t)) return 'seatac-flight1306-20261121';
  return '';
}
export function sameCoveredIncident(a,b) {
  const key=coveredIncident(a);
  return Boolean(key && key===coveredIncident(b));
}

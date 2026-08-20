export type NewsCategory = { key: string; label: string; aliases: string[] };

export const NEWS_CATEGORIES: NewsCategory[] = [
  { key: 'america', label: '美国重磅', aliases: ['美国重磅', '美国', '美国时政'] },
  { key: 'china', label: '中国热点', aliases: ['中国热点', '中国'] },
  { key: 'ice', label: 'ICE执法', aliases: ['ICE执法', 'ICE执法追踪', 'ICE'] },
  { key: 'politics', label: '美国时政', aliases: ['美国时政'] },
  { key: 'police', label: '警情', aliases: ['警情'] },
  { key: 'officials', label: '中国官场', aliases: ['中国官场'] },
  { key: 'eb5', label: 'EB-5', aliases: ['EB-5', 'EB5'] }
];

export function resolveCategoryLabel(input?: string | null) {
  const value = String(input || '').trim();
  if (!value) return null;
  // Retired top-level category: preserve legacy data compatibility without exposing it in navigation.
  if (value === '庇护百科') return '移民美国';
  return NEWS_CATEGORIES.find((item) => item.key === value || item.aliases.includes(value))?.label || value;
}

import type { NewsArticle } from '../api/trrb';

export function globalHomepageEligible(item: NewsArticle, now = Date.now()): boolean {
  const date = Date.parse(item.published_at || item.created_at || '');
  return item.publication_scope !== 'topic_only' && Number.isFinite(date)
    && date <= now && now - date <= 96 * 3600000;
}

export function importantHomepageEligible(item: NewsArticle, now = Date.now()): boolean {
  return globalHomepageEligible(item, now)
    && item.editorial_policy_version === 'body-cjk-1500-v1'
    && Number(item.body_character_count) >= 1500;
}

export function homepageSectionMatches(item: NewsArticle, key: string, aliases: readonly string[]): boolean {
  if (key === 'china-politics') return item.editorial_topics?.includes('china-politics') === true;
  if (key === 'us-enforcement' && item.topic_key === 'ice') return true;
  return aliases.includes(String(item.category_name || '').trim());
}

import type { ArticleHeadlineTranslation, NewsArticle } from '../api/trrb';

export type ReviewedTranslationMap = Record<string, ArticleHeadlineTranslation>;

export function indexReviewedTranslations(rows: ArticleHeadlineTranslation[], locale: string): ReviewedTranslationMap {
  if (locale !== 'en' && locale !== 'zh-TW') return {};
  return rows.reduce<ReviewedTranslationMap>((result, row) => {
    if (row.locale === locale && row.title.trim() && row.reviewed_at.trim()) {
      result[String(row.article_id)] = row;
    }
    return result;
  }, {});
}

export function reviewedNewsTitle(article: NewsArticle, translations: ReviewedTranslationMap): string {
  return translations[String(article.id)]?.title || article.title;
}

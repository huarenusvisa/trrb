import { useEffect, useMemo, useRef, useState } from 'react';
import type { NewsArticle } from '../api/trrb';
import { fetchArticleTranslations } from '../api/trrb';
import { indexReviewedTranslations, type ReviewedTranslationMap } from '../news/reviewed-translations-core';
import { readCachedArticleTranslation, removeCachedArticleTranslation } from '../storage/articleTranslationCache';

const MAX_TRANSLATED_NEWS_ITEMS = 40;

export function useReviewedNewsTranslations(items: NewsArticle[], locale: string): ReviewedTranslationMap {
  const ids = useMemo(() => [...new Set(items.map((item) => String(item.id)).filter(Boolean))].slice(0, MAX_TRANSLATED_NEWS_ITEMS), [items]);
  const requestKey = `${locale}:${ids.join(',')}`;
  const requestVersion = useRef(0);
  const [translations, setTranslations] = useState<ReviewedTranslationMap>({});

  useEffect(() => {
    const version = ++requestVersion.current;
    if ((locale !== 'en' && locale !== 'zh-TW') || !ids.length) {
      setTranslations({});
      return;
    }

    void (async () => {
      const cachedRows = (await Promise.all(ids.map((id) => readCachedArticleTranslation(id, locale).catch(() => null)))).filter((row) => row !== null);
      if (version !== requestVersion.current) return;
      setTranslations(indexReviewedTranslations(cachedRows, locale));

      try {
        const rows = await fetchArticleTranslations(ids, locale);
        if (version !== requestVersion.current) return;
        const next = indexReviewedTranslations(rows, locale);
        setTranslations(next);
        const returned = new Set(Object.keys(next));
        await Promise.all(ids.filter((id) => !returned.has(id)).map((id) => removeCachedArticleTranslation(id, locale).catch(() => undefined)));
      } catch {
        // A network failure keeps any recent reviewed translations restored above.
      }
    })();

    return () => { requestVersion.current += 1; };
  }, [requestKey]);

  return translations;
}

import { useLocalSearchParams } from 'expo-router';
import { PaginatedNewsList } from '../../src/components/PaginatedNewsList';
import { useI18n } from '../../src/i18n/I18nProvider';
import { newsCategoryName } from '../../src/i18n/i18n-core';

export default function CategoryScreen() {
  const { locale, t } = useI18n();
  const { name } = useLocalSearchParams<{ name: string }>();
  const category = decodeURIComponent(String(name || ''));
  const title = newsCategoryName(locale, category);
  return <PaginatedNewsList title={category ? title : t('news.categoryPage')} category={category} />;
}

import { useLocalSearchParams } from 'expo-router';
import { PaginatedNewsList } from '../../src/components/PaginatedNewsList';

export default function CategoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const category = decodeURIComponent(String(name || ''));
  const title = category === '热门头条' ? '中国热门头条' : category;
  return <PaginatedNewsList title={title || '新闻栏目'} category={category} />;
}

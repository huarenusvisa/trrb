import { useLocalSearchParams } from 'expo-router';
import { PaginatedNewsList } from '../../src/components/PaginatedNewsList';

export default function CategoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const category = decodeURIComponent(String(name || ''));
  return <PaginatedNewsList title={category || '新闻栏目'} category={category} />;
}

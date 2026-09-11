import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';
import { unreadBadgeValue } from '../../src/notifications/unread-core';

type TabIconProps = {
  activeName: SymbolViewProps['name'];
  color: ColorValue;
  focused: boolean;
  name: SymbolViewProps['name'];
  size: number;
};

const TabIcon = ({ activeName, color, focused, name, size }: TabIconProps) => (
  <SymbolView name={focused ? activeName : name} size={size} tintColor={color} weight="semibold" />
);

const LegalTabIcon = ({ color, size }: { color: ColorValue; size: number }) => (
  <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>{'⚖︎'}</Text>
);

export default function TabLayout() {
  const { t } = useI18n();
  const unread = useUnreadCounts();
  const insets = useSafeAreaInsets();
  const profileBadge = unreadBadgeValue(unread);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#c8211e',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: { height: 72 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 10), paddingTop: 8 },
        tabBarItemStyle: { minHeight: 54 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' }
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarButtonTestID: 'tab-home', tabBarIcon: ({ color, focused, size }) => <TabIcon name={{ ios: 'house', android: 'home', web: 'home' }} activeName={{ ios: 'house.fill', android: 'home_filled', web: 'home_filled' }} color={color} focused={focused} size={size} /> }} />
      <Tabs.Screen name="america" options={{ title: t('tab.america'), tabBarButtonTestID: 'tab-america', tabBarIcon: ({ color, focused, size }) => <TabIcon name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} activeName={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} color={color} focused={focused} size={size} /> }} />
      <Tabs.Screen name="immigration" options={{ title: t('tab.immigration'), tabBarButtonTestID: 'tab-immigration', tabBarIcon: ({ color, focused, size }) => <TabIcon name={{ ios: 'briefcase', android: 'business_center', web: 'business_center' }} activeName={{ ios: 'briefcase.fill', android: 'business_center', web: 'business_center' }} color={color} focused={focused} size={size} /> }} />
      <Tabs.Screen name="legal" options={{ title: t('tab.legal'), tabBarButtonTestID: 'tab-legal', tabBarIcon: ({ color, size }) => <LegalTabIcon color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tab.profile'), tabBarButtonTestID: 'tab-profile', tabBarBadge: profileBadge, tabBarBadgeStyle: { backgroundColor: '#c8211e', color: '#fff' }, tabBarIcon: ({ color, focused, size }) => <TabIcon name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} activeName={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }} color={color} focused={focused} size={size} /> }} />
    </Tabs>
  );
}

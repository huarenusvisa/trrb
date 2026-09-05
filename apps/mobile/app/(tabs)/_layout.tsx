import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';
import { unreadBadgeValue } from '../../src/notifications/unread-core';

const TabIcon = ({ label }: { label: string }) => <Text style={{ fontSize: 15, fontWeight: '700' }}>{label}</Text>;

export default function TabLayout() {
  const { t } = useI18n();
  const unread = useUnreadCounts();
  const profileBadge = unreadBadgeValue(unread);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#c8211e',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6 }
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarButtonTestID: 'tab-home', tabBarIcon: () => <TabIcon label={t('tab.homeIcon')} /> }} />
      <Tabs.Screen name="america" options={{ title: t('tab.america'), tabBarButtonTestID: 'tab-america', tabBarIcon: () => <TabIcon label={t('tab.americaIcon')} /> }} />
      <Tabs.Screen name="immigration" options={{ title: t('tab.immigration'), tabBarButtonTestID: 'tab-immigration', tabBarIcon: () => <TabIcon label={t('tab.immigrationIcon')} /> }} />
      <Tabs.Screen name="legal" options={{ title: t('tab.legal'), tabBarButtonTestID: 'tab-legal', tabBarIcon: () => <TabIcon label={t('tab.legalIcon')} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tab.profile'), tabBarButtonTestID: 'tab-profile', tabBarBadge: profileBadge, tabBarBadgeStyle: { backgroundColor: '#c8211e', color: '#fff' }, tabBarIcon: () => <TabIcon label={t('tab.profileIcon')} /> }} />
    </Tabs>
  );
}

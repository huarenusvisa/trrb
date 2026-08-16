import { Tabs } from 'expo-router';
import { Text } from 'react-native';

const TabIcon = ({ label }: { label: string }) => <Text style={{ fontSize: 15, fontWeight: '700' }}>{label}</Text>;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#c8211e',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6 }
      }}
    >
      <Tabs.Screen name="index" options={{ title: '首页', tabBarIcon: () => <TabIcon label="首" /> }} />
      <Tabs.Screen name="america" options={{ title: '美国', tabBarIcon: () => <TabIcon label="美" /> }} />
      <Tabs.Screen name="immigration" options={{ title: '移民', tabBarIcon: () => <TabIcon label="移" /> }} />
      <Tabs.Screen name="legal" options={{ title: '判例新规', tabBarIcon: () => <TabIcon label="法" /> }} />
      <Tabs.Screen name="profile" options={{ title: '我的', tabBarIcon: () => <TabIcon label="我" /> }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

const TabIcon = ({ label }: { label: string }) => <Text style={{ fontSize: 14, fontWeight: '800' }}>{label}</Text>;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2457a7',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: { height: 66, paddingTop: 6, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '总览', tabBarIcon: () => <TabIcon label="览" /> }} />
      <Tabs.Screen name="judges" options={{ title: '法官', tabBarIcon: () => <TabIcon label="官" /> }} />
      <Tabs.Screen name="courts" options={{ title: '法院', tabBarIcon: () => <TabIcon label="院" /> }} />
      <Tabs.Screen name="nationalities" options={{ title: '国籍', tabBarIcon: () => <TabIcon label="籍" /> }} />
      <Tabs.Screen name="about" options={{ title: '说明', tabBarIcon: () => <TabIcon label="源" /> }} />
    </Tabs>
  );
}

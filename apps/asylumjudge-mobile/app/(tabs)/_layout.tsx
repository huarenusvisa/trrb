import { Tabs } from 'expo-router';
import { ColorValue, Text } from 'react-native';
import { colors } from '../../src/theme';

function TabIcon({ icon, color }: { icon: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 20 }}>{icon}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown:false, tabBarActiveTintColor:colors.blue, tabBarInactiveTintColor:colors.muted, tabBarStyle:{height:66,paddingTop:7,paddingBottom:8} }}>
      <Tabs.Screen name="index" options={{ title:'法官搜索', tabBarIcon:({color}) => <TabIcon icon="⌕" color={color} /> }} />
      <Tabs.Screen name="about" options={{ title:'数据说明', tabBarIcon:({color}) => <TabIcon icon="ⓘ" color={color} /> }} />
    </Tabs>
  );
}

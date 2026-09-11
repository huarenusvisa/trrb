import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../mobile/src/i18n/I18nProvider';
import { UnreadProvider } from '../../mobile/src/notifications/UnreadProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <UnreadProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        </UnreadProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

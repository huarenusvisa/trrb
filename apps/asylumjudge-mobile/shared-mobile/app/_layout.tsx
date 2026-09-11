import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { installPushRegistrationLifecycle, installPushRuntimeHandlers } from '../src/push/registration';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { UnreadProvider } from '../src/notifications/UnreadProvider';

export default function RootLayout() {
  useEffect(() => {
    const disposeRuntime = installPushRuntimeHandlers();
    const disposeRegistration = installPushRegistrationLifecycle();
    return () => {
      disposeRuntime();
      disposeRegistration();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyPreviewUpdate() {
      try {
        if (__DEV__ || !Updates.isEnabled) return;
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable || cancelled) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) await Updates.reloadAsync();
      } catch (error) {
        console.warn('ota update check failed', error);
      }
    }

    void applyPreviewUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <I18nProvider>
      <UnreadProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </UnreadProvider>
    </I18nProvider>
  );
}

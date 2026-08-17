import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { installPushRuntimeHandlers, registerPushToken } from '../src/push/registration';

export default function RootLayout() {
  useEffect(() => {
    const dispose = installPushRuntimeHandlers();
    void registerPushToken().catch((error) => console.warn('push registration failed', error));
    return dispose;
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
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

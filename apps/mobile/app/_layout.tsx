import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { installPushRuntimeHandlers, registerPushToken } from '../src/push/registration';

export default function RootLayout() {
  useEffect(() => {
    const dispose = installPushRuntimeHandlers();
    void registerPushToken().catch((error) => console.warn('push registration failed', error));
    return dispose;
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const DEFAULT_DELAY_MS = 750;
const DEFAULT_COOLDOWN_MS = 10_000;

export function useForegroundRetry(enabled: boolean, retry: () => void, delayMs = DEFAULT_DELAY_MS, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastAttemptAt = 0;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastAttemptAt < cooldownMs) return;
      lastAttemptAt = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => retryRef.current(), delayMs);
    });

    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [cooldownMs, delayMs, enabled]);
}

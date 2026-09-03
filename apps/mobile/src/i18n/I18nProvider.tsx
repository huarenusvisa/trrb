import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LocalePreference, MessageKey, normalizeLocalePreference, resolveLocale, SupportedLocale, translate } from './i18n-core';

const STORAGE_KEY = 'trrb:interface-locale:v1';

function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

type I18nContextValue = {
  locale: SupportedLocale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => Promise<void>;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LocalePreference>('system');
  const [detectedLocale, setDetectedLocale] = useState(systemLocale);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (mounted) setPreferenceState(normalizeLocalePreference(stored));
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDetectedLocale(systemLocale());
    });
    return () => subscription.remove();
  }, [preference]);

  const setPreference = useCallback(async (next: LocalePreference) => {
    const safePreference = normalizeLocalePreference(next);
    setPreferenceState(safePreference);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, safePreference);
    } catch {
      // Keep the current-session choice even when device storage is temporarily unavailable.
    }
  }, []);

  const locale = resolveLocale(preference, detectedLocale);
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    preference,
    setPreference,
    t: (key, params) => translate(locale, key, params),
  }), [locale, preference, setPreference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

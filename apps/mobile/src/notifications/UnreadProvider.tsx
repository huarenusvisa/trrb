import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../auth/supabase';
import { unreadNotificationCount } from '../community/notifications';
import { unreadDirectMessageCount } from '../social/messages';
import { decrementNotificationUnread, normalizeUnreadCounts, unreadTotal, type UnreadCounts } from './unread-core';

type UnreadContextValue = UnreadCounts & {
  total: number;
  refresh: () => Promise<void>;
  markNotificationReadLocally: () => void;
  markAllNotificationsReadLocally: () => void;
};

const EMPTY_COUNTS: UnreadCounts = { notifications: 0, messages: 0 };
const UnreadContext = createContext<UnreadContextValue | null>(null);
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

async function syncAppIconBadge(total: number) {
  if (!isNative) return;
  await Notifications.setBadgeCountAsync(total);
}

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY_COUNTS);
  const requestId = useRef(0);

  const clear = useCallback(() => {
    requestId.current += 1;
    setCounts(EMPTY_COUNTS);
  }, []);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      if (currentRequest === requestId.current) setCounts(EMPTY_COUNTS);
      return;
    }
    const [notifications, messages] = await Promise.all([
      unreadNotificationCount(),
      unreadDirectMessageCount(),
    ]);
    if (currentRequest === requestId.current) setCounts(normalizeUnreadCounts({ notifications, messages }));
  }, []);

  useEffect(() => {
    void refresh().catch((error) => console.warn('unread count sync failed', error));
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh().catch((error) => console.warn('unread count sync failed', error));
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) clear();
      else setTimeout(() => void refresh().catch((error) => console.warn('unread count sync failed', error)), 0);
    });
    const notificationSubscription = isNative
      ? Notifications.addNotificationReceivedListener(() => {
          void refresh().catch((error) => console.warn('unread count sync failed', error));
        })
      : null;
    return () => {
      appStateSubscription.remove();
      authListener.subscription.unsubscribe();
      notificationSubscription?.remove();
    };
  }, [clear, refresh]);

  const total = unreadTotal(counts);
  useEffect(() => {
    void syncAppIconBadge(total).catch((error) => console.warn('app badge sync failed', error));
  }, [total]);

  const value = useMemo<UnreadContextValue>(() => ({
    ...counts,
    total,
    refresh,
    markNotificationReadLocally: () => setCounts((current) => decrementNotificationUnread(current)),
    markAllNotificationsReadLocally: () => setCounts((current) => ({ ...current, notifications: 0 })),
  }), [counts, refresh, total]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnreadCounts() {
  const value = useContext(UnreadContext);
  if (!value) throw new Error('useUnreadCounts must be used inside UnreadProvider');
  return value;
}

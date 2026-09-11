export type UnreadCounts = {
  notifications: number;
  messages: number;
};

const safeCount = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function normalizeUnreadCounts(counts: UnreadCounts): UnreadCounts {
  return {
    notifications: safeCount(counts.notifications),
    messages: safeCount(counts.messages),
  };
}

export function unreadTotal(counts: UnreadCounts) {
  const normalized = normalizeUnreadCounts(counts);
  return normalized.notifications + normalized.messages;
}

export function unreadBadgeValue(counts: UnreadCounts): number | '99+' | undefined {
  const total = unreadTotal(counts);
  if (!total) return undefined;
  return total > 99 ? '99+' : total;
}

export function decrementNotificationUnread(counts: UnreadCounts): UnreadCounts {
  const normalized = normalizeUnreadCounts(counts);
  return { ...normalized, notifications: Math.max(0, normalized.notifications - 1) };
}

export function decrementNotificationUnreadBy(counts: UnreadCounts, amount: number): UnreadCounts {
  const normalized = normalizeUnreadCounts(counts);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return { ...normalized, notifications: Math.max(0, normalized.notifications - safeAmount) };
}

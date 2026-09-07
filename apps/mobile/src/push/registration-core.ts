export type PushPlatform = 'ios' | 'android';

export type StoredPushRegistration = {
  version: 2;
  userId: string;
  platform: PushPlatform;
  expoPushToken: string;
};

const MAX_USER_ID_LENGTH = 128;
const MAX_PUSH_TOKEN_LENGTH = 2_048;

function safeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function parseStoredPushRegistration(raw: string | null): StoredPushRegistration | null {
  if (!raw || raw.length > 4_096) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPushRegistration>;
    const userId = safeString(value.userId, MAX_USER_ID_LENGTH);
    const expoPushToken = safeString(value.expoPushToken, MAX_PUSH_TOKEN_LENGTH);
    if (value.version !== 2 || !userId || !expoPushToken || (value.platform !== 'ios' && value.platform !== 'android')) return null;
    return { version: 2, userId, platform: value.platform, expoPushToken };
  } catch {
    return null;
  }
}

export function serializePushRegistration(userId: string, platform: PushPlatform, expoPushToken: string) {
  const registration = parseStoredPushRegistration(JSON.stringify({ version: 2, userId, platform, expoPushToken }));
  if (!registration) throw new Error('Invalid push registration metadata');
  return JSON.stringify(registration);
}

export function stalePushTokensForCurrentUser(
  userId: string,
  currentToken: string,
  stored: StoredPushRegistration | null,
  legacyToken: string | null
) {
  const stale = new Set<string>();
  if (stored?.userId === userId && stored.expoPushToken !== currentToken) stale.add(stored.expoPushToken);
  const safeLegacyToken = safeString(legacyToken, MAX_PUSH_TOKEN_LENGTH);
  if (safeLegacyToken && safeLegacyToken !== currentToken) stale.add(safeLegacyToken);
  return [...stale];
}

export function tokenToDisableForCurrentUser(
  userId: string,
  stored: StoredPushRegistration | null,
  legacyToken: string | null,
  liveToken: string | null
) {
  if (stored?.userId === userId) return stored.expoPushToken;
  return safeString(legacyToken, MAX_PUSH_TOKEN_LENGTH) ?? safeString(liveToken, MAX_PUSH_TOKEN_LENGTH);
}

export function shouldSynchronizePushRegistration(deviceDisabled: boolean, explicitlyRequested: boolean) {
  return explicitlyRequested || !deviceDisabled;
}

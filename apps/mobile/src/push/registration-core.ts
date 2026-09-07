export type PushPlatform = 'ios' | 'android';
export type PushRegistrationErrorKind = 'network' | 'server' | 'unknown';
export type PendingPushRetryTrigger = 'scheduled' | 'foreground' | 'network' | 'manual';

export type StoredPushRegistration = {
  version: 2;
  userId: string;
  platform: PushPlatform;
  expoPushToken: string;
};

export type PendingPushRegistration = {
  version: 1;
  userId: string;
  platform: PushPlatform;
  expoPushToken: string | null;
  attempts: number;
  createdAt: number;
  retryAt: number;
  errorKind: PushRegistrationErrorKind;
};

const MAX_USER_ID_LENGTH = 128;
const MAX_PUSH_TOKEN_LENGTH = 2_048;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const BASE_PENDING_RETRY_DELAY_MS = 15_000;
export const MAX_PENDING_PUSH_RETRY_DELAY_MS = 15 * 60 * 1_000;
const MAX_PENDING_ATTEMPTS = 10;

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

export function parsePendingPushRegistration(raw: string | null, now = Date.now()): PendingPushRegistration | null {
  if (!raw || raw.length > 4_096 || !Number.isFinite(now)) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingPushRegistration>;
    const userId = safeString(value.userId, MAX_USER_ID_LENGTH);
    const token = value.expoPushToken === null ? null : safeString(value.expoPushToken, MAX_PUSH_TOKEN_LENGTH);
    const attempts = Number(value.attempts);
    const createdAt = Number(value.createdAt);
    const retryAt = Number(value.retryAt);
    if (value.version !== 1 || !userId || (value.platform !== 'ios' && value.platform !== 'android')) return null;
    if (value.expoPushToken !== null && !token) return null;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_PENDING_ATTEMPTS) return null;
    if (!Number.isFinite(createdAt) || createdAt <= 0 || createdAt > now + MAX_FUTURE_SKEW_MS || now - createdAt > MAX_PENDING_AGE_MS) return null;
    if (!Number.isFinite(retryAt) || retryAt < createdAt || retryAt > now + MAX_PENDING_PUSH_RETRY_DELAY_MS + MAX_FUTURE_SKEW_MS) return null;
    const errorKind = value.errorKind === 'network' || value.errorKind === 'server' ? value.errorKind : 'unknown';
    return { version: 1, userId, platform: value.platform, expoPushToken: token, attempts, createdAt, retryAt, errorKind };
  } catch {
    return null;
  }
}

export function nextPendingPushRegistration(
  raw: string | null,
  userId: string,
  platform: PushPlatform,
  expoPushToken: string | null,
  now = Date.now(),
  errorKind: PushRegistrationErrorKind = 'unknown',
  retryAfterMs: number | null = null
) {
  const previous = parsePendingPushRegistration(raw, now);
  const nextToken = safeString(expoPushToken, MAX_PUSH_TOKEN_LENGTH) ?? previous?.expoPushToken ?? null;
  const sameAttempt = previous?.userId === userId && previous.platform === platform && previous.expoPushToken === nextToken;
  const attempts = sameAttempt ? Math.min(MAX_PENDING_ATTEMPTS, previous.attempts + 1) : 1;
  const createdAt = sameAttempt ? previous.createdAt : now;
  const exponentialDelay = Math.min(MAX_PENDING_PUSH_RETRY_DELAY_MS, BASE_PENDING_RETRY_DELAY_MS * (2 ** (attempts - 1)));
  const serverDelay = errorKind === 'server' && Number.isFinite(retryAfterMs) && Number(retryAfterMs) >= 0
    ? Math.min(MAX_PENDING_PUSH_RETRY_DELAY_MS, Number(retryAfterMs))
    : 0;
  const delay = Math.max(exponentialDelay, serverDelay);
  const pending: PendingPushRegistration = { version: 1, userId, platform, expoPushToken: nextToken, attempts, createdAt, retryAt: now + delay, errorKind };
  return JSON.stringify(pending);
}

export function classifyPushRegistrationError(error: unknown): PushRegistrationErrorKind {
  if (error instanceof TypeError) return 'network';
  if (typeof error !== 'object' || error === null || !('pushRegistrationErrorKind' in error)) return 'unknown';
  const kind = (error as { pushRegistrationErrorKind?: unknown }).pushRegistrationErrorKind;
  return kind === 'network' || kind === 'server' ? kind : 'unknown';
}

export function pushRegistrationRetryAfterMs(error: unknown) {
  if (typeof error !== 'object' || error === null || !('pushRegistrationRetryAfterMs' in error)) return null;
  const delay = Number((error as { pushRegistrationRetryAfterMs?: unknown }).pushRegistrationRetryAfterMs);
  if (!Number.isFinite(delay) || delay < 0) return null;
  return Math.min(MAX_PENDING_PUSH_RETRY_DELAY_MS, delay);
}

export class PushConnectivityGate {
  private wasOffline = false;

  record(state: { isConnected?: boolean; isInternetReachable?: boolean }) {
    const offline = state.isConnected === false || state.isInternetReachable === false;
    const online = state.isConnected === true && state.isInternetReachable !== false;
    const recovered = this.wasOffline && online;
    if (offline) this.wasOffline = true;
    if (online) this.wasOffline = false;
    return recovered;
  }
}

export function pendingPushRetryDelay(
  raw: string | null,
  userId: string,
  now = Date.now(),
  trigger: PendingPushRetryTrigger = 'scheduled'
) {
  const pending = parsePendingPushRegistration(raw, now);
  if (!pending || pending.userId !== userId) return null;
  if (trigger === 'manual' || (trigger === 'network' && pending.errorKind === 'network')) return 0;
  return Math.max(0, Math.min(MAX_PENDING_PUSH_RETRY_DELAY_MS, pending.retryAt - now));
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

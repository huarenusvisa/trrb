export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function accountStorageKey(baseKey: string, userId: string | null) {
  return userId ? `${baseKey}:account:${userId}` : baseKey;
}

export async function resolveAccountStorageKey(
  storage: KeyValueStorage,
  baseKey: string,
  userId: string | null,
  mergeValues?: (accountValue: string, guestValue: string) => string,
) {
  const scopedKey = accountStorageKey(baseKey, userId);
  if (!userId) return scopedKey;

  const existing = await storage.getItem(scopedKey);
  const guestValue = await storage.getItem(baseKey);
  if (guestValue !== null) {
    if (existing === null) await storage.setItem(scopedKey, guestValue);
    else if (mergeValues) await storage.setItem(scopedKey, mergeValues(existing, guestValue));
    else return scopedKey;
    await storage.removeItem(baseKey);
  }
  return scopedKey;
}

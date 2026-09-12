import assert from 'node:assert/strict';
import test from 'node:test';
import { accountStorageKey, resolveAccountStorageKey, type KeyValueStorage } from './account-storage-scope.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { storage, values };
}

test('guest storage keeps the legacy device key', async () => {
  const { storage } = memoryStorage();
  assert.equal(await resolveAccountStorageKey(storage, 'favorites', null), 'favorites');
});

test('first signed-in account claims guest data exactly once', async () => {
  const { storage, values } = memoryStorage({ favorites: '["guest"]' });
  const firstKey = await resolveAccountStorageKey(storage, 'favorites', 'user-a');

  assert.equal(firstKey, 'favorites:account:user-a');
  assert.equal(values.get(firstKey), '["guest"]');
  assert.equal(values.has('favorites'), false);

  const secondKey = await resolveAccountStorageKey(storage, 'favorites', 'user-b');
  assert.equal(secondKey, 'favorites:account:user-b');
  assert.equal(values.has(secondKey), false);
});

test('existing account data is never overwritten by guest data', async () => {
  const scoped = accountStorageKey('history', 'user-a');
  const { storage, values } = memoryStorage({ history: '["guest"]', [scoped]: '["account"]' });

  assert.equal(await resolveAccountStorageKey(storage, 'history', 'user-a'), scoped);
  assert.equal(values.get(scoped), '["account"]');
  assert.equal(values.get('history'), '["guest"]');
});

test('a caller can safely merge new guest data into an existing account', async () => {
  const scoped = accountStorageKey('favorites', 'user-a');
  const { storage, values } = memoryStorage({ favorites: '["guest"]', [scoped]: '["account"]' });

  await resolveAccountStorageKey(storage, 'favorites', 'user-a', (account, guest) => {
    return JSON.stringify([...JSON.parse(guest), ...JSON.parse(account)]);
  });

  assert.equal(values.get(scoped), '["guest","account"]');
  assert.equal(values.has('favorites'), false);
});

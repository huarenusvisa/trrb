import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationActionGate } from './notification-action-core.ts';

test('blocks duplicate notification actions synchronously', () => {
  const gate = new NotificationActionGate();
  const first = gate.start('notification-1');

  assert.ok(first);
  assert.equal(gate.start('notification-1'), null);
  assert.equal(gate.start('notification-2'), null);
  assert.equal(gate.finish(first), true);
  assert.ok(gate.start('notification-2'));
});

test('reset invalidates a pending action and its completion', () => {
  const gate = new NotificationActionGate();
  const pending = gate.start('notification-1');
  assert.ok(pending);

  gate.reset();

  assert.equal(gate.isCurrent(pending), false);
  assert.equal(gate.finish(pending), false);
  assert.ok(gate.start('notification-2'));
});

test('rejects empty notification identifiers', () => {
  const gate = new NotificationActionGate();
  assert.equal(gate.start('   '), null);
});

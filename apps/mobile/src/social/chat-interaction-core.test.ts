import test from 'node:test';
import assert from 'node:assert/strict';
import { callRoomFromUrl, chatDateLabel, createHoldRecorder } from './chat-interaction-core.ts';
import { uploadPercent } from './upload-transport.ts';

function harness() {
  let ready!: () => void;
  const preparing = new Promise<void>(resolve => { ready = resolve; });
  const events: string[] = []; let recording = false;
  const controller = createHoldRecorder({ prepare: () => preparing, start: () => { recording = true; events.push('start'); }, stop: async () => { events.push('stop'); return recording ? { uri: 'file://voice.m4a', durationMs: 1200 } : null; }, reset: async () => { events.push('reset'); }, send: async () => { events.push('send'); }, onState: state => events.push(state), onError: () => events.push('error'), onTooShort: () => events.push('short') });
  return { controller, events, ready };
}
test('release during permission prompt never starts or sends a recording', async () => {
  const h = harness(); h.controller.begin(); const ending = h.controller.finish(); h.ready(); await ending;
  assert.ok(!h.events.includes('start')); assert.ok(!h.events.includes('send')); assert.ok(h.events.includes('reset')); assert.equal(h.events.at(-1), 'idle');
});
test('hold and release starts once and sends once despite duplicate release', async () => {
  const h = harness(); h.controller.begin(); h.controller.begin(); h.ready(); await Promise.resolve();
  await Promise.all([h.controller.finish(), h.controller.finish()]);
  assert.equal(h.events.filter(e => e === 'start').length, 1); assert.equal(h.events.filter(e => e === 'stop').length, 1); assert.equal(h.events.filter(e => e === 'send').length, 1);
});
test('slide cancellation stops recording and never sends', async () => {
  const h = harness(); h.controller.begin(); h.ready(); await Promise.resolve(); await h.controller.finish(true);
  assert.ok(h.events.includes('stop')); assert.ok(!h.events.includes('send'));
});
test('background interruption cancels a pending gesture', async () => {
  const h = harness(); h.controller.begin(); const end = h.controller.finish(true); h.ready(); await end;
  assert.ok(!h.events.includes('start')); assert.ok(!h.events.includes('send'));
});
test('unmount during prepare cannot start, send or update UI later', async () => {
  const h = harness(); h.controller.begin(); h.controller.dispose(); const end = h.controller.finish(true); h.ready(); await end;
  assert.deepEqual(h.events.filter(e => ['start','send','idle'].includes(e)), []);
});
test('recording errors release audio mode and remain retryable', async () => {
  let resets = 0, errors = 0, state = '';
  const recorder = createHoldRecorder({ prepare: async () => { throw new Error('permission'); }, start: () => assert.fail(), stop: async () => null, reset: async () => { resets++; }, send: async () => assert.fail(), onState: value => {state = value;}, onError: () => {errors++;}, onTooShort: () => assert.fail() });
  recorder.begin(); await recorder.finish(); assert.ok(resets); assert.equal(errors,1); assert.equal(state,'idle');
});
test('too-short recordings are discarded rather than published', async () => {
  let short = false, sends = 0;
  const recorder = createHoldRecorder({ prepare: async () => {}, start: () => {}, stop: async () => ({ uri:'file://tiny',durationMs:400 }), reset: async () => {}, send: async () => {sends++;}, onState: () => {}, onError: () => assert.fail(), onTooShort: () => {short=true;} });
  recorder.begin(); await Promise.resolve(); await recorder.finish(); assert.equal(short,true); assert.equal(sends,0);
});
test('call invitations accept existing rooms and reject foreign hosts, credentials and schemes', () => {
  const room = 'TRRB-' + 'a'.repeat(32);
  assert.equal(callRoomFromUrl('https://meet.jit.si/' + room + '#config.startWithVideoMuted=true'), room);
  for(const url of ['https://meet.jit.si.evil.test/'+room,'jitsi://'+room,'https://evil@meet.jit.si/'+room,'https://meet.jit.si/a','https://meet.jit.si:8443/'+room]) assert.equal(callRoomFromUrl(url),null);
});
test('upload progress reserves completion for server acknowledgement', () => {
  assert.equal(uploadPercent(50,100),47); assert.equal(uploadPercent(100,100),95); assert.equal(uploadPercent(200,100),95); assert.equal(uploadPercent(1,0),0);
});
test('chat day labels distinguish today, yesterday and older dates across month boundary', () => {
  const now = new Date(2026,9,1,10);
  assert.equal(chatDateLabel(new Date(2026,9,1,8).toISOString(),'zh-CN',now),'今天');
  assert.equal(chatDateLabel(new Date(2026,8,30,8).toISOString(),'en',now),'Yesterday');
  assert.notEqual(chatDateLabel(new Date(2026,8,29,8).toISOString(),'zh-CN',now),'今天');
});

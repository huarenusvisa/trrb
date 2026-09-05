const assert = require('node:assert/strict');
const test = require('node:test');
const { correlatePushTickets, groupReceiptOutcomes, numericInFilter, isMissingReceiptQueueError } = require('./push-receipts-core');

test('correlates tickets with tokens and disables immediate invalid recipients', () => {
  const result = correlatePushTickets(
    [{ id: 11 }, { id: 12 }, { id: 13 }],
    [
      { status: 'ok', id: 'ticket-a' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'MessageTooBig' } }
    ]
  );
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 2);
  assert.deepEqual(result.receiptRows, [{ ticket_id: 'ticket-a', push_token_id: 11 }]);
  assert.deepEqual(result.invalidTokenIds, [12]);
});

test('treats missing or malformed tickets as rejected without queuing receipts', () => {
  const result = correlatePushTickets([{ id: 21 }, { id: 22 }], [{ status: 'ok' }]);
  assert.equal(result.accepted, 0);
  assert.equal(result.rejected, 2);
  assert.deepEqual(result.receiptRows, []);
});

test('preserves an interaction notification link on receipt rows', () => {
  const result = correlatePushTickets(
    [{ id: 31, notification_id: 91 }],
    [{ status: 'ok', id: 'ticket-community' }]
  );
  assert.deepEqual(result.receiptRows, [{
    ticket_id: 'ticket-community', push_token_id: 31, notification_id: 91
  }]);
});

test('groups receipt updates and only disables DeviceNotRegistered tokens', () => {
  const result = groupReceiptOutcomes([
    { id: 1, ticket_id: 'a', push_token_id: 101 },
    { id: 2, ticket_id: 'b', push_token_id: 102 },
    { id: 3, ticket_id: 'c', push_token_id: 103 },
    { id: 4, ticket_id: 'missing', push_token_id: 104 }
  ], {
    a: { status: 'ok' },
    b: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    c: { status: 'error', details: { error: 'InvalidCredentials' } }
  });
  assert.equal(result.missing, 1);
  assert.deepEqual(result.invalidTokenIds, [102]);
  assert.deepEqual(result.groups.map((group) => [group.status, group.errorCode, group.receiptRowIds]), [
    ['ok', null, [1]],
    ['error', 'DeviceNotRegistered', [2]],
    ['error', 'InvalidCredentials', [3]]
  ]);
});

test('builds injection-safe numeric PostgREST filters', () => {
  assert.equal(numericInFilter([3, '2', 3, '4)']), 'in.(3,2)');
  assert.equal(numericInFilter([]), null);
});

test('recognizes only the expected migration deployment gap', () => {
  assert.equal(isMissingReceiptQueueError({ statusCode: 404, message: 'push_ticket_receipts was not found' }), true);
  assert.equal(isMissingReceiptQueueError({ statusCode: 500, message: 'push_ticket_receipts failed' }), false);
  assert.equal(isMissingReceiptQueueError({ statusCode: 404, message: 'another_table was not found' }), false);
});

const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

function errorCode(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value) ? value : 'UnknownError';
}

function correlatePushTickets(targets, tickets) {
  const receiptRows = [];
  const invalidTokenIds = [];
  let accepted = 0;
  let rejected = 0;

  targets.forEach((target, index) => {
    const ticket = tickets[index];
    if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.trim()) {
      accepted += 1;
      receiptRows.push({ ticket_id: ticket.id.trim(), push_token_id: target.id });
      return;
    }
    rejected += 1;
    if (ticket?.details?.error === DEVICE_NOT_REGISTERED) invalidTokenIds.push(target.id);
  });

  return { accepted, rejected, receiptRows, invalidTokenIds: [...new Set(invalidTokenIds)] };
}

function groupReceiptOutcomes(rows, receiptData) {
  const groups = new Map();
  const invalidTokenIds = [];
  let missing = 0;

  for (const row of rows) {
    const receipt = receiptData?.[row.ticket_id];
    if (!receipt) {
      missing += 1;
      continue;
    }
    const status = receipt.status === 'ok' ? 'ok' : 'error';
    const code = status === 'error' ? errorCode(receipt.details?.error) : null;
    const key = `${status}:${code || ''}`;
    if (!groups.has(key)) groups.set(key, { status, errorCode: code, receiptRowIds: [] });
    groups.get(key).receiptRowIds.push(row.id);
    if (code === DEVICE_NOT_REGISTERED) invalidTokenIds.push(row.push_token_id);
  }

  return {
    groups: [...groups.values()],
    invalidTokenIds: [...new Set(invalidTokenIds)],
    missing
  };
}

function numericInFilter(values) {
  const ids = [...new Set(values)]
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return ids.length ? `in.(${ids.join(',')})` : null;
}

function isMissingReceiptQueueError(error) {
  return Number(error?.statusCode) === 404 && String(error?.message || '').includes('push_ticket_receipts');
}

module.exports = { DEVICE_NOT_REGISTERED, correlatePushTickets, groupReceiptOutcomes, numericInFilter, isMissingReceiptQueueError };

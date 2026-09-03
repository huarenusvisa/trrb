import supabaseAdmin from './_shared/supabase-admin.js';
import expoPushClient from './_shared/expo-push-client.js';
import receiptCore from './push-receipts-core.js';

const { rest } = supabaseAdmin;
const { expoJsonRequest } = expoPushClient;
const { groupReceiptOutcomes, numericInFilter, isMissingReceiptQueueError } = receiptCore;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name] ?? '';
}

function expoHeaders() {
  const accessToken = env('EXPO_ACCESS_TOKEN');
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
  };
}

async function expoGetReceipts(ids) {
  const { payload, attempts } = await expoJsonRequest({
    url: 'https://exp.host/--/api/v2/push/getReceipts',
    headers: expoHeaders(),
    body: { ids },
    operation: 'expo_receipts',
    idempotent: true
  });
  return { data: payload?.data && typeof payload.data === 'object' ? payload.data : {}, attempts };
}

async function patchByIds(table, ids, body) {
  const filter = numericInFilter(ids);
  if (!filter) return;
  await rest(table, { method: 'PATCH', query: { id: filter }, body, prefer: 'return=minimal' });
}

export default async () => {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  try {
    await rest('push_ticket_receipts', {
      method: 'PATCH',
      query: { status: 'eq.pending', created_at: `lt.${new Date(now - TWENTY_FOUR_HOURS).toISOString()}` },
      body: { status: 'expired', checked_at: checkedAt },
      prefer: 'return=minimal'
    });

    const rows = await rest('push_ticket_receipts', {
      query: {
        select: 'id,ticket_id,push_token_id,status,created_at',
        status: 'eq.pending',
        created_at: `lte.${new Date(now - FIFTEEN_MINUTES).toISOString()}`,
        order: 'created_at.asc',
        limit: '1000'
      }
    });
    if (!Array.isArray(rows) || !rows.length) {
      console.log('push receipts: no eligible tickets');
      return new Response(null, { status: 200 });
    }

    const receiptResponse = await expoGetReceipts(rows.map((row) => row.ticket_id));
    const outcomes = groupReceiptOutcomes(rows, receiptResponse.data);
    for (const group of outcomes.groups) {
      await patchByIds('push_ticket_receipts', group.receiptRowIds, {
        status: group.status,
        error_code: group.errorCode,
        checked_at: checkedAt
      });
    }
    await patchByIds('push_tokens', outcomes.invalidTokenIds, { enabled: false, updated_at: checkedAt });
    console.log(JSON.stringify({
      event: 'push_receipts_checked',
      requested: rows.length,
      processed: rows.length - outcomes.missing,
      pending: outcomes.missing,
      retries: Math.max(0, receiptResponse.attempts - 1),
      disabled_tokens: outcomes.invalidTokenIds.length
    }));
    return new Response(null, { status: 200 });
  } catch (error) {
    if (isMissingReceiptQueueError(error)) {
      console.warn('push receipt queue migration has not been applied; skipping this scheduled run');
      return new Response(null, { status: 200 });
    }
    console.error('push receipt processing failed', error?.message || error);
    return new Response(null, { status: 500 });
  }
};

export const config = { schedule: '@hourly' };

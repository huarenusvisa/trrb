import { randomUUID } from 'node:crypto';
import supabaseAdmin from './_shared/supabase-admin.js';
import expoPushClient from './_shared/expo-push-client.js';
import receiptCore from './push-receipts-core.js';
import communityPushCore from './community-push-core.js';

const { rest } = supabaseAdmin;
const { expoJsonRequest } = expoPushClient;
const { correlatePushTickets, numericInFilter } = receiptCore;
const { buildDeliveryPlan, summarizeNotificationOutcomes, uuidInFilter } = communityPushCore;
const CLAIM_LIMIT = 100;
const CLAIM_EXPIRY_MS = 30 * 60 * 1000;

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

async function expoSend(messages) {
  const { payload, attempts } = await expoJsonRequest({
    url: 'https://exp.host/--/api/v2/push/send',
    headers: expoHeaders(),
    body: messages,
    operation: 'interaction_push'
  });
  return { tickets: Array.isArray(payload?.data) ? payload.data : [], attempts };
}

async function patchClaimed(ids, claimId, body) {
  const filter = numericInFilter(ids);
  if (!filter) return;
  await rest('user_notifications', {
    method: 'PATCH',
    query: { id: filter, push_status: 'eq.processing', push_claim_id: `eq.${claimId}` },
    body,
    prefer: 'return=minimal'
  });
}

async function skipByReason(skipped, claimId) {
  const reasons = new Map();
  for (const item of skipped) {
    if (!reasons.has(item.reason)) reasons.set(item.reason, []);
    reasons.get(item.reason).push(item.id);
  }
  for (const [reason, ids] of reasons) {
    await patchClaimed(ids, claimId, {
      push_status: 'skipped', push_claim_id: null, push_error: reason, push_sent_at: null
    });
  }
}

function migrationMissing(error) {
  const message = String(error?.message || '');
  return Number(error?.statusCode) === 404
    && (message.includes('claim_interaction_push_notifications') || message.includes('push_status'));
}

export default async () => {
  const now = new Date();
  const claimId = randomUUID();
  let claimedIds = [];
  let deliveryStarted = false;
  try {
    // A worker crash after the external send is delivery-ambiguous. Quarantine an
    // expired claim instead of retrying it and risking a duplicate notification.
    await rest('user_notifications', {
      method: 'PATCH',
      query: {
        push_status: 'eq.processing',
        push_attempted_at: `lt.${new Date(now.getTime() - CLAIM_EXPIRY_MS).toISOString()}`
      },
      body: { push_status: 'failed', push_claim_id: null, push_error: 'expired_delivery_unknown' },
      prefer: 'return=minimal'
    });

    const notifications = await rest('rpc/claim_interaction_push_notifications', {
      method: 'POST',
      body: { p_claim_id: claimId, p_limit: CLAIM_LIMIT }
    });
    if (!Array.isArray(notifications) || !notifications.length) {
      console.log('interaction push: no pending notifications');
      return new Response(null, { status: 200 });
    }
    claimedIds = notifications.map((row) => row.id);

    const userFilter = uuidInFilter(notifications.map((row) => row.user_id));
    const [tokens, preferences] = await Promise.all([
      rest('push_tokens', {
        query: { select: 'id,user_id,expo_push_token,enabled', user_id: userFilter, enabled: 'eq.true', limit: '5000' }
      }),
      rest('notification_preferences', {
        query: { select: 'user_id,community', user_id: userFilter, limit: '5000' }
      })
    ]);
    const plan = buildDeliveryPlan(notifications, tokens, preferences);
    await skipByReason(plan.skipped, claimId);

    const acceptedIds = new Set();
    const retryIds = new Set();
    const unknownIds = new Set();
    const receiptRows = [];
    const invalidTokenIds = [];
    let retryCount = 0;

    for (let index = 0; index < plan.targets.length; index += 100) {
      const batch = plan.targets.slice(index, index + 100);
      try {
        deliveryStarted = true;
        const sent = await expoSend(batch.map((target) => target.message));
        retryCount += Math.max(0, sent.attempts - 1);
        const correlated = correlatePushTickets(batch, sent.tickets);
        receiptRows.push(...correlated.receiptRows);
        invalidTokenIds.push(...correlated.invalidTokenIds);
        for (const outcome of summarizeNotificationOutcomes(batch, sent.tickets)) {
          if (outcome.accepted) acceptedIds.add(outcome.id);
        }
      } catch (error) {
        const ids = new Set(batch.map((target) => target.notification_id));
        for (const id of ids) {
          if (error?.deliveryUnknown) unknownIds.add(id);
          else retryIds.add(id);
        }
        console.error('interaction push batch failed', error?.message || error);
      }
    }

    const invalidFilter = numericInFilter(invalidTokenIds);
    if (invalidFilter) {
      await rest('push_tokens', {
        method: 'PATCH', query: { id: invalidFilter },
        body: { enabled: false, updated_at: now.toISOString() }, prefer: 'return=minimal'
      });
    }
    if (receiptRows.length) {
      try {
        await rest('push_ticket_receipts', {
          method: 'POST', body: receiptRows,
          prefer: 'return=minimal,resolution=ignore-duplicates'
        });
      } catch (error) {
        // Delivery already happened. Never return a retryable failure solely
        // because receipt persistence failed.
        console.error('interaction push receipt queue unavailable', error?.message || error);
      }
    }

    const allTargetIds = new Set(plan.targets.map((target) => target.notification_id));
    const sentIds = [...acceptedIds];
    const pendingIds = [...retryIds].filter((id) => !acceptedIds.has(id) && !unknownIds.has(id));
    const unknownFailedIds = [...unknownIds].filter((id) => !acceptedIds.has(id));
    const rejectedFailedIds = [...allTargetIds].filter((id) =>
      !acceptedIds.has(id) && !pendingIds.includes(id) && !unknownIds.has(id)
    );
    await patchClaimed(sentIds, claimId, {
      push_status: 'sent', push_claim_id: null, push_sent_at: now.toISOString(), push_error: null
    });
    await patchClaimed(pendingIds, claimId, {
      push_status: 'pending', push_claim_id: null, push_error: 'safe_to_retry', push_sent_at: null
    });
    await patchClaimed(unknownFailedIds, claimId, {
      push_status: 'failed', push_claim_id: null, push_error: 'delivery_unknown', push_sent_at: null
    });
    await patchClaimed(rejectedFailedIds, claimId, {
      push_status: 'failed', push_claim_id: null, push_error: 'expo_rejected', push_sent_at: null
    });

    console.log(JSON.stringify({
      event: 'interaction_push_delivery',
      claimed: notifications.length,
      sent: sentIds.length,
      skipped: plan.skipped.length,
      retry_pending: pendingIds.length,
      failed: unknownFailedIds.length + rejectedFailedIds.length,
      tickets: receiptRows.length,
      retries: retryCount,
      disabled_tokens: new Set(invalidTokenIds).size
    }));
    return new Response(null, { status: 200 });
  } catch (error) {
    if (migrationMissing(error)) {
      console.warn('interaction push migration has not been applied; skipping this scheduled run');
      return new Response(null, { status: 200 });
    }
    if (claimedIds.length && !deliveryStarted) {
      try {
        await patchClaimed(claimedIds, claimId, {
          push_status: 'pending', push_claim_id: null, push_error: 'pre_delivery_failure'
        });
      } catch (releaseError) {
        console.error('interaction push claim release failed', releaseError?.message || releaseError);
      }
    }
    console.error('interaction push processing failed', error?.message || error);
    return new Response(null, { status: 500 });
  }
};

export const config = { schedule: '*/15 * * * *' };

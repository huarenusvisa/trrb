const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');
const { correlatePushTickets, numericInFilter } = require('./push-receipts-core');

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

const CATEGORY_FIELD = {
  breaking_news: 'breaking_news',
  ice: 'ice',
  immigration: 'immigration',
  legal: 'legal',
  community: 'community'
};

async function expoSend(messages) {
  if (!messages.length) return [];
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`expo_push_failed:${response.status}`);
  return Array.isArray(payload.data) ? payload.data : [];
}

exports.handler = async (event) => {
  try {
    const { user, admin } = await authenticateStaff(event, ['owner', 'editor']);
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    const body = JSON.parse(event.body || '{}');
    const articleId = safeText(body.article_id, 80);
    const category = safeText(body.category || 'breaking_news', 40);
    if (!articleId) return json(400, { error: 'missing_article_id' });
    if (!CATEGORY_FIELD[category]) return json(400, { error: 'invalid_category' });

    const articles = await rest('articles', { query: { select: 'id,title,status,published_at', id: `eq.${articleId}`, status: 'eq.published', limit: '1' } });
    const article = Array.isArray(articles) ? articles[0] : null;
    if (!article) return json(404, { error: 'published_article_not_found' });

    const [tokens, preferences] = await Promise.all([
      rest('push_tokens', { query: { select: 'id,user_id,expo_push_token,platform,enabled', enabled: 'eq.true', limit: '5000' } }),
      rest('notification_preferences', { query: { select: `user_id,${CATEGORY_FIELD[category]}`, limit: '5000' } })
    ]);

    const allowed = new Map((preferences || []).map((row) => [row.user_id, row[CATEGORY_FIELD[category]] !== false]));
    const targets = (tokens || []).filter((row) => allowed.get(row.user_id) !== false);

    if (body.preview === true) {
      return json(200, { ok: true, preview: true, role: admin.role, article_id: article.id, target_count: targets.length });
    }

    const messages = targets.map((row) => ({
      to: row.expo_push_token,
      sound: 'default',
      channelId: 'news',
      title: '唐人日报',
      body: article.title,
      data: { article_id: String(article.id), category }
    }));

    let accepted = 0;
    let rejected = 0;
    const receiptRows = [];
    const invalidTokenIds = [];
    for (let i = 0; i < messages.length; i += 100) {
      const ticketBatch = await expoSend(messages.slice(i, i + 100));
      const correlated = correlatePushTickets(targets.slice(i, i + 100), ticketBatch);
      accepted += correlated.accepted;
      rejected += correlated.rejected;
      receiptRows.push(...correlated.receiptRows);
      invalidTokenIds.push(...correlated.invalidTokenIds);
    }

    const deliveryRows = await rest('push_delivery_log', {
      method: 'POST',
      body: { article_id: article.id, category, target_count: targets.length, accepted_count: accepted, rejected_count: rejected, actor_user_id: user.id },
      prefer: 'return=representation'
    });

    const invalidFilter = numericInFilter(invalidTokenIds);
    if (invalidFilter) {
      await rest('push_tokens', {
        method: 'PATCH',
        query: { id: invalidFilter },
        body: { enabled: false, updated_at: new Date().toISOString() },
        prefer: 'return=minimal'
      });
    }

    let receiptTrackingCount = 0;
    if (receiptRows.length) {
      try {
        await rest('push_ticket_receipts', {
          method: 'POST',
          body: receiptRows.map((row) => ({ ...row, delivery_log_id: deliveryRows?.[0]?.id ?? null })),
          prefer: 'return=minimal,resolution=ignore-duplicates'
        });
        receiptTrackingCount = receiptRows.length;
      } catch (error) {
        // Sending already happened. Do not return a retryable 500 that could duplicate notifications
        // during the short deployment window before the receipt migration is applied.
        console.error('push receipt queue unavailable', error?.message || error);
      }
    }

    return json(200, { ok: true, article_id: article.id, target_count: targets.length, accepted_count: accepted, rejected_count: rejected, receipt_tracking_count: receiptTrackingCount, disabled_token_count: new Set(invalidTokenIds).size });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'server_error' });
  }
};

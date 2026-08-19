const listHandler = require('./ice-review-list-v3').handler;
const publishHandler = require('./ice-review-v2').handler;
const actionHandler = require('./ice-review-actions-v4').handler;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '请求内容不是有效JSON' });
  }

  const action = String(input.action || '').trim();
  if (action === 'list') return listHandler(event, context);
  if (action === 'publish_now') return publishHandler(event, context);
  if (['detail', 'save', 'approve', 'wait', 'rewrite', 'reject'].includes(action)) {
    return actionHandler(event, context);
  }
  return json(400, { error: '未知操作' });
};

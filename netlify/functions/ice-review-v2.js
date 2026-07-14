const publishEndpoint = require("./ice-v2-publish-now");
const listEndpoint = require("./ice-review-list-v3");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "请求内容不是有效JSON" });
  }

  if (input.action === "publish_now") {
    return publishEndpoint.handler(event, context);
  }

  if (input.action === "list") {
    return listEndpoint.handler(event, context);
  }

  return json(400, { error: "ICE v2接口仅支持list和publish_now" });
};

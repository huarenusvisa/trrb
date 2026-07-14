const crypto = require("node:crypto");

exports.handler = async () => ({
  statusCode: 501,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ error: "Not implemented", id: crypto.randomUUID() })
});

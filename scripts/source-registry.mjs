import fs from "node:fs";
import path from "node:path";

export function loadSourceRegistry(root = process.cwd()) {
  const file = path.join(root, "data", "source-registry.json");
  try {
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(rows) ? rows.filter(row => row && row.active !== false) : [];
  } catch (error) {
    console.warn(`Source registry unavailable: ${error.message}`);
    return [];
  }
}

export function accountsForTopic(topic, root = process.cwd(), levels = ["A", "B", "C"]) {
  const allowed = new Set(levels);
  return [...new Set(loadSourceRegistry(root)
    .filter(row => !Array.isArray(row.topics) || row.topics.includes(topic))
    .filter(row => allowed.has(String(row.source_level || "C").toUpperCase()))
    .map(row => String(row.x_account || "").replace(/^@/, "").trim())
    .filter(Boolean))];
}

export function sourceByAccount(account, root = process.cwd()) {
  const normalized = String(account || "").replace(/^@/, "").toLowerCase();
  return loadSourceRegistry(root).find(row => String(row.x_account || "").replace(/^@/, "").toLowerCase() === normalized) || null;
}

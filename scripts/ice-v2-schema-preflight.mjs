#!/usr/bin/env node
import process from "node:process";
import { requiredTables, validateEnvironment, validateSchemaResults, summarizePreflight } from "./ice-v2-schema-preflight-core.mjs";

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json"
  };
}

async function inspectTable(table, columns) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const select = columns.join(",");
  const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `${response.status}:${text.slice(0, 500)}` };
  }
  return { ok: true, columns };
}

async function main() {
  const environment = validateEnvironment(process.env);
  if (!environment.ok) {
    console.error(JSON.stringify(summarizePreflight({ environment, schema: { ok: false, failures: [] } }), null, 2));
    process.exitCode = 1;
    return;
  }

  const checks = {};
  for (const [table, columns] of Object.entries(requiredTables())) {
    checks[table] = await inspectTable(table, columns);
  }
  const schema = validateSchemaResults(checks);
  const result = summarizePreflight({ environment, schema });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("ICE v2 schema preflight failed:", error);
  process.exitCode = 1;
});

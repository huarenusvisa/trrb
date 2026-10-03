import process from 'node:process';
import fs from 'node:fs';
import { requestJson } from './lib/bounded-rest-request.mjs';

const keys = [
  'global', 'ice', 'china_hot', 'trump_x', 'jobs', 'secondhand',
  'seo_indexnow', 'seo_search_engine', 'monitor', 'maintenance',
  'seo_metadata', 'legacy_recovery'
];

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const outputFile = process.env.GITHUB_OUTPUT || '';

function writeOutputs(values, reason) {
  const lines = keys.map((key) => `${key}=${values[key] === true ? 'true' : 'false'}`);
  lines.push(`reason=${String(reason || '').replace(/[\r\n]+/g, ' ').slice(0, 500)}`);
  if (outputFile) {
    fs.appendFileSync(outputFile, `${lines.join('\n')}\n`);
  } else {
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}

async function main() {
  const disabled = Object.fromEntries(keys.map((key) => [key, false]));
  if (!url || !serviceKey) {
    writeOutputs(disabled, 'missing Supabase gate configuration; fail closed');
    console.error('::error::Missing database gate configuration; automation paused.');
    process.exitCode = 1;
    return;
  }
  try {
    const rows = await requestJson(`${url}/rest/v1/automation_controls?select=control_key,enabled`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    }, {
      onRetry: ({ attempt, maximum, status, code }) => console.warn(JSON.stringify({
        stage: 'automation-gate-api-retry', attempt, maximum, status, code
      }))
    });
    if (!Array.isArray(rows)) throw new Error('Invalid database gate response');
    const values = { ...disabled };
    for (const row of Array.isArray(rows) ? rows : []) {
      if (keys.includes(row.control_key)) values[row.control_key] = row.enabled === true;
    }
    writeOutputs(values, values.global ? 'global gate enabled' : 'global gate paused');
  } catch (error) {
    writeOutputs(disabled, `${error.message}; fail closed`);
    console.error('::error::Database automation gate unavailable; tasks paused, not completed.');
    process.exitCode = 1;
  }
}

await main();

import process from 'node:process';
import fs from 'node:fs';

const keys = [
  'global', 'ice', 'china_hot', 'trump_x', 'jobs', 'secondhand',
  'seo_indexnow', 'seo_search_engine', 'monitor', 'maintenance',
  'legacy_404', 'seo_metadata', 'legacy_recovery'
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
    return;
  }
  try {
    const response = await fetch(`${url}/rest/v1/automation_controls?select=control_key,enabled`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!response.ok) throw new Error(`gate API returned ${response.status}`);
    const rows = await response.json();
    const values = { ...disabled };
    for (const row of Array.isArray(rows) ? rows : []) {
      if (keys.includes(row.control_key)) values[row.control_key] = row.enabled === true;
    }
    writeOutputs(values, values.global ? 'global gate enabled' : 'global gate paused');
  } catch (error) {
    writeOutputs(disabled, `${error.message}; fail closed`);
  }
}

await main();

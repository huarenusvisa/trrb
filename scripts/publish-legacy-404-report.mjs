#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'automation-reports';
const OBJECT = 'legacy-404-latest.txt';
const MAX_REPORT_BYTES = 20971520;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`
};

async function ensureBucket() {
  const bucketConfig = {
    public: false,
    file_size_limit: MAX_REPORT_BYTES,
    allowed_mime_types: ['text/plain']
  };
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers });
  if (check.ok) {
    const updated = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(bucketConfig)
    });
    if (!updated.ok) throw new Error(`bucket update failed: ${updated.status} ${await updated.text()}`);
    return;
  }
  const checkText = await check.text();
  const bucketMissing = check.status === 404
    || (check.status === 400 && /NoSuchBucket|Bucket not found/i.test(checkText));
  if (!bucketMissing) throw new Error(`bucket check failed: ${check.status} ${checkText}`);
  const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, ...bucketConfig })
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(`bucket create failed: ${created.status} ${await created.text()}`);
  }
}

await ensureBucket();
const body = await readFile('reports/legacy-404-latest.txt');
const uploaded = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT}`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'text/plain',
    'x-upsert': 'true',
    'Cache-Control': 'no-store'
  },
  body
});
if (!uploaded.ok) {
  throw new Error(`report upload failed: ${uploaded.status} ${await uploaded.text()}`);
}
console.log(JSON.stringify({ uploaded: true, bucket: BUCKET, object: OBJECT, bytes: body.length }));

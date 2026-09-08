import path from 'node:path';
import process from 'node:process';
import { validateStoreSubmissionAssets } from './store-submission-assets-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const failures = validateStoreSubmissionAssets(mobileRoot);

if (failures.length) {
  console.error(`Store submission assets are not ready (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Store submission assets: PASS');

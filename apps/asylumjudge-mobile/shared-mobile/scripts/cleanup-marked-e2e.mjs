import { cleanupCommunityE2e } from './cleanup-community-e2e.mjs';
import { cleanupNewsCommentsE2e } from './cleanup-news-comments-e2e.mjs';

const tasks = [
  ['community posts', cleanupCommunityE2e],
  ['news comments', cleanupNewsCommentsE2e],
];
const results = await Promise.allSettled(tasks.map(([, cleanup]) => cleanup(process.env)));
let failed = false;
for (const [index, result] of results.entries()) {
  const label = tasks[index][0];
  if (result.status === 'fulfilled') console.log(`Marked E2E cleanup (${label}): ${result.value} item(s)`);
  else {
    failed = true;
    console.error(`Marked E2E cleanup (${label}) failed: ${result.reason?.message || 'unknown_error'}`);
  }
}
if (failed) process.exit(1);

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const trrb = JSON.parse(fs.readFileSync(path.join(repo, 'apps/mobile/app.json'), 'utf8')).expo;
const api = fs.readFileSync(path.join(root, 'src/api/asylumjudge.ts'), 'utf8');
const about = fs.readFileSync(path.join(root, 'app/(tabs)/about.tsx'), 'utf8');

const checks = [
  ['independent iOS bundle identifier', app.ios.bundleIdentifier && app.ios.bundleIdentifier !== trrb.ios.bundleIdentifier],
  ['independent Android package', app.android.package && app.android.package !== trrb.android.package],
  ['independent URL scheme', app.scheme && app.scheme !== trrb.scheme],
  ['independent Expo slug', app.slug && app.slug !== trrb.slug],
  ['no TRRB EAS project ID', !JSON.stringify(app).includes(trrb.extra.eas.projectId)],
  ['no EAS project ID before dedicated registration', !app.extra?.eas?.projectId && !app.updates?.url],
  ['public AsylumJudge API only', api.includes("https://asylumjudge.com/.netlify/functions/immigration-judges")],
  ['minimum-sample suppression preserved', api.includes('rate_reliable') && api.includes('MIN_REPORTABLE_DECISIONS')],
  ['legal disclaimer included', about.includes('不是法律建议')],
  ['EOIR attribution included', about.includes('EOIR')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`AsylumJudge mobile contract audit: ${checks.length}/${checks.length} passed`);

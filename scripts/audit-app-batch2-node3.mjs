import fs from 'node:fs';

const articlePath = 'apps/mobile/app/article/[id].tsx';
const apiPath = 'apps/mobile/src/api/trrb.ts';
const prefsPath = 'apps/mobile/src/storage/reading-preferences.ts';
const appJsonPath = 'apps/mobile/app.json';
const packagePath = 'apps/mobile/package.json';

for (const path of [articlePath, apiPath, prefsPath, appJsonPath, packagePath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing required file: ${path}`);
}

const article = fs.readFileSync(articlePath, 'utf8');
const api = fs.readFileSync(apiPath, 'utf8');
const prefs = fs.readFileSync(prefsPath, 'utf8');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const checks = [
  ['production detail API', api.includes("public-article") && api.includes("https://trrb.net/.netlify/functions")],
  ['title', article.includes('article.title')],
  ['author', article.includes("article.author")],
  ['published time', article.includes('article.published_at')],
  ['article body', article.includes('article.content')],
  ['article media', article.includes('article.cover_image')],
  ['share', article.includes('Share.share')],
  ['copy link', article.includes('Clipboard.setStringAsync') && pkg.dependencies?.['expo-clipboard']],
  ['font preferences', article.includes('getReadingPreferences') && article.includes('setReadingFontScale') && prefs.includes('fontScale')],
  ['related articles', article.includes('fetchRelatedArticles') && api.includes('fetchRelatedArticles')],
  ['deep link route', article.includes("router.push(`/article/${item.id}`)") && appJson.expo?.scheme === 'trrb'],
  ['no alternate API origin', !/API_BASE\s*=\s*['\"](?!https:\/\/trrb\.net\/\.netlify\/functions)/.test(api)]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`APP batch 2 node 3 failed ${failed.length} check(s).`);
  process.exit(1);
}
console.log('APP BATCH 2 NODE 3: PASS');

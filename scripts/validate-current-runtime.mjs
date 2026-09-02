import { readFile } from 'node:fs/promises';

const failures=[];
const browserScripts=[
  'article-route-runtime.js',
  'article-v31.js',
  'article-live-neighbors.js',
  'image-cdn-optimizer.js',
  'articles-home.js',
  'homepage-refresh-guard.js',
  'articles-home-live-fix.js',
  'homepage-secondary-hubs.bundle.js',
  'homepage-topic-runtime.bundle.js',
  'category-runtime-v3.js',
  'homepage-immigration-hub.js',
  'topic-focus.js',
  'ice-home-unify.js',
  'listing-seo.js',
  'immigration-entry.js',
  'listing.js'
];

for(const file of browserScripts){
  try{
    const source=await readFile(file,'utf8');
    new Function(source);
  }catch(error){
    failures.push(`${file}: ${error.code==='ENOENT'?'missing':`JavaScript syntax error (${error.message})`}`);
  }
}

async function requireInHtml(file,needles){
  let html='';
  try{html=await readFile(file,'utf8');}
  catch(error){failures.push(`${file}: missing (${error.code||error.message})`);return;}
  for(const needle of needles){if(!html.includes(needle))failures.push(`${file}: missing runtime ${needle}`);}
}

await requireInHtml('index.html',['articles-home.js','homepage-refresh-guard.js','homepage-secondary-hubs.bundle.js','homepage-topic-runtime.bundle.js','topic-focus.js','article-route-runtime.js']);
await requireInHtml('article.html',['article-v31.js','article-live-neighbors.js','image-cdn-optimizer.js']);
await requireInHtml('listing.html',['listing-seo.js','immigration-entry.js','category-runtime-v3.js','listing.js','article-route-runtime.js','image-cdn-optimizer.js']);

if(failures.length){
  console.error('Current runtime validation failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`Current runtime validation passed: ${browserScripts.length} scripts parsed and active HTML loaders verified.`);

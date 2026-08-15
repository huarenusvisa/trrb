import fs from 'node:fs';

const articleHtmlPath = 'article.html';
const homeJsPath = 'articles-home.js';

let articleHtml = fs.readFileSync(articleHtmlPath, 'utf8');
let homeJs = fs.readFileSync(homeJsPath, 'utf8');

const legacyLoader = '<script src="/article.js?v=29.8-legacy-archive-rescue"></script>';
if (!articleHtml.includes(legacyLoader)) {
  const needle = '<script src="/article-v31.js?v=31.4"></script>';
  if (!articleHtml.includes(needle)) throw new Error('article-v31 script marker not found');
  articleHtml = articleHtml.replace(
    needle,
    `${legacyLoader}${needle}`
  );
}

const oldBlock = `    const live = await fetchLivePublishedArticles(60);\n    if (live.length) {\n      renderHome(mergeArticles(live, archived));\n      return;\n    }`;
const newBlock = `    const live = await fetchLivePublishedArticles(200);\n    if (live.length) {\n      // Production homepage must be driven only by current published rows.\n      // Archived static data is a disaster-recovery fallback, not a source for\n      // filling live category slots, otherwise old July stories can reappear.\n      renderHome(live);\n      return;\n    }`;

if (homeJs.includes(oldBlock)) {
  homeJs = homeJs.replace(oldBlock, newBlock);
} else if (!homeJs.includes('fetchLivePublishedArticles(200)') || !homeJs.includes('renderHome(live);')) {
  throw new Error('articles-home live rendering block not found');
}

fs.writeFileSync(articleHtmlPath, articleHtml);
fs.writeFileSync(homeJsPath, homeJs);

console.log('HOME_STALE_ARCHIVE_FIX=true');
console.log('LEGACY_ARTICLE_LOADER_RESTORED=true');

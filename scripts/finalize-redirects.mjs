import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '_redirects');
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';

const required = [
  'http://trrb.net/* https://trrb.net/:splat 301!',
  'http://www.trrb.net/* https://trrb.net/:splat 301!',
  'https://www.trrb.net/* https://trrb.net/:splat 301!',
  '/important-news /listing.html?category=%E9%87%8D%E8%A6%81%E6%96%B0%E9%97%BB 200!',
  '/hot-headlines /listing.html?category=%E7%83%AD%E9%97%A8%E5%A4%B4%E6%9D%A1 200!',
  '/asylum /listing.html?category=%E5%BA%87%E6%8A%A4%E7%99%BE%E7%A7%91 200!',
  '/ice /topic/ice/live-v6.html 200!',
  '/ice/ /topic/ice/live-v6.html 200!',
  '/ice/news /listing.html?category=ICE%E6%89%A7%E6%B3%95%E5%8A%A8%E6%80%81 200!',
  '/ice/news/ /listing.html?category=ICE%E6%89%A7%E6%B3%95%E5%8A%A8%E6%80%81 200!',
  '/topic/ice /topic/ice/live-v6.html 200!',
  '/topic/ice/ /topic/ice/live-v6.html 200!'
];

const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
const filtered = lines.filter((line) => !required.some((rule) => line.split(/\s+/)[0] === rule.split(/\s+/)[0]));
fs.writeFileSync(file, [...required, ...filtered].join('\n') + '\n');
console.log(`[redirects] finalized ${required.length} canonical/special rules + ${filtered.length} generated rules`);

// Round 11: trim redundant homepage payload immediately before the Netlify publish output is finalized.
await import('./optimize-homepage-performance.mjs');

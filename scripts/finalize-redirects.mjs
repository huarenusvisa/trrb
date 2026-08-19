import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '_redirects');
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';

const required = [
  'http://trrb.net/* https://trrb.net/:splat 301!',
  'http://www.trrb.net/* https://trrb.net/:splat 301!',
  'https://www.trrb.net/* https://trrb.net/:splat 301!',
  '/index.html / 301!',
  '/important /important-news 301!',
  '/hot /hot-headlines 301!',
  '/politics /us-politics 301!',
  '/crime /us-crime 301!',
  '/china /china-officialdom 301!',
  '/uscis /immigration 301!',
  '/dhs /immigration 301!',
  '/cbp /immigration 301!',
  '/visa /immigration 301!',
  '/world /important-news 301!',
  '/immigration-us /immigration 301!',
  '/asylum-guide /asylum 301!',
  '/important-news /listing.html?category=%E9%87%8D%E8%A6%81%E6%96%B0%E9%97%BB 200!',
  '/hot-headlines /listing.html?category=%E7%83%AD%E9%97%98%E5%A4%B4%E6%9D%A1 200!',
  '/asylum /listing.html?category=%E5%BA%87%E6%8A%A4%E7%99%BE%E7%A7%91 200!',
  '/immigration /listing.html?category=%E7%A7%BB%E6%B0%91%E7%BE%8E%E5%9B%BD 200!',
  '/ice /topic/ice/live-v6.html 200!',
  '/ice/ /ice 301!',
  '/ice/news /listing.html?category=ICE%E6%89%A7%E6%B3%95%E5%8A%A8%E6%80%81 200!',
  '/ice/news/ /ice/news 301!',
  '/topic/ice /ice 301!',
  '/topic/ice/ /ice 301!',
  '/trump/ /trump 301!',
  '/topic/trump /trump 301!',
  '/topic/trump/ /trump 301!'
];

const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
const filtered = lines.filter((line) => !required.some((rule) => line.split(/\s+/)[0] === rule.split(/\s+/)[0]));
fs.writeFileSync(file, [...required, ...filtered].join('\n') + '\n');
console.log(`[redirects] finalized ${required.length} canonical/special rules + ${filtered.length} generated rules`);

// Netlify's normal build still runs the homepage optimizer through this script,
// but scheduled metadata-only syncs can pass --redirects-only so they never
// leave an unstaged index.html change that blocks git pull --rebase/push.
if (!process.argv.includes('--redirects-only')) {
  await import('./optimize-homepage-performance.mjs');
}

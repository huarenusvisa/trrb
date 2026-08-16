import fs from 'node:fs';

const path='articles-home.js';
let s=fs.readFileSync(path,'utf8');
const from='const HOME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;';
const to='const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;';
if(s.includes(from)) s=s.replace(from,to);
else if(!s.includes(to)) throw new Error('Homepage freshness constant not found');
fs.writeFileSync(path,s);
console.log('HOME_FRESHNESS_DAYS=4');
console.log('HOMEPAGE_OLDER_THAN_4_DAYS_BLOCKED=true');

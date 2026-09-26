import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const path='scripts/seo-integrity-audit.mjs';
let text=readFileSync(path,'utf8');
if(text.includes('ACCOUNT_PROFILE_SHELLS_NOINDEX_V1')){console.log('Account/profile SEO contract already installed');process.exit(0);}
function once(before,after){if(text.split(before).length!==2)throw new Error('SEO source anchor changed: '+before.slice(0,80));text=text.replace(before,after);}
once('const INTENTIONAL_NOINDEX_HTML = new Set([','// ACCOUNT_PROFILE_SHELLS_NOINDEX_V1: session/private center and query-dependent profile shells.\nconst ACCOUNT_PROFILE_SHELLS = new Set(["user/index.html", "user/center/index.html"]);\nconst INTENTIONAL_NOINDEX_HTML = new Set([\n  ...ACCOUNT_PROFILE_SHELLS,');
once('const FORBIDDEN_SITEMAP_ROUTES = [','const FORBIDDEN_SITEMAP_ROUTES = [\n  /https:\\/\\/trrb\\.net\\/user(?:\\/|[?<]|$)/i,');
once('    if (is404) {','    if (ACCOUNT_PROFILE_SHELLS.has(name) && !/name=["\']robots["\'][^>]*noindex/i.test(html)) {\n      errors.push(`${name}: 账号与动态个人主页壳必须保留 noindex`);\n    }\n    if (is404) {');
writeFileSync(path,text);
const receipt=existsSync('.community-simple-media.json')?JSON.parse(readFileSync('.community-simple-media.json','utf8')):JSON.parse(readFileSync('scripts/community-simple-media-installation.json','utf8'));
receipt.changed_files=[...new Set([...receipt.changed_files,path])];receipt.profile_noindex_preserved=true;
writeFileSync('.community-simple-media.json',JSON.stringify(receipt,null,2));
console.log('SEO gate still checks public news and every local asset; account shells must be noindex and absent from sitemaps.');

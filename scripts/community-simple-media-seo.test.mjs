import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const audit=readFileSync('scripts/seo-integrity-audit.mjs','utf8');
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'community-seo-'));
 const write=(file,body)=>{mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),body);};
 const shell='<html lang="zh-CN"><head><title>用户页面</title><meta name="robots" content="noindex,follow"></head><body>需按用户和权限读取</body></html>';
 const index='<html lang="zh-CN"><head><title>新闻首页</title><meta name="robots" content="index,follow"><meta name="description" content="这是一段完整的公共新闻说明文字用于检验新闻搜索引擎收录规则"><link rel="canonical" href="https://trrb.net/"><meta property="og:title" content="新闻首页"></head><body><h1>新闻首页</h1></body></html>';
 write('audit.mjs',audit);write('index.html',index);write('user/index.html',shell);write('user/center/index.html',shell);write('404.html',shell);
 write('robots.txt','User-agent: *\nDisallow: /admin/\nSitemap: https://trrb.net/sitemap.xml\nSitemap: https://trrb.net/news-sitemap.xml\n');
 write('sitemap.xml','<urlset><url><loc>https://trrb.net/</loc></url></urlset>');write('news-sitemap.xml','<urlset/>');write('feed.xml','<rss/>');
 write('netlify/edge-functions/xi-topic.ts','const routes={"/xijinping":1,"/china-politics":1,"/iceandpolice":1,"/midterm-elections":1};export const config = { path: ["/xijinping","/china-politics","/iceandpolice","/midterm-elections"] };');
 write('netlify/edge-functions/sitemap-live.ts','// live-supabase-v10-uncapped-diagnostic /_internal/sitemap-live.xml');
 const run=()=>{const result=spawnSync(process.execPath,['audit.mjs'],{cwd:dir,env:{...process.env,NETLIFY:'false'},encoding:'utf8'});return {status:result.status,report:JSON.parse(readFileSync(join(dir,'seo-audit-report.json'),'utf8')),output:result.stdout+result.stderr};};
 return {dir,write,shell,index,run,close:()=>rmSync(dir,{recursive:true,force:true})};
}
test('real strict SEO audit accepts both intentionally noindex shells without adding public canonical tags',()=>{const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.output);assert.deepEqual(r.report.errors,[]);}finally{f.close();}});
test('account/profile shell accidentally made indexable still fails',()=>{const f=fixture();try{f.write('user/center/index.html',f.shell.replace('noindex','index'));const r=f.run();assert.equal(r.status,1);assert.ok(r.report.errors.some(e=>e.includes('必须保留 noindex')));}finally{f.close();}});
test('public news missing canonical still fails and a new arbitrary noindex page is not exempted',()=>{const f=fixture();try{f.write('index.html',f.index.replace(/<link[^>]+>/,''));f.write('another-public-page.html',f.shell);const r=f.run();assert.equal(r.status,1);assert.ok(r.report.errors.some(e=>e.includes('index.html: 缺少 canonical')));assert.ok(r.report.errors.some(e=>e.includes('another-public-page.html: 应索引')));}finally{f.close();}});
test('broken assets in private center and accidental profile sitemap entries still fail',()=>{const f=fixture();try{f.write('user/center/index.html',f.shell.replace('</body>','<script src="/missing.js"></script></body>'));f.write('sitemap.xml','<urlset><url><loc>https://trrb.net/user/center/</loc></url></urlset>');const r=f.run();assert.equal(r.status,1);assert.ok(r.report.errors.some(e=>e.includes('missing.js')));assert.ok(r.report.errors.some(e=>e.includes('包含 noindex')));}finally{f.close();}});

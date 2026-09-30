import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const p='scripts/article-search-pin.test.mjs';let s=readFileSync(p,'utf8');
const start="test('fully verified index opt-in uses bound RPC arguments and safe public projection'";
const end="test('public query always excludes drafts, private, withdrawn and future publications'";
if(s.includes(start)){
 const a=s.indexOf(start),b=s.indexOf(end,a);if(b<0)throw new Error('Test transition anchor changed');
 s=s.slice(0,a)+`test('retired experimental index cannot be accidentally re-enabled',()=>{
 const spec=listRequest({q:'倒习',status:'hidden'},{publicOnly:true,indexReady:true,now:start});
 assert.equal(spec.resource,'articles');assert.equal(spec.options.query.status,'eq.published');assert.doesNotMatch(spec.options.query.select,/metadata|content|visibility/);
 assert.doesNotMatch(readFileSync('netlify/functions/_shared/article-list-reader.js','utf8'),/rpc\\/trrb_search_articles_v2/);
});
`+s.slice(b);writeFileSync(p,s);
}
const record=existsSync('.article-search-pin-change.json')?'.article-search-pin-change.json':'scripts/article-search-pin-installation.json';
const r=JSON.parse(readFileSync(record,'utf8'));
if(!r.changed_files.includes(p))r.changed_files.push(p);
delete r.full_text_rollout_blocked;
r.experimental_index_retired=true;
r.database_read_write_rechecked_at='2026-09-30T04:37:45Z';
r.database_pin_transaction_tests={pin:true,cancel:true,ttl_hours:48,ordinary_edit_does_not_renew:true,content_and_publication_time_preserved:true,rolled_back:true};
writeFileSync('.article-search-pin-change.json',JSON.stringify(r,null,2));

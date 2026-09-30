import {readFileSync,writeFileSync} from 'node:fs';
const r=JSON.parse(readFileSync('.article-search-pin-change.json','utf8'));
function patch(path,from,to){const s=readFileSync(path,'utf8');if(s.split(from).length!==2)throw new Error('Expected one finish anchor: '+path+' '+from.slice(0,70));writeFileSync(path,s.replace(from,to));if(!r.changed_files.includes(path))r.changed_files.push(path);}
patch('scripts/article-search-pin.e2e.mjs','<div id="count-articles"></div><div id="count-published"></div><div id="count-draft"></div>','<article><strong id="count-articles"></strong><span></span></article><article><strong id="count-published"></strong><span></span></article><article><strong id="count-draft"></strong><span></span></article>');
patch('netlify/functions/_shared/article-partition-search.js',"select:'id,published_at,created_at'","select:spec.pinnedOnly?'id,published_at,created_at,homepage_pinned_at':'id,published_at,created_at'");
patch('netlify/functions/_shared/article-partition-search.js','const all=[...matches.values()].sort(compare);','const all=[...matches.values()].sort((a,b)=>(spec.pinnedOnly?(timestamp(b.homepage_pinned_at)-timestamp(a.homepage_pinned_at)):0)||compare(a,b));');
patch('netlify/functions/_shared/article-partition-search.js','const offset=(spec.page-1)*spec.pageSize;','const offset=Number(spec.query.offset);');
patch('netlify/functions/public-articles.js',"{q,category:category||null,page:Math.floor(offset/limit)+1,page_size:limit}","{q,category:category||null,offset,page_size:limit}");
patch('netlify/functions/public-articles.js','count:result.articles.length,offset,limit,next_offset:result.has_more?offset+limit:null','count:result.articles.length,offset,limit:result.page_size,next_offset:result.has_more?offset+result.page_size:null');
patch('listing.js','  }, 15000);','  }, 30000);');
r.search_strategy='Complete full-body matching across 16 indexed UUID ranges, 2 workers; explicit title/summary fallback only if a range fails.';
r.database_writes_for_search=0;
r.full_text_rollout_blocked='Persisted experimental index is not activated; primary-key range searches do not depend on it.';
writeFileSync('.article-search-pin-change.json',JSON.stringify(r,null,2));

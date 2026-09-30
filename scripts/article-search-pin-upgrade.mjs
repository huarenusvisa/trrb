import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const changes=new Map();const read=p=>changes.has(p)?changes.get(p):readFileSync(p,'utf8');
function once(p,a,b){const s=read(p);if(s.split(a).length!==2)throw new Error('Patch anchor changed: '+p+' '+a.slice(0,100));changes.set(p,s.replace(a,b));}
function section(p,a,b,replacement){const s=read(p),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+a.length)>=0)throw new Error('Section changed: '+p);changes.set(p,s.slice(0,i)+replacement+'\n\n'+s.slice(j));}
const admin='netlify/functions/admin-articles.js',ui='admin/admin-publisher-v2.js',home='netlify/functions/public-home-focus.ts',pub='netlify/functions/public-article-search.ts',legacy='netlify/functions/public-articles.js';
const known={
 [admin]:'47e3ec5da1195e06e08caac17ce438d353529e2b',
 [home]:'5dc42196f8be1efee0bf92db24034fd0ef4acec2',
 [pub]:'aabc3406ac885e9ee9d5395e97dec0e668e0eb9d',
 [legacy]:'0043e88ec5c3856a521738cb8c2cda4f74683b08',
 'admin/index.html':'439cc57c9eb75f3fb30811c4ff68927b694998f4',
 'listing.js':'000784e0ef6150bfccfaf44455092b152ade9080'
};
for(const [p,sha]of Object.entries(known))if(execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()!==sha)throw new Error('Stop: concurrent source modification '+p);
once(admin,'const ALLOWED_STATUS =',"const { readArticleList, publicDatabaseError } = require('./_shared/article-list-reader');\nconst ALLOWED_STATUS =");
section(admin,'async function listArticles(input) {','async function updateStatus(input) {',`async function listArticles(input) {
  const result=await readArticleList(input,{},rest);
  return {...result,articles:result.articles.map(row=>({...row,category_label:articleCategoryLabel(row)}))};
}

async function setPin(input,actor){
  const id=safeText(input.article_id,100),mode=safeText(input.mode,20);
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)||!['force','auto','exclude'].includes(mode)){const e=new Error('无效的文章或置顶操作');e.statusCode=400;throw e;}
  const rows=await rest('rpc/trrb_set_homepage_pin',{method:'POST',query:{select:'id,title,status,visibility,published_at,created_at,hidden_at,archived_at,metadata,homepage_pinned_at,homepage_pin_expires_at'},body:{p_article_id:id,p_mode:mode,p_actor:actor.user.id}});
  if(!rows?.[0])throw new Error('未收到置顶保存确认，请刷新检查');
  return {article:rows[0],pin:require('../../article-pin-policy').pinState(rows[0]),message:mode==='force'?'已置顶，48小时后自动取消':mode==='auto'?'已取消置顶，恢复正常排序':'已设为不推荐'};
}`);
once(admin,'    if (action === "list") return json(200, await listArticles(input));','    if (action === "list") return json(200, await listArticles(input));\n    if (action === "pin") return json(200, await setPin(input,actor));');
once(admin,'    const payload = { error: error.message || String(error) };',"    const known=publicDatabaseError(error);\n    if(known)return json(known.status,{error:known.message,code:known.code});\n    const payload = { error: error.message || String(error) };");
once(pub,"import { articleListQuery } from './_shared/article-search.js';","import reader from './_shared/article-list-reader.js';");
section(pub,'    const { query, page, pageSize, text, emptySearch } =','    return new Response(request.method',"    const result = await reader.readArticleList(input,{publicOnly:true},rest);");
// The existing APP search endpoint gets the same fast, explicitly labelled fallback.
once(legacy,'function cleanSearch(value) {',"const {readArticleList}=require('./_shared/article-list-reader');\n\nfunction cleanSearch(value) {");
once(legacy,'    const query = {',`    if(q){
      const result=await readArticleList({q,category:category||null,page:Math.floor(offset/limit)+1,page_size:limit},{publicOnly:true},rest);
      return json(200,{...result,generated_at:new Date().toISOString(),count:result.articles.length,offset,limit,next_offset:result.has_more?offset+limit:null,category:category||null,q});
    }
    const query = {`);
once(home,'import policy from "../../article-editorial-policy.js";','import policy from "../../article-editorial-policy.js";\nimport pins from "../../article-pin-policy.js";');
section(home,'function overrideOf(row) {','const textLength =',`function overrideOf(row) { return pins.effectiveMode(row); }`);
once(home,'id,title,slug,publication_path,summary,content,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,is_featured,is_breaking,rank_score,metadata','id,title,slug,publication_path,summary,content,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,is_featured,is_breaking,rank_score,metadata,homepage_pinned_at,homepage_pin_expires_at,hidden_at,archived_at');
once(home,'      visibility: "eq.public",','      visibility: "eq.public",\n      hidden_at: "is.null", archived_at: "is.null",');
once(home,'          metadata: `cs.{"homepage_focus_override":"${MANUAL_FORCE}"}`,','          published_at: undefined,\n          metadata: `cs.{"homepage_focus_override":"${MANUAL_FORCE}"}`,\n          homepage_pin_expires_at: `gt.${new Date().toISOString()}`,');
// Do not pass undefined to the REST serializer: create the editor query without the age key.
once(home,'          published_at: undefined,','          published_at: `lte.${new Date().toISOString()}`,');
once(home,'.filter((row) => timeOf(row) >= now - HOME_MAX_AGE_MS && timeOf(row) <= now)','.filter((row) => (pins.isPinned(row,now) || timeOf(row) >= now - HOME_MAX_AGE_MS) && timeOf(row) <= now)');
once(home,'    homepage_focus_source: isManualFocus(row) ?','    homepage_pin: pins.pinState(row),\n    homepage_focus_source: isManualFocus(row) ?');
once(home,'      max_age_hours: HOME_MAX_AGE_HOURS,','      max_age_hours: HOME_MAX_AGE_HOURS,\n      manual_pin_hours: 48,');
// Public / admin controls share the same clock. No direct metadata overwrite in browser.
once(ui,'    const focusMode = String(metadata.homepage_focus_override || "auto");','    const pin = window.TrrbArticlePins.pinState(article);\n    const focusMode = pin.mode;');
once(ui,'${escapeHtml(focusModeLabel(focusMode))}</small>','${escapeHtml(focusModeLabel(focusMode))}</small>${pin.active ? `<br><small>到期：${escapeHtml(formatDate(pin.expires_at))}（48小时）</small>` : ""}');
once(ui,`          <button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','force')">首页置顶</button>
          <button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','auto')">自动推荐</button>`, `          \${pin.active ? \`<button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','auto')">取消置顶</button>\` : \`<button class="small-btn" \${article.status!=='published'||article.visibility!=='public'?'disabled':''} onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','force')">置顶48小时</button>\`}
          <button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','auto')">恢复自动推荐</button>`);
section(ui,'  window.setHomepageFocusMode = async function setHomepageFocusMode(id, mode) {','  handleSaveArticle = async function',`  window.setHomepageFocusMode = async function setHomepageFocusMode(id, mode) {
    try {
      const result=await publisherApi('pin',{article_id:id,mode});
      await loadArticles();
      el('articles-pin-notice').textContent=result.message||'设置已保存';
    } catch(error){el('articles-pin-notice').textContent=error.message;}
  };`);
once(ui,'      el("articles-list-note").textContent = articleSearch','      el("articles-list-note").textContent = articleStatus === "pinned" ? `仅显示尚未到期的置顶文章，不受72小时列表限制；每条从置顶操作起算48小时，第${articlePage}页。` : articleSearch');
once(ui,'      el("articles-pagination").innerHTML = `${articlePage > 1', '      if(result.search_notice)el("articles-list-note").textContent += " " + result.search_notice;\n      el("articles-pagination").innerHTML = `${articlePage > 1');
once(ui,'      el("articles-list-note").textContent = "查询失败，请重试。";','      el("articles-list-note").textContent = "查询失败，不代表文章不存在。";');
const ah='admin/index.html';
once(ah,'<option value="hidden">已隐藏</option></select><button type="submit">搜索</button>','<option value="hidden">已隐藏</option><option value="pinned">已置顶</option></select><button type="submit">搜索</button>');
once(ah,'placeholder="输入标题、正文关键词或文章ID"','placeholder="输入新闻关键词或文章ID"');
once(ah,'<nav id="articles-pagination"','<p id="articles-pin-notice" role="status" aria-live="polite"></p><nav id="articles-pagination"');
let html=read(ah);const script=/<script\b[^>]*src=["'][^"']*admin-publisher-v2\.js[^"']*["'][^>]*><\/script>/g;
if([...html.matchAll(script)].length!==1)throw new Error('Publisher loader changed');
html=html.replace(script,tag=>'<script src="/article-pin-policy.js?v=20260930-48h"></script>\n'+tag.replace(/admin-publisher-v2\.js[^"']*/,'admin-publisher-v2.js?v=20260930-search-pin'));
changes.set(ah,html);
once('listing.js','      renderArticles(result.articles, 1);',`      renderArticles(result.articles, 1);
      let notice=document.getElementById('search-scope-notice');
      if(!notice){notice=document.createElement('p');notice.id='search-scope-notice';notice.setAttribute('role','status');document.querySelector('#listing-grid').before(notice);}
      notice.textContent=result.search_notice||'';notice.hidden=!result.search_notice;`);
for(const [p,s]of changes){if(p.endsWith('.js'))new Function(s);writeFileSync(p,s);}
writeFileSync('.article-search-pin-change.json',JSON.stringify({changed_files:[...changes.keys()],version:'20260930-search-pin',index_ready:false,full_text_rollout_blocked:'Database entered global read-only protection during backfill; never enable partial index',old_articles_deleted:false},null,2));
console.log(JSON.stringify({event:'article-search-pin-integrated',changed_files:[...changes.keys()]}));

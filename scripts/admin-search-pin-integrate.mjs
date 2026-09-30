import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const changed=new Map();
const read=p=>changed.has(p)?changed.get(p):readFileSync(p,'utf8');
function once(p,a,b){const s=read(p);if(s.split(a).length!==2)throw new Error(`Expected exactly one source anchor: ${p}: ${a.slice(0,80)}`);changed.set(p,s.replace(a,b));}
function section(p,a,b,replacement){const s=read(p),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)>=0)throw new Error('Ambiguous section '+p);changed.set(p,s.slice(0,i)+replacement+'\n\n'+s.slice(j));}
const api='netlify/functions/admin-articles.js',ui='admin/admin-publisher-v2.js',pub='netlify/functions/public-article-search.ts',home='netlify/functions/public-home-focus.ts';
for(const [p,sha] of [[api,'47e3ec5da1195e06e08caac17ce438d353529e2b'],[ui,'537c0026d22b449f0dc55b6d1904be9da207218c'],[pub,'aabc3406ac885e9ee9d5395e97dec0e668e0eb9d'],[home,'5dc42196f8be1efee0bf92db24034fd0ef4acec2']])if(execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()!==sha)throw new Error('Source changed, reconcile before applying: '+p);
once(api,'const { articleListQuery, articleCategoryLabel } = require("./_shared/article-search");','const { listManagedArticles, setManagedArticlePin } = require("./_shared/article-admin-actions");\nconst { publicDatabaseError } = require("./_shared/article-list-reader");');
section(api,'async function listArticles(input) {','async function updateStatus(input)','async function listArticles(input) {\n  return listManagedArticles(input,rest);\n}');
once(api,'    if (action === "list") return json(200, await listArticles(input));','    if (action === "list") return json(200, await listArticles(input));\n    if (action === "pin") return json(200, await setManagedArticlePin(input,actor,rest));');
once(api,'    const payload = { error: error.message || String(error) };','    const databaseError=publicDatabaseError(error);\n    if(databaseError)return json(databaseError.status,{error:databaseError.message,code:databaseError.code});\n    const payload = { error: error.message || String(error) };');
once(ui,'    const focusMode = String(metadata.homepage_focus_override || "auto");','    const pin=window.TrrbArticlePins.pinState(article);\n    const focusMode=pin.mode;');
once(ui,'      <tr>\n        <td><b>${escapeHtml(article.title)}</b>','      <tr data-article-row="${escapeAttr(article.id)}">\n        <td><b>${escapeHtml(article.title)}</b>');
once(ui,'${escapeHtml(focusModeLabel(focusMode))}</small></td>','${escapeHtml(focusModeLabel(focusMode))}</small>${pin.active?`<br><small>到期：${escapeHtml(formatDate(pin.expires_at))}（48小时）</small>`:""}</td>');
once(ui,'          <button class="small-btn" onclick="setHomepageFocusMode(\'${escapeAttr(article.id)}\',\'force\')">首页置顶</button>\n          <button class="small-btn" onclick="setHomepageFocusMode(\'${escapeAttr(article.id)}\',\'auto\')">自动推荐</button>',`          \${pin.active ? \`<button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','auto')">取消置顶</button>\` : \`<button class="small-btn" \${article.status!=='published'||article.visibility!=='public'?'disabled':''} onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','force')">置顶48小时</button>\`}
          <button class="small-btn" onclick="setHomepageFocusMode('\${escapeAttr(article.id)}','auto')">恢复自动推荐</button>`);
once(ui,'  let articlePage = 1;','  let articleRows = new Map();\n  const pendingPinActions = new Set();\n  let articlePage = 1;');
once(ui,'      const articles = result.articles || [];','      const articles = result.articles || [];\n      articleRows = new Map(articles.map(row=>[row.id,row]));');
once(ui,'el("articles-list-note").textContent = articleSearch','el("articles-list-note").textContent = articleStatus === "pinned" ? `仅显示尚未到期的置顶文章，不受72小时列表限制；每条从置顶操作起算48小时，第${articlePage}页。` : articleSearch');
once(ui,'      el("articles-pagination").innerHTML = `${articlePage','      if(result.search_notice)el("articles-list-note").textContent += " " + result.search_notice;\n      el("articles-pagination").innerHTML = `${articlePage');
once(ui,'"查询失败，请重试。"','"查询失败，不代表文章不存在。"');
section(ui,'  window.setHomepageFocusMode = async function setHomepageFocusMode(id, mode) {','  handleSaveArticle =',`  window.setHomepageFocusMode = async function setHomepageFocusMode(id, mode) {
    if(pendingPinActions.has(id)||!['force','auto','exclude'].includes(mode))return;
    const article=articleRows.get(id);
    const title=article?.title || '这篇文章';
    const message=mode==='force'
      ? '确定将「'+title+'」置顶吗？从本次设置起48小时后自动取消，不会因编辑文章而延长。'
      : mode==='auto'
        ? '确定取消「'+title+'」的置顶并恢复自动推荐吗？文章仍然保留并公开。'
        : '确定取消「'+title+'」的置顶并设为不推荐吗？文章不会被删除。';
    if(!window.confirm(message))return;
    pendingPinActions.add(id);
    const notice=el('articles-pin-notice');
    const row=Array.from(document.querySelectorAll('[data-article-row]')).find(r=>r.dataset.articleRow===id);
    const buttons=Array.from(row?.querySelectorAll('button')||[]).map(b=>({button:b,disabled:b.disabled}));
    buttons.forEach(({button})=>button.disabled=true);
    notice.textContent='正在保存，请稍候…';
    try {
      const result=await publisherApi('pin',{article_id:id,mode});
      await loadArticles();
      notice.textContent=(result.message||'设置已保存')+(result.pin?.active&&result.pin.expires_at?' 到期时间：'+formatDate(result.pin.expires_at):'');
    } catch(error){notice.textContent='保存失败：'+error.message;}
    finally{pendingPinActions.delete(id);buttons.forEach(({button,disabled})=>button.disabled=disabled);}
  };`);
const html='admin/index.html';
once(html,'<option value="hidden">已隐藏</option></select>','<option value="hidden">已隐藏</option><option value="pinned">已置顶</option></select>');
once(html,'<nav id="articles-pagination"','<p id="articles-pin-notice" role="status" aria-live="polite"></p><nav id="articles-pagination"');
const before=read(html),matches=[...before.matchAll(/<script\s+src="\.\/admin-publisher-v2\.js\?v=[^"]+"><\/script>/g)];
if(matches.length!==1)throw new Error('Expected one active admin publisher script');
changed.set(html,before.replace(matches[0][0],'<script src="/article-pin-policy.js?v=20260930-search-pin-1"></script>\n<script src="./admin-publisher-v2.js?v=20260930-search-pin-1"></script>'));
once(pub,"import { articleListQuery } from './_shared/article-search.js';","import reader from './_shared/article-list-reader.js';");
section(pub,'    const { query, page, pageSize, text, emptySearch } =','    return new Response(',"    const result=await reader.readArticleList(input,{publicOnly:true},rest);");
once(home,'import policy from "../../article-editorial-policy.js";','import policy from "../../article-editorial-policy.js";\nimport pins from "../../article-pin-policy.js";');
section(home,'function overrideOf(row) {','const textLength =','function overrideOf(row) { return pins.effectiveMode(row); }');
once(home,'    homepage_focus_source:','    homepage_pin: pins.pinState(row),\n    homepage_focus_source:');
once(home,'rank_score,metadata";','rank_score,metadata,homepage_pinned_at,homepage_pin_expires_at,hidden_at,archived_at";');
once(home,'      visibility: "eq.public",','      visibility: "eq.public",\n      hidden_at: "is.null", archived_at: "is.null",');
once(home,'          metadata: `cs.{"homepage_focus_override":"${MANUAL_FORCE}"}`,','          published_at: `lte.${new Date().toISOString()}`,\n          metadata: `cs.{"homepage_focus_override":"${MANUAL_FORCE}"}`,\n          homepage_pin_expires_at: `gt.${new Date().toISOString()}`,');
once(home,'.filter((row) => timeOf(row) >= now - HOME_MAX_AGE_MS && timeOf(row) <= now)','.filter((row) => (pins.isPinned(row,now) || timeOf(row) >= now - HOME_MAX_AGE_MS) && timeOf(row) <= now)');
once(home,'      max_age_hours: HOME_MAX_AGE_HOURS,','      max_age_hours: HOME_MAX_AGE_HOURS,\n      manual_pin_hours: 48,');
for(const [p,s] of changed){writeFileSync(p,s);if(p.endsWith('.js'))execFileSync('node',['--check',p],{stdio:'inherit'});}
writeFileSync('.admin-search-pin-apply.json',JSON.stringify({changed_files:[...changed.keys()],version:'admin-search-pin-20260930-v1',database_changes:false,history_mutations:false},null,2));
console.log('Committed-source admin/public search and homepage pin rules integrated; no database writes.');

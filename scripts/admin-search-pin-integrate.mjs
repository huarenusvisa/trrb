import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const changed=new Map();
const read=p=>changed.has(p)?changed.get(p):readFileSync(p,'utf8');
function once(p,a,b){const s=read(p);if(s.split(a).length!==2)throw new Error(`Expected exactly one source anchor: ${p}: ${a.slice(0,80)}`);changed.set(p,s.replace(a,b));}
function section(p,a,b,replacement){const s=read(p),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)>=0)throw new Error('Ambiguous section '+p);changed.set(p,s.slice(0,i)+replacement+'\n\n'+s.slice(j));}
const api='netlify/functions/admin-articles.js',ui='admin/admin-publisher-v2.js';
for(const [p,sha] of [[api,'47e3ec5da1195e06e08caac17ce438d353529e2b'],[ui,'11ef5e9800a0ce9891f0dee2c49a73f0027a2072']])if(execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()!==sha)throw new Error('Source changed, reconcile before applying: '+p);
once(api,'const { articleListQuery, articleCategoryLabel } = require("./_shared/article-search");','const { listManagedArticles, setManagedArticlePin } = require("./_shared/article-admin-actions");\nconst { publicDatabaseError } = require("./_shared/article-list-reader");');
section(api,'async function listArticles(input) {','async function updateStatus(input)',`async function listArticles(input) {
  return listManagedArticles(input,rest);
}`);
once(api,'    if (action === "list") return json(200, await listArticles(input));','    if (action === "list") return json(200, await listArticles(input));\n    if (action === "pin") return json(200, await setManagedArticlePin(input,actor,rest));');
once(api,'    const payload = { error: error.message || String(error) };','    const databaseError=publicDatabaseError(error);\n    if(databaseError)return json(databaseError.status,{error:databaseError.message,code:databaseError.code});\n    const payload = { error: error.message || String(error) };');
once(ui,'      <tr>\n        <td><b>${escapeHtml(article.title)}</b>','      <tr data-article-row="${escapeAttr(article.id)}">\n        <td><b>${escapeHtml(article.title)}</b>');
once(ui,'  let articlePage = 1;','  let articleRows = new Map();\n  const pendingPinActions = new Set();\n  let articlePage = 1;');
once(ui,'      const articles = result.articles || [];','      const articles = result.articles || [];\n      articleRows = new Map(articles.map(row=>[row.id,row]));');
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
const before=read(html),matches=[...before.matchAll(/admin-publisher-v2\.js\?v=[^"']+/g)];
if(matches.length!==1)throw new Error('Expected one active admin publisher script');
changed.set(html,before.replace(matches[0][0],'admin-publisher-v2.js?v=20260930-search-pin-1'));
for(const [p,s] of changed){writeFileSync(p,s);if(p.endsWith('.js'))execFileSync('node',['--check',p],{stdio:'inherit'});}
writeFileSync('.admin-search-pin-apply.json',JSON.stringify({changed_files:[...changed.keys()],version:'admin-search-pin-20260930-v1',database_changes:false,history_mutations:false},null,2));
console.log('Admin list, pin and confirmation handlers integrated; no database writes.');

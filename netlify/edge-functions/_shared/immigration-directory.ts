import {IMMIGRATION_KNOWLEDGE_ROUTES,immigrationCategory,immigrationTopic} from './immigration-knowledge-routes.ts';
function esc(value: string) {return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function href(path: string, topic?: string) {return esc(`/immigrate/center?path=${encodeURIComponent(path)}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`);}
// Fill existing visible slots. The same directory is delivered to readers and crawlers.
export function renderImmigrationDirectory(html: string,url: URL): string {
  const path=url.pathname.replace(/\/$/,'');
  if(path==='/immigrate' || path==='/immigrate/index.html') {
    const cards=IMMIGRATION_KNOWLEDGE_ROUTES.map((cat,i)=>`<article class="pathway-card"><span class="pathway-number">0${i+1}</span><h3><a href="${href(cat.slug)}">${esc(cat.name)}</a></h3><p>${esc(cat.description)}</p><div class="pathway-tags">${cat.topics.map(t=>`<a href="${href(cat.slug,t.slug)}">${esc(t.name)}</a>`).join('')}</div><a class="pathway-action" href="${href(cat.slug)}">进入知识中心 →</a></article>`).join('');
    return html.replace(/(<div\b[^>]*\bid="pathway-grid"[^>]*>)\s*<\/div>/,`$1${cards}</div>`);
  }
  if(path!=='/immigrate/center' && path!=='/immigrate/center.html')return html;
  const cat=immigrationCategory(url.searchParams.get('path') || '');
  if(!cat)return html;
  const topic=immigrationTopic(cat,url.searchParams.get('topic') || '');
  const name=topic?.name || cat.name;
  const links=cat.topics.map(t=>`<a href="${href(cat.slug,t.slug)}"${topic?.slug===t.slug ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`).join('');
  return html
    .replace(/(<h1\b[^>]*\bid="center-title"[^>]*>)[\s\S]*?<\/h1>/,`$1${esc(name)}知识中心</h1>`)
    .replace(/(<p\b[^>]*\bid="center-description"[^>]*>)[\s\S]*?<\/p>/,`$1${esc(cat.description)}</p>`)
    .replace(/(<nav\b[^>]*\bid="breadcrumbs"[^>]*>)[\s\S]*?<\/nav>/,`$1<a href="/immigrate/">移民美国知识库</a> / <a href="${href(cat.slug)}">${esc(cat.name)}</a>${topic ? ` / ${esc(topic.name)}` : ''}</nav>`)
    .replace(/(<nav\b[^>]*\bid="topic-nav"[^>]*>)[\s\S]*?<\/nav>/,`$1${links}</nav>`)
    .replace(/(<section\b[^>]*\bid="topic-overview"[^>]*>)\s*<\/section>/,`$1<h2>${esc(name)}</h2><p>${esc(cat.description)}</p><p>选择下方目录查看具体专题，或返回<a href="/immigrate/">移民美国知识库</a>浏览其他赴美路径。</p></section>`);
}

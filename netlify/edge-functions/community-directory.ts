function esc(value: unknown): string {return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
export default async (request: Request, context: any) => {
  if(request.method!=='GET')return context.next();
  const url=new URL(request.url);
  // Leave detail and personalized views to their existing handlers.
  if(url.search)return context.next();
  const upstream=await context.next();
  if(!upstream.ok || !/text\/html/i.test(upstream.headers.get('content-type') || ''))return upstream;
  let cards='';
  try {
    // An anonymous request only; never forward cookies, authorization or viewer state.
    const response=await fetch(new URL('/.netlify/functions/community-api?limit=20',url.origin),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4000)});
    if(response.ok) {
      const data=await response.json();
      if(Array.isArray(data.posts))cards=data.posts.filter((post:any)=>post.status==='published' && post.is_indexable===true && typeof post.id==='string').slice(0,12).map((post:any)=>`<article class="note-card"><a class="note-text-cover" href="/community/?post=${encodeURIComponent(post.id)}"><strong>${esc(post.title)}</strong><p>${esc(String(post.content || '').slice(0,160))}</p></a></article>`).join('');
    }
  } catch(error) {console.warn('Public community directory temporarily unavailable');}
  let html=await upstream.text();
  html=html.replace('<h1 id="feed-title">推荐内容</h1>','<h1 id="feed-title">美国移民社区</h1>');
  html=html.replace('<div id="post-feed" class="post-feed mixed-feed"></div>',`<div id="post-feed" class="post-feed mixed-feed">${cards}</div>`);
  const headers=new Headers(upstream.headers);
  headers.delete('content-length');headers.delete('etag');
  headers.set('cache-control','no-store');
  headers.set('x-trrb-community-directory',cards ? 'public-posts' : 'empty');
  return new Response(html,{status:upstream.status,headers});
};
export const config={path:['/community/','/community','/community/index.html']};

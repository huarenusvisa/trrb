const SOURCE_HOST = 'chinesebooks.github.io';

function allowed(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === SOURCE_HOST && /\.(?:html?)$|\/$/i.test(url.pathname);
  } catch { return false; }
}

const entities = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
const decode = (value = '') => String(value).replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v.replace(/^x/i,''),/^x/i.test(v)?16:10))).replace(/&([a-z]+);/gi,(m,n)=>entities[n.toLowerCase()]??m);
const clean = (value = '') => decode(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p\s*>/gi,'\n\n').replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const attr = (tag, name) => decode(String(tag).match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`,'i'))?.[1] || '');
const absolute = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };

exports.handler = async (event) => {
  const source = event.queryStringParameters?.source || '';
  if (!allowed(source)) return { statusCode: 400, body: JSON.stringify({ error: 'invalid_source' }) };
  try {
    const response = await fetch(source, { headers: { 'user-agent':'TangRenDaily-LibraryReader/1.0', accept:'text/html' }, signal:AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const article = html.match(/<div\b[^>]*id=["']articleContent["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    let payload;
    if (article != null) {
      const title = clean(html.match(/<h1\b[^>]*class=["'][^"']*h11[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '正文');
      const paragraphs = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((item)=>clean(item[1])).filter(Boolean);
      payload = { type:'chapter', title, content:paragraphs.length ? paragraphs.join('\n\n') : clean(article), source_url:source };
    } else {
      const title = clean(html.match(/<h2\b[^>]*class=["'][^"']*articleH22[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '图书');
      const description = clean(html.match(/<p\b[^>]*class=["'][^"']*des[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
      const coverTag = html.match(/<div\b[^>]*class=["'][^"']*bookDes[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/i)?.[0] || '';
      const index = html.match(/<div\b[^>]*class=["'][^"']*index_list[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
      const chapters = [...index.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((item)=>({ title:clean(item[2]), source_url:absolute(attr(`<a ${item[1]}>`,'href'),source) })).filter((item)=>allowed(item.source_url));
      payload = { type:'book', title, description, cover:absolute(attr(coverTag.match(/<img\b[^>]*>/i)?.[0] || '','src'),source), chapters, source_url:source };
    }
    return { statusCode:200, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'public, max-age=3600, stale-while-revalidate=86400', 'access-control-allow-origin':'*' }, body:JSON.stringify(payload) };
  } catch (error) {
    return { statusCode:502, headers:{'content-type':'application/json; charset=utf-8'}, body:JSON.stringify({ error:'source_unavailable', message:error.message }) };
  }
};

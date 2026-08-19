export const config = {
  path: [
    "/people",
    "/people/",
    "/people/index.html",
    "/people/detail.html",
    "/.netlify/functions/public-people"
  ]
};

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-trrb-retired-product": "people-r1-gone-v1"
};

export default async (request: Request) => {
  const url = new URL(request.url);
  if (url.pathname === "/.netlify/functions/public-people") {
    return new Response(request.method === "HEAD" ? null : JSON.stringify({
      error: "gone",
      product: "PEOPLE-R1",
      status: 410
    }), {
      status: 410,
      headers: { ...headers, "content-type": "application/json; charset=UTF-8" }
    });
  }

  const body = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>页面已下线｜唐人日报</title></head><body><main><h1>该栏目已下线</h1><p>唐人日报华人人物产品已停止公开服务。</p><p><a href="/">返回唐人日报首页</a></p></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 410,
    headers: { ...headers, "content-type": "text/html; charset=UTF-8" }
  });
};

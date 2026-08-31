const HOST = "huarengongzuo.com";
const KEY = "55d15283c33385e09b4f3fae7562a9cc";

export const config = { path: `/${KEY}.txt` };

export default (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  if (new URL(request.url).hostname.toLowerCase() !== HOST) return context.next();
  return new Response(request.method === "HEAD" ? null : `${KEY}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "public, max-age=86400",
      "x-hg-indexnow-key": "v1"
    }
  });
};

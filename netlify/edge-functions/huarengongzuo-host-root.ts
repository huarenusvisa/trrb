export default function huarengongzuoHostRoot(request: Request) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== "huarengongzuo.com") return;

  const target = new URL("/huarengongzuo/index.html", request.url);
  target.search = url.search;
  return target;
}

export const config = {
  path: "/",
  method: ["GET", "HEAD"],
  onError: "bypass"
};

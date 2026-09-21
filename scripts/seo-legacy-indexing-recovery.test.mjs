import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

function load(name) {
  let source = readFileSync(new URL(`../netlify/edge-functions/${name}.ts`, import.meta.url), "utf8");
  source = source
    .replace(/^import .*;\n/gm, "")
    .replace("export const config", "const config")
    .replace("export default async", "globalThis.handler = async");
  const context = vm.createContext({ URL, Request, Response, console, Set });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context.handler;
}

test("Tang Ren Daily domains preserve path and query while redirecting to trrb.net", async () => {
  const handler = load("00-host-canonical");
  for (const host of ["tangrenribao.com", "www.tangrenribao.com", "www.trrb.net"]) {
    const response = await handler(new Request(`https://${host}/ice/news?from=old-domain`), {
      next() { throw new Error("Alias host must not fall through"); }
    });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://trrb.net/ice/news?from=old-domain");
  }
});

test("legacy WordPress archives are retired before article routing", async () => {
  const handler = load("01-wordpress-archive-retire");
  const paths = [
    "/page/855/",
    "/author/admin/page/247/",
    "/category/chinanews/page/189/",
    "/category/https-www-trrb-cc-cat8/0/page/2003/",
    "/tag/美墨边境/"
  ];
  for (const path of paths) {
    const response = await handler(new Request(`https://trrb.net${path}`), {
      next() { throw new Error(`Legacy archive fell through: ${path}`); }
    });
    assert.equal(response.status, 410);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  }
});

test("legacy hotnews archive redirects to the current headline hub", async () => {
  const handler = load("01-wordpress-archive-retire");
  const response = await handler(new Request("https://trrb.net/category/hotnews/page/8/"), {});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://trrb.net/hot-headlines");
});

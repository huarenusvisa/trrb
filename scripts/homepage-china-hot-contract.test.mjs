import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync(new URL("../articles-home.js", import.meta.url), "utf8");
const refresh = fs.readFileSync(new URL("../homepage-refresh-guard.js", import.meta.url), "utf8");
const startup = fs.readFileSync(new URL("../homepage-startup-stability.js", import.meta.url), "utf8");

assert.match(home, /"中国热门头条": "\/hot-headlines"/);
assert.match(home, /category === "中国热门头条" \? "热门头条" : category/);
assert.match(home, /const categories = \["热门头条", "美国时政"/);
assert.match(refresh, /hot\.querySelector\("\.section-lead"\)/);
assert.match(refresh, /forceRender \|\| signature !== lastRenderSignature/);
assert.match(startup, /root\?\.querySelector\("#hot"\)/);

console.log("homepage China hot-headlines ownership contract passed");

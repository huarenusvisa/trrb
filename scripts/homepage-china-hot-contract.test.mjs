import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync(new URL("../articles-home.js", import.meta.url), "utf8");
const refresh = fs.readFileSync(new URL("../homepage-refresh-guard.js", import.meta.url), "utf8");
const startup = fs.readFileSync(new URL("../homepage-startup-stability.js", import.meta.url), "utf8");
const optimizer = fs.readFileSync(new URL("./optimize-homepage-performance.mjs", import.meta.url), "utf8");

assert.match(home, /"中国热门头条": "\/hot-headlines"/);
assert.match(home, /category === "中国热门头条" \? "热门头条" : category/);
assert.match(home, /const categories = \["热门头条", "美国时政"/);
assert.match(refresh, /hot\.querySelector\("\.section-lead"\)/);
assert.match(refresh, /forceRender \|\| signature !== lastRenderSignature/);
assert.match(startup, /root\?\.querySelector\("#hot"\)/);
assert.match(optimizer, /\['articles-home\.js', '20260822-hotfix-1'\]/);
assert.match(optimizer, /\['homepage-refresh-guard\.js', '20260822-hotfix-1'\]/);
assert.match(optimizer, /\['homepage-startup-stability\.js', '20260822-hotfix-1'\]/);

console.log("homepage China hot-headlines ownership contract passed");

import { readFile } from "node:fs/promises";

const failures = [];

async function bytes(path) {
  try { return await readFile(path); }
  catch (error) { failures.push(`${path}: missing (${error.code || error.message})`); return Buffer.alloc(0); }
}

function startsText(buffer, expected) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, 200)).trimStart().startsWith(expected);
}

const index = await bytes("index.html");
if (!startsText(index, "<!doctype html>")) failures.push("index.html is not HTML");

const css = await bytes("styles.css");
const cssHead = css.toString("utf8", 0, Math.min(css.length, 300)).trimStart();
if (!(cssHead.startsWith(":root") || cssHead.startsWith("*") || cssHead.startsWith("body"))) failures.push("styles.css does not look like CSS");

const common = await bytes("site-common.js");
if (startsText(common, "{")) failures.push("site-common.js contains JSON instead of JavaScript");

const search = await bytes("site-search.js");
if (!search.toString("utf8").includes("bindSiteSearch")) failures.push("site-search.js is missing search code");

const manifest = await bytes("site.webmanifest");
try { JSON.parse(manifest.toString("utf8")); }
catch { failures.push("site.webmanifest is not valid JSON"); }

const logo = await bytes("trrb-logo-cropped.webp");
if (!(logo.subarray(0, 4).toString("ascii") === "RIFF" && logo.subarray(8, 12).toString("ascii") === "WEBP")) failures.push("trrb-logo-cropped.webp is not WebP");

const qr = await bytes("assets/reader-group-qr.jpeg");
if (!(qr[0] === 0xff && qr[1] === 0xd8 && qr[2] === 0xff)) failures.push("assets/reader-group-qr.jpeg is not JPEG");

const headers = await bytes("_headers");
if (headers[0] === 0xff && headers[1] === 0xd8) failures.push("_headers was replaced by an image");
if (!headers.toString("utf8").includes("Cache-Control")) failures.push("_headers is missing cache rules");

if (failures.length) {
  console.error("TRRB site integrity check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("TRRB site integrity check passed.");

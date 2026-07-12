import fs from "node:fs";
const required=["supabase-news-engine-v3.1.sql","README-NEWS-ENGINE-V3.1.md","scripts/source-registry.mjs","data/source-registry.json"];
for(const f of required){if(!fs.existsSync(f))throw new Error(`missing ${f}`)}
const reg=JSON.parse(fs.readFileSync("data/source-registry.json","utf8"));
if(reg.length<20)throw new Error("source registry too small");
console.log(`V3.1 integrity OK; sources=${reg.length}`);

import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../admin/jobs-manager.js", import.meta.url), "utf8");

assert.match(source, /const coreError=lr\.error\|\|sr\.error\|\|pr\.error/);
assert.doesNotMatch(source, /const error=lr\.error\|\|sr\.error\|\|pr\.error\|\|cr\.error/);
assert.match(source, /cr\.error\?\[\]:\(cr\.data\|\|\[\]\)/);
assert.match(source, /status_reason,moderation_hold,source_key/);
assert.match(source, /招聘草稿仍可正常审核/);
assert.match(source, /sb\.dataset\.jobsStatus==='open'/);
assert.match(source, /moderation_hold:false,status_reason:null,published_at:now/);

console.log("admin jobs draft gate regression: PASS");

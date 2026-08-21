import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../admin/jobs-manager.js", import.meta.url), "utf8");
const adminIndex = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
const grants = fs.readFileSync(new URL("../supabase/migrations/20260821184400_jobs_core_data_api_grants.sql", import.meta.url), "utf8");

assert.match(source, /const coreError=lr\.error\|\|sr\.error/);
assert.doesNotMatch(source, /const coreError=lr\.error\|\|sr\.error\|\|pr\.error/);
assert.doesNotMatch(source, /const error=lr\.error\|\|sr\.error\|\|pr\.error\|\|cr\.error/);
assert.match(source, /profiles=pr\.error\?\[\]:\(pr\.data\|\|\[\]\)/);
assert.match(source, /\['求职档案',pr\]/);
assert.match(source, /cr\.error\?\[\]:\(cr\.data\|\|\[\]\)/);
assert.match(source, /status_reason,moderation_hold,source_key/);
assert.match(source, /招聘与求职记录仍可正常审核/);
assert.match(source, /sb\.dataset\.jobsStatus==='open'/);
assert.match(source, /moderation_hold:false,status_reason:null,published_at:now/);
assert.match(adminIndex, /jobs-manager\.js\?v=20260821-core-access/);
assert.match(grants, /grant select on table public\.job_seeker_posts\s+to anon, authenticated, service_role/);
assert.match(grants, /grant insert, update on table public\.job_listings\s+to authenticated, service_role/);

console.log("admin jobs draft gate regression: PASS");

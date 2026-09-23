import assert from "node:assert/strict";
import test from "node:test";
import { ensureSourceRegistry, fetchChineseCandidates, fetchEnglishCandidates, storeCandidate, retryAfterMs, normalizeAtsCandidate, pickCategory, pickEnglishLocation, shouldExpand } from "./jobs-daily-ingest.mjs";

test("registers source parents idempotently without re-enabling disabled sources", async () => {
  const registry = new Map([["500work", { source_key: "500work", is_enabled: false, priority: 95 }]]);
  const request = async (table, query, options) => {
    assert.equal(table, "job_source_registry");
    if (options) {
      assert.equal(query, "on_conflict=source_key");
      assert.equal(options.method, "POST");
      assert.equal(options.prefer, "resolution=ignore-duplicates,return=minimal");
      for (const row of options.body) {
        assert.ok(row.company_name && row.source_type && row.source_url);
        assert.ok(["greenhouse", "api", "structured_web"].includes(row.source_type));
        assert.equal(Object.hasOwn(row, "is_enabled"), false);
        if (!registry.has(row.source_key)) registry.set(row.source_key, { ...row, is_enabled: true });
      }
      return null;
    }
    return [...registry.values()];
  };
  const enabled = await ensureSourceRegistry(request);
  for (const required of ["greenhouse_bayada", "greenhouse_freedomcare", "greenhouse_sweetgreen", "greenhouse_spacex", "lever_distro", "lever_gopuff", "lever_springoakliving"]) {
    assert.equal(enabled.has(required), true, required);
  }
  assert.deepEqual(await ensureSourceRegistry(request), enabled);
  assert.equal(registry.size, 16);
  assert.equal(registry.get("500work").priority, 95);
  assert.equal(registry.get("500work").is_enabled, false);
});

test("opens the expanded web pass only when new publications are below 50", () => {
  assert.equal(shouldExpand(0), true);
  assert.equal(shouldExpand(49), true);
  assert.equal(shouldExpand(50), false);
  assert.equal(shouldExpand(80), false);
});

test("fails before ingestion when a source registration is missing", async () => {
  await assert.rejects(ensureSourceRegistry(async () => []), /Missing job source registrations/);
});

test("contains a source HTTP 403 so other sources can continue", async () => {
  const result = await fetchChineseCandidates({ discover: async () => { throw new Error("https://500work.com/ HTTP 403"); } });
  assert.deepEqual(result.candidates, []);
  assert.match(result.error, /HTTP 403/);
});

test("handles a small available source without the former 50-URL fatal gate", async () => {
  const result = await fetchChineseCandidates({ discover: async () => ["https://500work.com/page/123"], fetchPage: async () => "<title>示例招聘</title>" });
  assert.equal(result.discovered, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.error, null);
});

test("routes all caregiver job terms to the shared home-care category", () => {
  for (const title of [
    "招聘保姆",
    "招聘育儿嫂",
    "诚聘月嫂",
    "导乐工作机会",
    "老人护理人员",
    "家政阿姨招聘",
    "Caregiver needed",
    "Nanny wanted",
    "Doula position",
    "Babysitter needed",
    "Newborn Care Specialist",
    "Postpartum Doula",
    "Home Health Aide",
    "Elder Care Companion",
    "Housekeeper wanted",
  ]) {
    assert.equal(pickCategory(title), "home-care", title);
  }
});

test("normalizes an official Lever caregiver posting", () => {
  const item = normalizeAtsCandidate(
    { type: "lever", key: "lever_test", board: "test" },
    { id: "abc", text: "Senior Caregiver", descriptionPlain: "Companion care and housekeeping", hostedUrl: "https://jobs.lever.co/test/abc", createdAt: 1789250000000, categories: { location: "New Canaan, CT", commitment: "Full-time" } },
  );
  assert.equal(item.payload.category_slug, "home-care");
  assert.equal(item.payload.employment_type, "full_time");
  assert.equal(item.payload.state_code, "CT");
  assert.equal(item.payload.city, "New Canaan");
  assert.equal(item.payload.application_url, "https://jobs.lever.co/test/abc");
  assert.deepEqual(item.errors, []);
});

test("normalizes Lever commitment values to the database enum", () => {
  for (const [commitment, expected] of [["Part-time", "part_time"], ["Contract", "contract"], ["Temporary", "temporary"], ["Internship", "internship"], ["Per Diem", "unspecified"], [undefined, "unspecified"]]) {
    const item = normalizeAtsCandidate({ type: "lever", key: "lever_test", board: "test" }, {
      id: "123", text: "Office Assistant", descriptionPlain: "Office work", hostedUrl: "https://jobs.lever.co/test/123",
      categories: { location: "New York, NY", commitment },
    });
    assert.equal(item.payload.employment_type, expected);
  }
});

test("parses standard English US locations", () => {
  assert.deepEqual(pickEnglishLocation("Conway, SC"), { state_code: "SC", city: "Conway" });
});

test("holds remote postings that lack the database-required state and city", () => {
  for (const location of ["Remote", "United States", "USA - Remote"]) {
    const item = normalizeAtsCandidate({ type: "lever", key: "lever_test", board: "test" }, {
      id: "remote", text: "Office Assistant", descriptionPlain: "Remote work", hostedUrl: "https://jobs.lever.co/test/remote",
      categories: { location, commitment: "Full-time" },
    });
    assert.deepEqual(item.errors, ["no_verifiable_us_location"]);
  }
});

test("keeps non-caregiver English jobs for the general jobs site", () => {
  const item = normalizeAtsCandidate(
    { type: "lever", key: "lever_test", board: "test" },
    { id: "office-1", text: "Office Administrator", descriptionPlain: "Manage the front office", hostedUrl: "https://jobs.lever.co/test/office-1", createdAt: 1789250000000, categories: { location: "New York, NY", commitment: "Full-time" } },
  );
  assert.equal(item.payload.category_slug, "office-admin");
  assert.deepEqual(item.errors, []);
});


test("inspects the full employer feed, including positions beyond the former cap", async () => {
  const jobs = Array.from({length: 1201}, (_, id) => ({id, title:'Office Assistant', content:'Manage office', location:{name:'New York, NY'}, absolute_url:`https://example.com/${id}`}));
  const result = await fetchEnglishCandidates([{type:'greenhouse', key:'test', board:'test'}], async () => ({jobs}));
  assert.equal(result.candidates.length, 1201);
  assert.equal(result.candidates.at(-1).externalId, '1200');
});

test("does not republish or misreport a held listing, including holds applied at insertion", async () => {
  for (const existing of [true, false]) {
    const writes=[];
    const held={id:'job-1',status:'unlisted',status_reason:'third_party_no_public_direct_contact',moderation_hold:false};
    const request=async (table, query, options) => {
      if (!options) return table==='job_ingest_raw' ? [{id:1}] : existing ? [held] : [];
      writes.push({table,...options});
      return table==='job_listings' ? [held] : [{id:1}];
    };
    const result=await storeCandidate({sourceKey:'500work',externalId:'1',payloadHash:'hash',errors:[],payload:{}}, request);
    assert.equal(result,'held');
    const raw=writes.filter(w=>w.table==='job_ingest_raw').at(-1).body;
    assert.equal(raw.stage,'validated');
    assert.equal(raw.normalized_job_listing_id,'job-1');
    assert.match(raw.validation_errors[0],/third_party_no_public_direct_contact/);
    if (existing) assert.equal(writes.find(w=>w.table==='job_listings').body.status,undefined);
  }
});


test("honors source rate-limit Retry-After seconds and dates",()=>{
  assert.equal(retryAfterMs('90'),90000);
  assert.equal(retryAfterMs('Wed, 23 Sep 2026 20:04:00 GMT',Date.parse('2026-09-23T20:03:00Z')),60000);
  assert.equal(retryAfterMs(null),0);
});

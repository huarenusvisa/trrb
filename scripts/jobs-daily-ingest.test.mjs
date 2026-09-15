import assert from "node:assert/strict";
import test from "node:test";
import { ensureSourceRegistry, fetchChineseCandidates, normalizeAtsCandidate, pickCategory, pickEnglishLocation } from "./jobs-daily-ingest.mjs";

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
  assert.deepEqual([...enabled].sort(), ["greenhouse_bayada", "greenhouse_freedomcare", "lever_distro", "lever_springoakliving"]);
  assert.deepEqual(await ensureSourceRegistry(request), enabled);
  assert.equal(registry.size, 5);
  assert.equal(registry.get("500work").priority, 95);
  assert.equal(registry.get("500work").is_enabled, false);
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

test("keeps non-caregiver English jobs for the general jobs site", () => {
  const item = normalizeAtsCandidate(
    { type: "lever", key: "lever_test", board: "test" },
    { id: "office-1", text: "Office Administrator", descriptionPlain: "Manage the front office", hostedUrl: "https://jobs.lever.co/test/office-1", createdAt: 1789250000000, categories: { location: "New York, NY", commitment: "Full-time" } },
  );
  assert.equal(item.payload.category_slug, "office-admin");
  assert.deepEqual(item.errors, []);
});

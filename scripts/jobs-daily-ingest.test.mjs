import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAtsCandidate, pickCategory, pickEnglishLocation } from "./jobs-daily-ingest.mjs";

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
  assert.equal(item.payload.state_code, "CT");
  assert.equal(item.payload.city, "New Canaan");
  assert.equal(item.payload.application_url, "https://jobs.lever.co/test/abc");
  assert.deepEqual(item.errors, []);
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

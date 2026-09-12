import assert from "node:assert/strict";
import test from "node:test";
import { pickCategory } from "./jobs-daily-ingest.mjs";

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
  ]) {
    assert.equal(pickCategory(title), "home-care", title);
  }
});

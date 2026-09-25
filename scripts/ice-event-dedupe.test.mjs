import test from "node:test";
import assert from "node:assert/strict";
import { eventSignature, hasMaterialUpdate,findDuplicateStory,distinctOfficialReleases } from "./ice-fast-intake.mjs";
import { isKnownOldEvent } from "./ice-precollect-published-dedupe.mjs";

test("reposts on different days keep the same event fingerprint", () => {
  const base = {
    source_text: "ICE arrested John Sample in Atlanta during an enforcement operation involving 12 people.",
    city: "Atlanta",
    state_code: "GA",
    event_type: "arrest"
  };
  assert.equal(
    eventSignature({ ...base, source_created_at: "2026-09-14T10:00:00Z" }),
    eventSignature({ ...base, source_created_at: "2026-09-15T10:00:00Z" })
  );
});

test("a real event date remains part of the event fingerprint", () => {
  const base = { source_text: "ICE arrested John Sample in Atlanta.", city: "Atlanta", state_code: "GA", event_type: "arrest" };
  assert.notEqual(
    eventSignature({ ...base, event_date: "2026-09-13" }),
    eventSignature({ ...base, event_date: "2026-09-14" })
  );
});

test("repeated wording is discarded while substantive updates are retained", () => {
  const story = {
    title: "ICE arrested John Sample in Atlanta during an enforcement operation involving 12 people.",
    summary: "",
    content: "",
    ai_payload: { lead_source_text_original: "ICE arrested John Sample in Atlanta during an enforcement operation involving 12 people." }
  };
  assert.equal(hasMaterialUpdate({ source_text: "ICE arrested John Sample in Atlanta in an operation involving 12 people." }, story), false);
  assert.equal(hasMaterialUpdate({ source_text: "Update: ICE confirmed John Sample was released and 18 people were involved." }, story), true);
});

test("confirmed historical Georgia and Leqaa Kordia reposts are blocked before AI", () => {
  assert.equal(isKnownOldEvent("ICE raid at the Hyundai battery plant in Georgia detained 475 people"), true);
  assert.equal(isKnownOldEvent("ICE arrested Columbia protester Leqaa Kordia after her visa was revoked"), true);
  assert.equal(isKnownOldEvent("ICE announced a new operation in Boston today"), false);
});
test('different official releases do not merge on agency names and common release dates',()=>{
 const titles=['Justice Department Ends Over 50 Half-Century-Old Desegregation Cases Throughout the United States','DOJ Announces $25M ANGEL Grant Opportunity for Local Law Enforcement','United States Files Request to Intervene in Case Brought by X Corp. and Elon Musk'];
 const posts=titles.map((title,i)=>({x_url:`https://www.justice.gov/opa/release-${i}`,source_text:`${title}\nThu, 24 Sep 2026 12:00:00 +0000\nPress Release Office of Public Affairs United States Department of Justice`,raw_payload:{source_platform:'official_web'}}));
 const story={event_fingerprint:eventSignature(posts[0]),ai_payload:{lead_source_url:posts[0].x_url,lead_source_platform:'official_web',lead_source_text_original:posts[0].source_text}};
 for(const post of posts.slice(1)){assert.notEqual(eventSignature(post),story.event_fingerprint);assert.equal(findDuplicateStory(post,[story]),null);assert.equal(distinctOfficialReleases(post,story),true);}
 assert.equal(findDuplicateStory(posts[0],[story]),story);
});

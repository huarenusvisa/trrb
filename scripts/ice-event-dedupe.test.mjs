import test from "node:test";
import assert from "node:assert/strict";
import { eventSignature, hasMaterialUpdate } from "./ice-fast-intake.mjs";
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

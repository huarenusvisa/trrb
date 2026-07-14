import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanText,
  removeRepeatedSegments,
  detectAction,
  detectState,
  eventProfile,
  eventFingerprint,
  eventSimilarity,
  sameEvent
} from "./ice-v2-event-core.mjs";

test("cleans links and account mentions", () => {
  assert.equal(cleanText("@ICEgov arrest update https://x.com/a"), "arrest update");
});

test("removes repeated source sentences", () => {
  assert.equal(removeRepeatedSegments("ICE made an arrest. ICE made an arrest. More details followed."), "ICE made an arrest. More details followed.");
});

test("detects action and state", () => {
  assert.equal(detectAction("ERO Baltimore arrested a fugitive"), "arrest");
  assert.equal(detectState("The operation took place in Maryland"), "MD");
});

test("same event from ICE and Reuters is merged", () => {
  const a = eventProfile({ source_created_at: "2026-07-14T10:00:00Z", source_text: "ICE ERO Baltimore arrested Walter Barahona Mejia, an MS-13 member with a final order of removal in Maryland." });
  const b = eventProfile({ source_created_at: "2026-07-14T11:00:00Z", source_text: "Reuters reports that ERO Baltimore arrested Walter Barahona Mejia in Maryland. He is described as an MS-13 member with a final removal order." });
  assert.ok(eventSimilarity(a,b) >= 0.56);
  assert.equal(sameEvent(a,b), true);
});

test("different states do not merge", () => {
  const a = eventProfile({ source_created_at: "2026-07-14T10:00:00Z", source_text: "ICE arrested a fugitive in Maryland." });
  const b = eventProfile({ source_created_at: "2026-07-14T10:30:00Z", source_text: "ICE arrested a fugitive in Illinois." });
  assert.equal(sameEvent(a,b), false);
});

test("fingerprint remains stable for the same profile", () => {
  const profile = eventProfile({ source_created_at: "2026-07-14T10:00:00Z", source_text: "ICE arrested a fugitive in Maryland." });
  assert.equal(eventFingerprint(profile), eventFingerprint(profile));
  assert.equal(eventFingerprint(profile).length, 40);
});

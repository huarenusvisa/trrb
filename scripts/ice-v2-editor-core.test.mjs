import test from "node:test";
import assert from "node:assert/strict";
import {
  needsChineseEdit,
  sourceAttribution,
  evidenceInput,
  validateEdited
} from "./ice-v2-editor-core.mjs";

test("only ICE v2 unreviewed events need editing", () => {
  assert.equal(needsChineseEdit({ ai_payload: { v2_event_engine: true }, human_review_status: "required" }), true);
  assert.equal(needsChineseEdit({ ai_payload: {}, human_review_status: "required" }), false);
  assert.equal(needsChineseEdit({ ai_payload: { v2_event_engine: true, v2_editor_version: "2.0.0" } }), false);
  assert.equal(needsChineseEdit({ ai_payload: { v2_event_engine: true }, human_review_status: "editing" }), false);
});

test("official and newsroom attribution are explicit", () => {
  assert.match(sourceAttribution({ source_type: "official", source_display_name: "ICE" }), /ICE表示/);
  assert.match(sourceAttribution({ source_type: "major_media", source_display_name: "Reuters" }), /据Reuters报道/);
});

test("evidence input removes repeated sentences", () => {
  const rows = evidenceInput([{ source_type: "official", source_display_name: "ICE", source_text: "ICE announced an arrest. ICE announced an arrest." }]);
  assert.equal(rows.length, 1);
  assert.equal((rows[0].text.match(/ICE announced an arrest/g) || []).length, 1);
});

test("edited story must be Chinese neutral and complete", () => {
  const good = validateEdited({
    title: "ICE在纽约通报一起移民执法逮捕",
    summary: "ICE表示，执法人员在纽约执行行动并逮捕一名被下达最终驱逐令的人员。",
    content: "ICE表示，执法人员近日在纽约开展移民执法行动，逮捕一名已被下达最终驱逐令的人员。官方通报称，该人员随后被移交相关部门处理，案件后续程序仍在进行。"
  });
  assert.equal(good.ok, true);
  assert.equal(validateEdited({ title: "震惊！ICE横扫纽约", summary: "短", content: "太短" }).ok, false);
});

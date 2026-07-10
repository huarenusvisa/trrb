import test from "node:test";
import assert from "node:assert/strict";
import { buildIceQueryLanes, scoreIceCandidate } from "./ice-sync.mjs";

test("ICE radar contains official, media, English open-search and Spanish community lanes", () => {
  const lanes = buildIceQueryLanes();
  const ids = new Set(lanes.map((lane) => lane.id));
  assert(ids.has("official"));
  assert([...ids].some((id) => id.startsWith("trusted-")));
  assert(ids.has("radar"));
  assert(ids.has("radar-es"));
  for (const lane of lanes) {
    assert(lane.query.length > 0);
    assert(lane.query.length <= 500);
  }
});

test("ICE candidate scoring recognizes English and Spanish enforcement reports", () => {
  const english = scoreIceCandidate({
    text: "ICE agents arrested several people during an immigration enforcement operation.",
    source_weight: 45,
    source_tier: "other_source",
    public_metrics: {},
  });
  const spanish = scoreIceCandidate({
    text: "Agentes de ICE realizaron una redada y una persona fue detenida.",
    source_weight: 45,
    source_tier: "other_source",
    public_metrics: {},
  });
  assert(english.score >= 50);
  assert(spanish.score >= 50);
  assert(english.matched_terms.includes("ICE"));
  assert(spanish.matched_terms.includes("西语执法行动"));
});

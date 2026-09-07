import test from "node:test";
import assert from "node:assert/strict";
import { classifyNewsQuality } from "./ice-news-quality-gate.mjs";

const row = (source_text, source_type = "discovered_individual", source_username = "example") => ({ source_text, source_type, source_username });

test("普通ice语义不会进入ICE新闻候选", () => {
  assert.equal(classifyNewsQuality(row("Creamy vanilla iced latte with two ice cubes and one espresso shot.")).keep, false);
  assert.equal(classifyNewsQuality(row("Develop players from the first second they hit the ice at hockey practice.")).keep, false);
  assert.equal(classifyNewsQuality(row("I am still watching the Ice Spice video.")).keep, false);
});

test("纯观点和假设性ICE内容被过滤", () => {
  assert.equal(classifyNewsQuality(row("Perfect location for an ICE raid. They should come here next.")).keep, false);
  assert.equal(classifyNewsQuality(row("ICE hasn't been to Wisconsin yet and I want them here.")).keep, false);
  assert.equal(classifyNewsQuality(row("Remove them and lock them up for life in an overseas ICE detention center.")).keep, false);
});

test("只是顺便提到ICE、但ICE不是行动主体时被过滤", () => {
  const localArrest = classifyNewsQuality(row("An illegal alien has been arrested for rape in Fairfax County, and local officials refused to notify ICE."));
  assert.equal(localArrest.keep, false);
  assert.equal(localArrest.reason, "ice_mentioned_but_not_actor");

  const policy = classifyNewsQuality(row("The concern is that a liability policy is helping ICE arrest people while protecting local law enforcement."));
  assert.equal(policy.keep, false);
  assert.equal(policy.reason, "ice_mentioned_but_not_actor");
});

test("旧事件回顾没有新进展时被过滤", () => {
  const result = classifyNewsQuality(row("Two months ago, Lorenzo was killed by ICE on his way to work. The family still remembers him."));
  assert.equal(result.keep, false);
  assert.equal(result.reason, "ice_stale_recap_filtered");
});

test("真实当前ICE执法和实际羁押事件保留", () => {
  assert.equal(classifyNewsQuality(row("BREAKING: ICE agents arrested a police recruit in New Orleans today after DHS said he had a final removal order.")).keep, true);
  assert.equal(classifyNewsQuality(row("ICE and the FBI are currently executing a criminal search warrant at a North Carolina manufacturer.")).keep, true);
  assert.equal(classifyNewsQuality(row("The physician is now in ICE custody in Vermont while removal proceedings continue.")).keep, true);
  assert.equal(classifyNewsQuality(row("ICE @EROSanFrancisco arrested a parole violator in Sacramento today.")).keep, true);
});

test("旧案出现新的司法进展仍可保留", () => {
  assert.equal(classifyNewsQuality(row("A federal judge ruled today on a lawsuit over a 2025 arrest at an ICE detention facility.")).keep, true);
});

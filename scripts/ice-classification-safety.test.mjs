import assert from "node:assert/strict";
import classifier from "../netlify/functions/_shared/ice-enforcement.js";

const { hasStandaloneIce, isIceEnforcementText } = classifier;

assert.equal(hasStandaloneIce("ICE arrests 12 people"), true);
assert.equal(hasStandaloneIce("immigration services"), false);
assert.equal(hasStandaloneIce("practice advisory"), false);
assert.equal(hasStandaloneIce("notice to appear"), false);

assert.equal(isIceEnforcementText("ICE逮捕新泽西办理移民手续的男子"), true);
assert.equal(isIceEnforcementText("ICE agents conduct enforcement raid"), true);
assert.equal(isIceEnforcementText("Advance Parole旅行许可完整办理流程详解"), false);
assert.equal(isIceEnforcementText("如何申请工卡及调整身份"), false);
assert.equal(isIceEnforcementText("[BIA先例] 212(h)豁免与调整身份"), false);
assert.equal(isIceEnforcementText("K-1未婚夫签证是什么"), false);
assert.equal(isIceEnforcementText("ICE发布新的信息页面"), false);
assert.equal(isIceEnforcementText("移民拘留政策调整"), false);

console.log("ICE classification requires an explicit ICE agency signal plus an enforcement action");

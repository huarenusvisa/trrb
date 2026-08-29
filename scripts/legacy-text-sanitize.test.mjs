import assert from 'node:assert/strict';
import { sanitizeLegacyText } from './legacy-text-sanitize.mjs';

assert.equal(sanitizeLegacyText('甲\u0000乙'), '甲乙');
assert.equal(sanitizeLegacyText('甲\u0007\n\t乙'), '甲 乙');
assert.equal(sanitizeLegacyText('  正常中文正文  '), '正常中文正文');
assert.equal(sanitizeLegacyText(null), '');

console.log('legacy text sanitization policy passed');

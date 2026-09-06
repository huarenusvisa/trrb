import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const screen = await readFile(new URL('../app/(tabs)/immigration.tsx', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n/i18n-core.ts', import.meta.url), 'utf8');

test('localizes immigration pathways and topics without changing web destinations', () => {
  assert.match(screen, /useI18n\(\)/);
  for (const key of ['immigration.heading', 'immigration.subtitle', 'immigration.studyDescription', 'immigration.citizenshipDescription', 'immigration.topicF1', 'immigration.topicN600', 'immigration.openPathA11y', 'immigration.openTopicA11y']) {
    assert.ok(screen.includes(`'${key}'`), `immigration screen must translate ${key}`);
    assert.equal(i18n.split(`'${key}'`).length - 1, 3, `${key} must exist in all three locales`);
  }
  for (const destination of ['https://trrb.net/immigrate', "'change-status'", "'cr1-ir1'", "'stem-opt'"]) {
    assert.ok(screen.includes(destination), `immigration destination must remain ${destination}`);
  }
  assert.doesNotMatch(screen, />移民美国</);
  assert.doesNotMatch(screen, />完整知识库</);
});

test('keeps immigration actions usable with narrow screens and large text', () => {
  assert.match(screen, /useWindowDimensions\(\)/);
  assert.match(screen, /width < 360/);
  assert.match(screen, /fontScale >= 1\.3/);
  assert.match(screen, /headingStack: \{ flexDirection: 'column' \}/);
  assert.match(screen, /statsWrap: \{ flexWrap: 'wrap'/);
  assert.match(screen, /topicRow: \{ flexDirection: 'row', flexWrap: 'wrap'/);
  assert.match(screen, /topicChip: \{ minHeight: 44/);
  assert.match(screen, /allButton: \{ minHeight: 44/);
  assert.match(screen, /accessibilityRole="link"/);
  assert.match(screen, /accessibilityRole="header"/);
});

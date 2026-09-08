import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tab = await readFile(new URL('../app/(tabs)/america.tsx', import.meta.url), 'utf8');
const community = await readFile(new URL('../app/community.tsx', import.meta.url), 'utf8');

test('replaces the former U.S. news tab with the existing community screen', () => {
  assert.match(tab, /import CommunityScreen from '\.\.\/community'/);
  assert.match(tab, /testID="screen-america"/);
  assert.match(tab, /<CommunityScreen embedded \/>/);
  assert.match(community, /!embedded \? <Stack\.Screen/);
  assert.doesNotMatch(tab, /fetchArticlePage|美国时政|U\.S\. politics/);
});

test('keeps the community tab on the accepted account and community APIs', () => {
  assert.match(community, /listCommunityPosts/);
  assert.match(community, /supabase\.auth\.getSession/);
  assert.match(community, /router\.push\(signedIn \? '\/community-compose' : '\/auth'\)/);
  assert.match(community, /accessibilityRole="tab"/);
  assert.match(community, /accessibilityRole="button"/);
});

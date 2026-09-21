import test from 'node:test';
import assert from 'node:assert/strict';
import routing from '../netlify/functions/_shared/official-content-routing.js';

const { routeOfficialContent } = routing;
const official = source_text => [{ trust_tier: 1, source_type: 'official', source_username: 'USCIS', source_text }];

test('USCIS I-485 updates route into the I-485 knowledge module', () => {
  const route = routeOfficialContent('USCIS updates Form I-485 rules', '', '', official('USCIS announced an I-485 update.'));
  assert.equal(route.key, 'immigration-knowledge');
  assert.match(route.categoryName, /境内身份转换·I-485境内调整身份/);
});

test('I-130 updates route into a dedicated family knowledge module', () => {
  const route = routeOfficialContent('USCIS revises Form I-130 filing guidance', '', '', official('Petition for Alien Relative'));
  assert.match(route.categoryName, /家庭移民·I-130亲属移民申请/);
});

test('FBI criminal cases route to US crime while policy routes to US politics', () => {
  assert.equal(routeOfficialContent('FBI arrests suspect on fraud charges', '', '', []).key, 'us-crime');
  assert.equal(routeOfficialContent('White House announces a new federal policy', '', '', []).key, 'us-politics');
});

test('concrete ICE enforcement remains in the ICE section', () => {
  const route = routeOfficialContent('ICE arrests fugitive during enforcement operation', '', '', [{ source_username: 'ICEgov', source_text: 'ICE arrested a fugitive.' }]);
  assert.equal(route.key, 'ice');
});

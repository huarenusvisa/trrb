import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('immigration-judge-approval-rate/tools.html', 'utf8');
const css = readFileSync('immigration-judge-approval-rate/tools.css', 'utf8');
const nav = readFileSync('asylumjudge/domain-brand.js', 'utf8');
const home = readFileSync('asylumjudge/index.html', 'utf8');
const redirects = readFileSync('_redirects', 'utf8');
const seoBuild = readFileSync('scripts/build-asylumjudge-seo.mjs', 'utf8');
const generator = readFileSync('scripts/update-eoir-court-locations.mjs', 'utf8');
const locationData = JSON.parse(readFileSync('data/eoir-court-locations.json', 'utf8'));

const officialLinks = [
  'https://acis.eoir.justice.gov/',
  'https://locator.ice.gov/odls',
  'https://respondentaccess.eoir.justice.gov/en/forms/',
  'https://egov.uscis.gov/',
  'https://epay.eoir.justice.gov/'
];
for (const href of officialLinks) {
  assert.ok(html.includes(`href="${href}" target="_blank" rel="noopener noreferrer"`), `${href} must be a safe direct official link`);
  assert.ok(nav.includes(`'${href}'`), `${href} must be available from the shared tools menu`);
}
assert.match(html, /href="\/courts"/, 'official-tools page must link to the local court and address directory');
assert.match(html, /EOIR-33\/IC[\s\S]*EOIR-33\/BIA/, 'address-change guidance must distinguish immigration-court and BIA forms');
assert.match(html, /不收集、不保存 A-Number、USCIS 收据号码或案件信息/, 'tools page must state that sensitive case identifiers are not collected');
assert.doesNotMatch(html, /<input\b/i, 'tools page must never collect A-Numbers or receipt numbers locally');
assert.match(css, /\.tools-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'desktop tools layout must be a 3-column grid');
assert.match(css, /@media\(max-width:620px\)[\s\S]*\.tools-grid\{grid-template-columns:1fr/, 'mobile tools layout must be a single column');
assert.match(home, /href="\/tools"[\s\S]*移民官方工具/, 'home page must expose the official-tools destination card');
assert.match(nav, /<details class="nav-tools/, 'main navigation must use an accessible native disclosure menu');
assert.match(redirects, /https:\/\/asylumjudge\.com\/tools \/immigration-judge-approval-rate\/tools\.html 200!/, 'production host must serve the tools page at /tools');
assert.match(seoBuild, /\['tools', toolsTemplate, 'tools'\]/, 'standalone SEO build must publish the canonical and localized tools routes');

assert.equal(locationData.source_url, 'https://www.justice.gov/eoir/immigration-court-operational-status');
assert.equal(locationData.court_code_source_url, 'https://www.justice.gov/eoir/policy-manual-eoir/part-VII/appendices/n');
assert.ok(locationData.location_count >= 70, 'official EOIR directory must contain the nationwide location set');
assert.ok(Object.keys(locationData.courts).length >= 75, 'court-code directory must cover the published court data');
assert.match(generator, /if \(locations\.length < 60\)/, 'location updater must reject a suspiciously incomplete address response');
assert.match(generator, /if \(codeRows\.length < 60\)/, 'location updater must reject a suspiciously incomplete court-code response');

assert.equal(locationData.courts.NYB.locations[0].address, '290 Broadway, Suite 2900, Ted Weiss Federal Building, New York, NY 10007, United States');
assert.equal(locationData.courts.NYC.locations[0].address, '26 Federal Plaza, 12th Floor, Room 1237, New York, NY 10278, United States');
assert.equal(locationData.courts.NYV.locations[0].address, '201 Varick Street, 5th Floor, Room 507, New York, NY 10014, United States');
assert.equal(locationData.courts.ATD.locations[0].address, '180 Ted Turner Drive, SW, Suite 241, Atlanta, GA 30303, United States');
assert.equal(locationData.courts.ATL.locations[0].address, '401 W. Peachtree Street, Suite 2600, Atlanta, GA 30308, United States');
for (const legacy of ['SFR', 'AGA']) {
  assert.equal(locationData.courts[legacy].current_location_status, 'not_listed');
  assert.deepEqual(locationData.courts[legacy].locations, [], `${legacy} must not receive a guessed address`);
}

console.log('AsylumJudge official tools and court-address contract: PASS');

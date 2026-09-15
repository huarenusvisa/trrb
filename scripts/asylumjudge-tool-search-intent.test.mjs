import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), '.netlify', 'asylumjudge-bundle', 'public');
const pairs = [
  ['eoir-case-status', 'https://acis.eoir.justice.gov/', '移民法庭上庭案件查询', 'EOIR Immigration Court Case Status Lookup'],
  ['ice-detainee-locator', 'https://locator.ice.gov/odls', 'ICE查人与被拘留人员查询', 'ICE Online Detainee Locator'],
  ['eoir-33-change-address', 'https://respondentaccess.eoir.justice.gov/en/forms/', 'EOIR-33移民法院更改地址', 'EOIR-33 Change of Address'],
  ['uscis-case-status', 'https://egov.uscis.gov/', 'USCIS案件状态查询', 'USCIS Case Status Online'],
  ['immigration-court-asylum-fee', 'https://epay.eoir.justice.gov/', '移民法庭庇护年费缴纳', 'Immigration Court Asylum Fee Payment']
];
const sitemap = await readFile(join(OUT, 'sitemap-static.xml'), 'utf8');
const zhTools = await readFile(join(OUT, 'tools', 'index.html'), 'utf8');
const enTools = await readFile(join(OUT, 'en', 'tools', 'index.html'), 'utf8');

for (const [slug, official, zhH1, enH1] of pairs) {
  for (const [prefix, h1, tools] of [['', zhH1, zhTools], ['en/', enH1, enTools]]) {
    const relative = `${prefix}${slug}`;
    const canonical = `https://asylumjudge.com/${relative}/`;
    const html = await readFile(join(OUT, ...relative.split('/'), 'index.html'), 'utf8');
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${canonical} must appear in sitemap-static.xml`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
    assert.ok(html.includes(`<h1>${h1}</h1>`), `${canonical} must expose the search-intent H1`);
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large">/);
    assert.ok(html.includes(`href="${official}" target="_blank" rel="noopener noreferrer"`), `${canonical} must use the official service URL`);
    assert.match(html, /"@type":"FAQPage"/, `${canonical} must expose FAQ structured data`);
    assert.ok(tools.includes(`href="/${relative}/"`), `${relative} must be linked from the matching tools directory`);
  }
}

const courts = await readFile(join(OUT, 'courts', 'index.html'), 'utf8');
const englishCourts = await readFile(join(OUT, 'en', 'courts', 'index.html'), 'utf8');
assert.match(courts, /<title>美国移民法院地址、地图导航与庇护通过率/);
assert.match(englishCourts, /<title>U\.S\. Immigration Court Addresses, Judges &amp; Asylum Rates/);

console.log('AsylumJudge tool search-intent SEO contract: PASS (10 focused pages, official links, schema, internal links and court-address intent)');

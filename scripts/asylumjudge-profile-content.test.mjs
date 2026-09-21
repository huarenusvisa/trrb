import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { profileTable } from './asylumjudge-profile-content.mjs';

const output = '.netlify/asylumjudge-bundle/public/';
const carman = await readFile(output + 'en/judges/andre-carman--44c7f8efd844/index.html', 'utf8');
assert.match(carman, /id="yearly"[^>]*>[\s\S]*?<b>FY 2026<\/b>/);
assert.match(carman, /id="nationality"[^>]*>[\s\S]*?Colombia/);
assert.match(carman, /href="\/en\/courts\/denver-den--den\/"/);
assert.match(carman, /rel="canonical" href="https:\/\/asylumjudge.com\/en\/judges\/andre-carman--44c7f8efd844\/"/);
for (const [locale, court] of [['en','newark-new--new'],['en','portland-poo--poo'],['fr','detroit-det--det'],['es','seattle-sea--sea']]) {
  const html = await readFile(output + `${locale}/courts/${court}/index.html`, 'utf8');
  assert.match(html, /id="court-source"[^>]*>FY 2026 · 2025-10-01 – 2026-07-01/);
  assert.match(html, new RegExp(`id="judge-list"[^>]*>[\\s\\S]*?href="/${locale}/judges/`));
  assert.match(html, new RegExp(`rel="canonical" href="https://asylumjudge.com/${locale}/courts/${court}/"`));
}
const table = profileTable([
  {name:'<sample>',grants:49,denials:0,total_asylum_decisions:49},
  {name:'enough',grants:25,denials:25,total_asylum_decisions:50}
], 'en', 'Sample', row => row.name === '<sample>' ? '&lt;sample&gt;' : row.name);
assert.match(table, /Fewer than 50; rate hidden/);
assert.match(table, /50\.0%/);
assert.doesNotMatch(table, /100\.0%/);

const proxy = await readFile('asylumjudge/immigration-judges-proxy.js', 'utf8');
const id = '44c7f8ef-d844-4dd5-b48d-c6f6ec92f26a';
let calls = 0;
let upstream = { judge: { id, judge_name: 'Carman, Andre' } };
let status = 200;
const context = { exports:{}, URL, AbortSignal, console:{error(){}}, fetch:async () => {
  calls++;
  return { ok:status===200, status, headers:new Headers({'content-type':'application/json'}), text:async()=>JSON.stringify(upstream) };
}};
runInNewContext(proxy, context);
const request = params => context.exports.handler({httpMethod:'GET',queryStringParameters:params});
let response = await request({mode:'detail',id:'not-a-valid-id'});
assert.equal(response.statusCode,400);
assert.equal(calls,0,'invalid IDs must not reach the upstream');
response = await request({mode:'detail',id});
assert.equal(response.statusCode,200);
assert.equal(JSON.parse(response.body).judge.id,id);
upstream = {judge:{id:'9dbc9f4a-e3b7-4186-8483-994eb431d142',judge_name:'Wrong judge'}};
response = await request({mode:'detail',id});
assert.equal(response.statusCode,502);
assert.doesNotMatch(response.body,/Wrong judge/);
assert.equal(response.headers['Cache-Control'],'no-store');
upstream = {court:{court_name:'Newark (NEW)',court_state:'NJ'}};
assert.equal((await request({mode:'court-detail',court:'Newark (NEW)',state:'NJ'})).statusCode,200);
assert.equal((await request({mode:'court-detail',court:'Portland (POO)',state:'OR'})).statusCode,502);
status = 404; upstream = {error:'not_found'};
assert.equal((await request({mode:'detail',id})).statusCode,404);
console.log('Verified static profile tables, canonical court links, sample suppression and proxy identity checks.');

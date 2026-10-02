const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'public-jobs.js'), 'utf8');

test('public jobs feed supports sanitized search and server pagination', () => {
  assert.match(source, /safeQuery\(event\.queryStringParameters\?\.q\)/);
  assert.match(source, /boundedInteger\(event\.queryStringParameters\?\.offset/);
  assert.match(source, /rpc\/search_job_listings/);
  assert.match(source, /p_category_slug: category \|\| null/);
  assert.match(source, /'Access-Control-Allow-Origin': '\*'/);
  assert.match(source, /p_keyword: keyword \|\| null/);
  assert.match(source, /p_offset: offset/);
  assert.match(source, /nextOffset: hasMore \? offset \+ items\.length : null/);
});

test('public jobs feed preserves safe listings even when no public contact action exists', () => {
  assert.match(source, /visibleRows\.map\(\(row\) => safeItem/);
  assert.doesNotMatch(source, /\.filter\(\(row\) => row\.contact\)/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

const vm = require('node:vm');
const regions = require('../../huarengongzuo/regions.json');
function withRest(rest) {
  const sandbox = {exports:{},require: name => name.endsWith('regions.json') ? regions : {rest},console,URL,Date};
  vm.runInNewContext(source,sandbox);
  return async params => JSON.parse((await sandbox.exports.handler({httpMethod:'GET',queryStringParameters:params})).body);
}
const row = (id,city,state='GA') => ({id,title:'招聘服务员',city,state_code:state,status:'open',contact_public:true,contact_method:'phone',contact_value:'5551234567',published_at:'2026-10-01'});
test('Atlanta aliases search identical canonical locations and multiple cities form a union', async () => {
  const calls=[];
  const run = withRest(async (table,args) => {calls.push(args);return [row('a','Atlanta')];});
  await run({place:'亚特兰大'}); const chinese=calls[0].query.and.replace(/expires_at.gt.[^,)]+/,'expiry');
  calls.length=0;await run({place:'Atlanta'});assert.equal(calls[0].query.and.replace(/expires_at.gt.[^,)]+/,'expiry'),chinese);
  calls.length=0;await run({place:'Atlanta;Flushing'});assert.match(calls[0].query.and,/state_code.eq.GA/);assert.match(calls[0].query.and,/state_code.eq.NY/);
});
test('empty local search expands geographically, sorts approximate city distances, and keeps nearby pagination', async () => {
  const nearby=[...Array.from({length:65},(_,i)=>row(String(i).padStart(3,'0'),'Atlanta')),row('near','Duluth')];
  const calls=[];
  const run=withRest(async (table,args)=>{calls.push(args);if(args.query.id)return nearby;if(args.query.limit==='1000')return nearby;return [];});
  const first=await run({place:'Suwanee',limit:'60'});
  assert.equal(first.recommendation.radius_miles,50);assert.equal(first.items.length,60);assert.equal(first.items[0].city,'Duluth');assert.equal(first.items[0].distance_approximate,true);assert.equal(first.nextOffset,60);
  calls.length=0;const second=await run({place:'Suwanee',limit:'60',offset:'60',nearby:'50'});
  assert.equal(second.items.length,6);assert.equal(second.nextOffset,null);assert.equal(calls[0].query.limit,'1000');assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,66);
});
test('end of local pagination never switches to nearby recommendations', async () => {
  let calls=0;const run=withRest(async ()=>{calls++;return [];});
  const result=await run({place:'Atlanta',offset:'60'});assert.equal(result.recommendation,null);assert.equal(calls,1);
});

test('LA remains a Los Angeles alias while Chinese state names select the whole state', async () => {
  let query;const run=withRest(async (table,args)=>{query ||= args.query;return [row('a','Los Angeles','CA')];});
  await run({place:'LA'});assert.match(query.and,/state_code.eq.CA/);assert.match(query.and,/Los Angeles/);
  query=null;await run({place:'路易斯安那州'});assert.match(query.and,/state_code.eq.LA/);
});

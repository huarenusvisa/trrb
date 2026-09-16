import {CHINA_PEOPLE_SEED} from './china-people-seed.mjs';
export const CHINA_REGISTRY_VERSION = 'china-people-2026-09-16-v1';
let people = CHINA_PEOPLE_SEED;
let loadedUntil = 0;
const NAME = /^[\p{Script=Han}·]{2,16}$/u;
const GOVERNMENT_CONTEXT = /中央|国务|國務|政治局|书记|書記|部长|部長|省长|省長|市长|市長|委員|委员|全国政协|全國政協|人大|外交|外长|外長|军委|軍委|检察|檢察|最高.*法院|央行|应急管理|應急管理/;
export function configureChinaPeople(rows) {
 const valid = (Array.isArray(rows)?rows:[]).filter(r=>r?.scope_enabled===true && NAME.test(r.name) && typeof r.person_key==='string' && Array.isArray(r.aliases));
 if (!valid.length) throw new Error('Empty/invalid China person registry; retain checked snapshot');
 people=valid.map(r=>({...r,aliases:[...new Set([r.name,...r.aliases].filter(n=>typeof n==='string'&&NAME.test(n)))]}));
 return people;
}
export function chinaPersonNames() { return [...new Set(people.flatMap(p=>p.aliases))]; }
export function findChinaPeople(value,{requireContext=true}={}) {
 const text=String(value||'');
 return people.filter(p=>p.aliases.some(alias=>text.includes(alias)) && (!requireContext || !p.identity_context_required || GOVERNMENT_CONTEXT.test(text)));
}
export async function loadChinaPeople(readRows,{force=false}={}) {
 if (!force && Date.now()<loadedUntil) return people;
 try { configureChinaPeople(await readRows()); loadedUntil=Date.now()+5*60_000; }
 catch(error) { console.warn('China person registry fallback:',String(error?.message||error).slice(0,120)); loadedUntil=Date.now()+30_000; }
 return people;
}
export const CHINA_PEOPLE_QUERY={select:'person_key,name,aliases,roles,status,scope_level,scope_enabled,identity_context_required,source_url,verified_at',scope_enabled:'eq.true',order:'person_key.asc',limit:'1000'};

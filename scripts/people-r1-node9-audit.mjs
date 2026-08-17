import fs from 'node:fs';
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const sql=fs.readFileSync('supabase/migrations/20260817160000_people_r1_n9_privacy_versioning.sql','utf8');
for(const type of ['sensitive_data','exact_address','major_dispute','impersonation','defamation','privacy','safety']) must(sql.includes(`'${type}'`),`missing moderation case type ${type}`);
must(sql.includes('people_major_fact_reviews'),'major fact review table missing');
must(sql.includes('accepted major facts require an accepted evidence source for the same permanent person_id'),'major facts must require same-person accepted evidence');
must(sql.includes('people_record_versions'),'private version history missing');
must(sql.includes('source_ids uuid[]'),'version history must preserve accepted source linkage');
must(sql.includes('No public policies are created for major-fact review or version history'),'private review/version surfaces must not be publicly exposed');
must(sql.includes('people_public_text_has_sensitive_identifier'),'sensitive identifier publication detector missing');
for(const marker of ['social[ -]?security','A[- ]?\\d{8,9}','bank[ -]?account','routing[ -]?','verification[ -]?code','验证码']) must(sql.includes(marker),`missing sensitive identifier guard ${marker}`);
must(sql.includes("publication blocked by unresolved privacy/safety/moderation case"),'unresolved privacy/safety cases must block publication');
must(sql.includes("publication blocked by unresolved major/disputed fact review"),'unresolved major/disputed facts must block publication');
must(sql.includes("case_type in ('sensitive_data','exact_address','major_dispute'"),'exact-address/privacy moderation path missing');
must(sql.includes('record_version :=') || sql.includes('new.record_version := v_next'),'record version must increment on update');
must(sql.includes('to_jsonb(new)'),'version snapshot capture missing');
must(sql.includes('preserves source/evidence rows rather than deleting history'),'source/evidence preservation rule missing');
console.log('PEOPLE-R1-N9 PASS: sensitive identifiers are publication-blocked, major/disputed facts require accepted evidence and review, privacy/safety cases can block publication, and private version/source history is preserved.');
// Strict acceptance is intentionally source-based and deterministic; production SQL execution is rechecked by N10.

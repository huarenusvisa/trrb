import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [migration, messagesPage, messagesScript, contactPage, contactScript, managePage, manageScript, adminQuality, adminPage, jobsHome] = await Promise.all([
  read('supabase/migrations/20260831115000_jobs_messaging_production_closure.sql'),
  read('jobs/messages.html'), read('jobs/messages.js'), read('jobs/contact.html'), read('jobs/contact.js'),
  read('jobs/manage.html'), read('jobs/manage.js'), read('admin/jobs-google-quality.js'), read('admin/index.html'), read('jobs/index.html')
]);

for (const table of ['job_conversations','job_messages','job_contact_events']) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), `${table} must revoke broad Data API grants`);
}
assert.match(migration, /grant update\(read_at\) on public\.job_messages to authenticated/, 'message bodies must be immutable after sending');
assert.doesNotMatch(migration, /grant (?:all|update) on public\.job_messages to authenticated/, 'authenticated users must not receive broad message update access');
assert.match(migration, /sender_user_id <> \(select auth\.uid\(\)\)/, 'senders must not mark their own messages as recipient-read');
assert.match(migration, /conversation\.status = 'open'/, 'closed or blocked conversations must reject new messages');
assert.match(migration, /employer_user_id <> seeker_user_id/, 'self-messaging must be rejected');

assert.match(messagesPage, /站内信/); assert.match(messagesPage, /unified-account\.js/);
assert.match(messagesScript, /job_conversations/); assert.match(messagesScript, /job_messages/);
assert.match(messagesScript, /postgres_changes/); assert.match(messagesScript, /read_at/);
assert.match(contactPage, /assets\/supabase-client\.js/); assert.match(contactPage, /登录即注册/);
assert.match(contactScript, /发送站内信/); assert.match(contactScript, /不能给自己发送站内信/);
assert.match(managePage, /我的招聘/); assert.match(managePage, /站内信/); assert.match(managePage, /edit-dialog/);
for (const expected of ['company_name','description','expires_at','contact_public','application_url']) assert.ok(manageScript.includes(expected), `my jobs editor missing ${expected}`);
assert.match(manageScript, /filled/); assert.match(manageScript, /unlisted/); assert.match(manageScript, /30 \* 86400000/);

assert.match(adminPage, /jobs-google-quality\.js/);
assert.match(adminQuality, /Google Jobs 不合格原因/);
assert.match(adminQuality, /MIN_DESCRIPTION = 100/);
assert.match(adminQuality, /greenhouse_\|jazzhr_\|lever_\|workday_\|ashby_/);
for (const reason of ['company','description','published_at','expires_at','city','state_code','application']) assert.ok(adminQuality.includes(`${reason}:`), `admin quality reason missing ${reason}`);
assert.match(jobsHome, /\/jobs\/manage\.html/); assert.match(jobsHome, /\/jobs\/messages\.html/);

console.log('Jobs owner management, Google quality dashboard and private messaging contracts passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateAuthE2eEnvironment } from './validate-auth-e2e-env.mjs';

const validEnvironment = {
  MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid',
  MAESTRO_TEST_ACCOUNT_PASSWORD: 'marked-test-password',
  MAESTRO_TEST_CONTENT_SUFFIX: 'run-123456',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
};

test('accepts a fully configured marked test account', () => {
  assert.deepEqual(validateAuthE2eEnvironment(validEnvironment), []);
});

test('rejects an unmarked account to protect real users', () => {
  const failures = validateAuthE2eEnvironment({ ...validEnvironment, MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'real-user@example.com' });
  assert.match(failures.join('\n'), /marked trrb-e2e/);
});

test('requires password and public Supabase build configuration without printing values', () => {
  const failures = validateAuthE2eEnvironment({ MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid' });
  assert.equal(failures.length, 4);
  assert.match(failures.join('\n'), /PASSWORD/);
  assert.match(failures.join('\n'), /CONTENT_SUFFIX/);
  assert.match(failures.join('\n'), /SUPABASE_URL/);
  assert.match(failures.join('\n'), /ANON_KEY/);
});

test('keeps credentials out of the flows and wires both platforms to marked-content cleanup', () => {
  const mobileRoot = path.resolve(import.meta.dirname, '..');
  const authFlow = fs.readFileSync(path.join(mobileRoot, '.maestro/auth-login.yml'), 'utf8');
  const communityFlow = fs.readFileSync(path.join(mobileRoot, '.maestro/community-lifecycle.yml'), 'utf8');
  const commentsFlow = fs.readFileSync(path.join(mobileRoot, '.maestro/news-comments-lifecycle.yml'), 'utf8');
  const cleanup = fs.readFileSync(path.join(mobileRoot, 'scripts/cleanup-community-e2e.mjs'), 'utf8');
  const commentsCleanup = fs.readFileSync(path.join(mobileRoot, 'scripts/cleanup-news-comments-e2e.mjs'), 'utf8');
  const combinedCleanup = fs.readFileSync(path.join(mobileRoot, 'scripts/cleanup-marked-e2e.mjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(mobileRoot, '.eas/workflows/auth-e2e.yml'), 'utf8');

  assert.match(authFlow, /\$\{MAESTRO_TEST_ACCOUNT_IDENTIFIER\}/);
  assert.match(authFlow, /\$\{MAESTRO_TEST_ACCOUNT_PASSWORD\}/);
  assert.match(authFlow, /profile-sign-out/);
  assert.doesNotMatch(authFlow, /password\s*:/i);
  assert.match(communityFlow, /\$\{MAESTRO_TEST_CONTENT_SUFFIX\}/);
  assert.match(communityFlow, /TRRB-E2E/);
  assert.match(communityFlow, /community-unpublish/);
  assert.match(communityFlow, /assertNotVisible/);
  assert.match(cleanup, /TRRB 自动化测试内容，无真实用户信息/);
  assert.match(cleanup, /unified-account-login/);
  assert.match(cleanup, /unpublish_post/);
  assert.doesNotMatch(cleanup, /SERVICE_ROLE|service_role/);
  assert.match(commentsFlow, /\$\{MAESTRO_TEST_CONTENT_SUFFIX\}/);
  assert.match(commentsFlow, /news-comment-delete-0/);
  assert.match(commentsFlow, /assertNotVisible/);
  assert.match(commentsCleanup, /delete_own_comment/);
  assert.match(commentsCleanup, /TRRB-E2E-/);
  assert.match(commentsCleanup, /row\?\.user_id === userId/);
  assert.doesNotMatch(commentsCleanup, /SERVICE_ROLE|service_role/);
  assert.match(workflow, /environment:\s*preview/);
  assert.match(workflow, /platform:\s*android/);
  assert.match(workflow, /platform:\s*ios/);
  assert.equal((workflow.match(/flow_path:\s*'\.maestro\/auth-login\.yml'/g) || []).length, 2);
  assert.equal((workflow.match(/flow_path:\s*'\.maestro\/community-lifecycle\.yml'/g) || []).length, 2);
  assert.equal((workflow.match(/flow_path:\s*'\.maestro\/news-comments-lifecycle\.yml'/g) || []).length, 2);
  assert.match(workflow, /after:\s*\[test_android_news_comments, test_ios_news_comments\]/);
  assert.match(combinedCleanup, /Promise\.allSettled/);
  assert.match(combinedCleanup, /cleanupCommunityE2e/);
  assert.match(combinedCleanup, /cleanupNewsCommentsE2e/);
  assert.match(workflow, /node scripts\/cleanup-marked-e2e\.mjs/);
});

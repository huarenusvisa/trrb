import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTxtPost, txtReceiptInput } from './txt-publish-core.ts';
const header = '账号：Editor@example.com\n密码：correct:password\n目标：社区\n栏目：热门讨论\n标题：测试内容标题\n正文：\n';
test('BOM and Windows line endings preserve multiline body and password punctuation', () => {
  const post = parseTxtPost('\uFEFF' + (header + '完整正文至少二十个字，这里是内容的第一段。\n标题：这是正文的一部分').replace(/\n/g, '\r\n'));
  assert.equal(post.identifier, 'editor@example.com');
  assert.equal(post.password, 'correct:password');
  assert.ok(post.content.includes('\n标题：这是正文的一部分'));
  assert.ok(!txtReceiptInput(post).includes(post.password));
});
test('rejects unsupported targets instead of publishing into a default destination', () => {
  assert.throws(() => parseTxtPost(header.replace('目标：社区', '目标：https://example.com') + '正文'.repeat(20)), /目标只能/);
});
test('rejects duplicate credential headers without displaying their values', () => {
  assert.throws(() => parseTxtPost('密码：secret-value\n' + header + '正文'.repeat(20)), error => error instanceof Error && !error.message.includes('secret-value'));
});
test('validates category and length before login', () => {
  assert.throws(() => parseTxtPost(header + '短稿'), /正文需要/);
  assert.throws(() => parseTxtPost(header.replace('热门讨论', '随便栏目') + '正文'.repeat(20)), /有效社区栏目/);
});
test('profile text posts do not require a community category or title', () => {
  const post = parseTxtPost('账号：347-555-0123\n密码：12345678\n目标：个人主页动态\n正文：这是个人动态');
  assert.equal(post.target, 'profile');
  assert.equal(post.identifier, '3475550123');
  assert.throws(() => parseTxtPost('账号：a@example.com\n密码：12345678\n目标：个人主页动态\n正文：' + '文'.repeat(2001)), /最多 2000/);
});

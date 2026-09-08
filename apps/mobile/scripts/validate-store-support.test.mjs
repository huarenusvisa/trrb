import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const support = fs.readFileSync(path.join(root, 'app-support.html'), 'utf8');
const store = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/store.config.json'), 'utf8'));
const play = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/store/google-play/listing.json'), 'utf8'));
const supportUrl = 'https://trrb.net/app-support.html';

test('both stores use the dedicated HTTPS support page', () => {
  assert.equal(store.apple.info['zh-Hans'].supportUrl, supportUrl);
  assert.equal(play.supportUrl, supportUrl);
});

test('support page exposes bilingual contact and troubleshooting guidance', () => {
  assert.match(support, /rel="canonical" href="https:\/\/trrb\.net\/app-support\.html"/);
  assert.match(support, /唐人日报 App 支持/);
  assert.match(support, /Tang Ren Daily App Support/);
  assert.match(support, /mailto:tangrenribao@gmail\.com/);
  assert.match(support, /无法登录/);
  assert.match(support, /没有收到推送/);
  assert.match(support, /收藏或历史没有同步/);
  assert.match(support, /帖子或评论未显示/);
});

test('support page links required privacy and account controls', () => {
  assert.match(support, /href="\/privacy\.html"/);
  assert.match(support, /href="\/delete-account\.html"/);
  assert.match(support, /href="\/terms\.html"/);
  assert.match(support, /请勿通过邮件发送密码或验证码/);
  assert.match(support, /Never send your password, verification code/);
});

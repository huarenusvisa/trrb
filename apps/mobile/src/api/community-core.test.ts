import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommunityApi } from './community-core.ts';

type RecordedCall = { url: string; init?: RequestInit };

function mockApi(payloads: unknown[], ok = true, status = 200) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(payloads.shift() ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const api = createCommunityApi({
    fetchImpl,
    getAccessToken: async () => 'test-access-token',
    baseUrl: 'https://example.test/community-api',
  });
  return { api, calls };
}

const post = {
  id: 'post/one', user_id: 'user-1', category: 'immigration_help', title: '测试帖子',
  content: '这是一段用于客户端契约测试的社区帖子正文。', content_label: 'question', status: 'published',
  like_count: 2, viewer_has_liked: true, comment_count: 1, created_at: '2026-09-03T00:00:00Z',
} as const;

test('loads bounded community pages and exposes the next offset', async () => {
  const { api, calls } = mockApi([{ posts: [post], next_offset: 40 }]);
  const page = await api.listPosts(20, 20);
  assert.equal(page.posts[0].id, 'post/one');
  assert.equal(page.nextOffset, 40);
  assert.equal(calls[0].url, 'https://example.test/community-api?offset=20&limit=20');
});

test('scopes a community page to an encoded category', async () => {
  const { api, calls } = mockApi([{ posts: [], next_offset: null }]);
  await api.listPosts(0, 20, 'ice_experience');
  assert.equal(calls[0].url, 'https://example.test/community-api?offset=0&limit=20&category=ice_experience');
});

test('loads an encoded post detail with the current Supabase access token', async () => {
  const { api, calls } = mockApi([{ posts: [post], comments: [], viewer_user_id: 'user-1' }]);
  const detail = await api.getPost('post/one');
  assert.equal(detail.post.id, 'post/one');
  assert.equal(detail.viewerUserId, 'user-1');
  assert.equal(detail.post.viewer_has_liked, true);
  assert.equal(calls[0].url, 'https://example.test/community-api?post_id=post%2Fone');
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), 'Bearer test-access-token');
});

test('rejects an unavailable or private post without inventing client data', async () => {
  const { api } = mockApi([{ posts: [] }]);
  await assert.rejects(() => api.getPost('missing'), /不存在、仍在审核或已经下架/);
});

test('creates a trimmed community comment through the existing action contract', async () => {
  const { api, calls } = mockApi([{ comment: { id: 'comment-1' }, pending: false }], true, 201);
  await api.createComment('post-1', '  测试评论  ');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    action: 'create_comment', post_id: 'post-1', content: '测试评论', parent_id: null,
  });
});

test('creates a reply through the existing parent comment contract', async () => {
  const { api, calls } = mockApi([{ comment: { id: 'reply-1' }, pending: false }], true, 201);
  await api.createComment('post-1', ' 回复内容 ', 'comment-1');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    action: 'create_comment', post_id: 'post-1', content: '回复内容', parent_id: 'comment-1',
  });
});

test('soft-unpublishes an owned comment through the existing community API', async () => {
  const { api, calls } = mockApi([{ ok: true, comment_id: 'comment-1', comment_count: 4 }]);
  const result = await api.unpublishComment(' comment-1 ');
  assert.equal(result.comment_count, 4);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    action: 'unpublish_comment', comment_id: 'comment-1',
  });
});

test('uses the existing API actions for like, report and owner unpublish', async () => {
  const { api, calls } = mockApi([{ liked: true, like_count: 3 }, { ok: true }, { ok: true }]);
  await api.toggleLike('post-1', true);
  await api.reportPost('post-1', '包含个人隐私');
  await api.unpublishPost('post-1');
  assert.deepEqual(calls.map((call) => JSON.parse(String(call.init?.body)).action), [
    'toggle_like', 'report_post', 'unpublish_post',
  ]);
  assert.equal(JSON.parse(String(calls[0].init?.body)).liked, true);
});

test('validates comments and reports before any network write', async () => {
  const { api, calls } = mockApi([]);
  await assert.rejects(() => api.createComment('post-1', ' '), /1–3000/);
  await assert.rejects(() => api.unpublishComment(' '), /编号无效/);
  await assert.rejects(() => api.reportPost('post-1', 'x'), /2–500/);
  assert.equal(calls.length, 0);
});

test('surfaces the server error message', async () => {
  const { api } = mockApi([{ error: '当前账号暂不能参与社区互动' }], false, 403);
  await assert.rejects(() => api.toggleLike('post-1'), /当前账号暂不能参与社区互动/);
});

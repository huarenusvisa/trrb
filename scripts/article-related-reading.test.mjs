import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRelated, isPublic } from '../article-related-ranking.mjs';
const a = (id, title, summary = '', extra = {}) => ({ id, title, summary, status: 'published', visibility: 'public', published_at: '2026-09-10T12:00:00Z', ...extra });
const now = Date.parse('2026-09-14T12:00:00Z');

test('specific event coverage outranks unrelated news, even in the same section', () => {
  const anchor = a('a', '胖东来于东来称新员工合同四年不续签', '胖东来将调整新员工培养方式');
  const rows = [a('b', '胖东来回应四年合同与员工培养安排'), a('c', '中国企业公布年度利润'), a('d', '于东来解释胖东来员工合同安排')];
  const result = rankRelated(anchor, rows, { now });
  assert.ok(result.length >= 1);
  assert.ok(result.every(x => ['b', 'd'].includes(x.article.id)));
});
test('ICE and country names alone do not establish relevance', () => {
  const anchor = a('a', 'ICE拘留案件：律师请求保释');
  const result = rankRelated(anchor, [a('b', 'ICE发布年度设备采购预算'), a('c', '美国纽约地铁票价调整'), a('d', '移民拘留期间申请释放的法院裁决')], { now });
  assert.deepEqual(result.map(x => x.article.id), ['d']);
});
test('short China social reports can match a related issue without geography', () => {
  const anchor = a('a', '高中教学楼装满栅栏，学生称像鸟笼');
  const result = rankRelated(anchor, [a('b', '校园封闭管理与教学楼围栏引讨论'), a('c', '高校举办新生音乐会')], { now });
  assert.deepEqual(result.map(x => x.article.id), ['b']);
});
test('exclude private, hidden, archived, future, seen and duplicate reports', () => {
  const anchor = a('a', '庇护工卡时钟停表问题');
  const rows = [a('b', '庇护工卡时钟如何恢复'), a('b', '庇护工卡时钟如何恢复'), a('dup', '庇护工卡时钟如何恢复'),
    a('draft', '庇护时钟停表', '', { status: 'draft' }), a('private', '庇护时钟停表', '', { visibility: 'private' }),
    a('hidden', '庇护时钟停表', '', { hidden_at: '2026-09-01' }), a('archived', '庇护时钟停表', '', { archived_at: '2026-09-01' }),
    a('future', '庇护时钟停表', '', { published_at: '2027-01-01' }), a('seen', '庇护工卡时钟停表案例'), a('copy', anchor.title)];
  assert.equal(rankRelated(anchor, rows, { now, seen: ['seen'] }).length, 1);
  assert.equal(isPublic(rows[3], now), false);
});
test('later recommendations remain connected to the entry article', () => {
  const anchor = a('a', '胖东来员工工资条引争议');
  const last = a('b', '胖东来回应工资条，提及食品安全检查');
  const result = rankRelated(anchor, [a('c', '餐馆食物中毒调查公布'), a('d', '胖东来员工工资条公布加班费')], { now, last });
  assert.deepEqual(result.map(x => x.article.id), ['d']);
});

test('real headlines about controlled substances do not match drone possession rules', () => {
  const anchor = a('a', '洛杉矶ICE拘捕持有并意图分发管制物质者费利佩·卡布雷拉·萨拉比亚');
  const result = rankRelated(anchor, [a('b', '北京无人机管理规定11月实施 禁止持有存放无人机'), a('c', '德州ICE拘捕逃避遣返26年古巴毒贩')], { now });
  assert.deepEqual(result.map(x => x.article.id), ['c']);
});

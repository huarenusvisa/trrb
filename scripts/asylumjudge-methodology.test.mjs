import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const methodology = await readFile('immigration-judge-approval-rate/methodology.html', 'utf8');

assert.doesNotMatch(methodology, /\uFFFD/, 'methodology copy must not contain damaged replacement characters');
assert.doesNotMatch(methodology, /后续会|前端后续会/, 'methodology must describe current behavior, not future placeholders');
assert.match(methodology, /法官详情页同时显示裁决批准率和全部结案批准占比/, 'methodology must describe the two currently published rate measures');
assert.match(methodology, /少于 50 件有效裁决的样本会标注为样本不足并隐藏批准率/, 'methodology must match the live small-sample threshold');
assert.match(methodology, /公开查询仅展示通过字段校验并成功导入的真实法官、年度和国籍记录/, 'methodology must accurately describe the published data state');

console.log('AsylumJudge methodology accuracy contract: PASS');

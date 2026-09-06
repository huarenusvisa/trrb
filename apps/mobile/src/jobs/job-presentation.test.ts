import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../i18n/i18n-core.ts';
import { contactLabel, employmentTypeLabel, formatJobSalary } from './job-presentation.ts';

const t = (locale: 'zh-CN' | 'zh-TW' | 'en') => (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);

test('formats salary ranges in the active interface language', () => {
  assert.equal(formatJobSalary({ salary_min: 20, salary_max: 25, salary_period: 'hour' }, 'en', t('en')), '$20–$25 / hour');
  assert.equal(formatJobSalary({ salary_min: 20, salary_max: 25, salary_period: 'hour' }, 'zh-TW', t('zh-TW')), '$20–$25 / 小時');
});

test('formats one-sided and negotiable salaries without inventing values', () => {
  assert.equal(formatJobSalary({ salary_min: 65000, salary_period: 'year' }, 'en', t('en')), '$65,000+ / year');
  assert.equal(formatJobSalary({ salary_max: 30, salary_period: 'hour' }, 'zh-CN', t('zh-CN')), '最高$30 / 小时');
  assert.equal(formatJobSalary({}, 'en', t('en')), 'Pay negotiable');
});

test('localizes known employment types and preserves unknown server values', () => {
  assert.equal(employmentTypeLabel('full_time', t('en')), 'Full time');
  assert.equal(employmentTypeLabel('part_time', t('zh-TW')), '兼職');
  assert.equal(employmentTypeLabel('seasonal', t('en')), 'seasonal');
});

test('localizes public contact actions', () => {
  assert.equal(contactLabel('phone', t('en')), 'Call');
  assert.equal(contactLabel('official_apply', t('zh-CN')), '申请职位');
  assert.equal(contactLabel(undefined, t('zh-TW')), '聯絡招聘方');
});

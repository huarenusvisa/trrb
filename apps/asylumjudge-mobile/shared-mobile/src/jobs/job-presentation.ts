import type { MessageKey, SupportedLocale } from '../i18n/i18n-core';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;
type SalaryInput = { salary_min?: number | null; salary_max?: number | null; salary_period?: string | null };

const PERIOD_KEYS: Record<string, MessageKey> = {
  hour: 'jobs.periodHour', day: 'jobs.periodDay', week: 'jobs.periodWeek', month: 'jobs.periodMonth', year: 'jobs.periodYear', job: 'jobs.periodJob',
};
const TYPE_KEYS: Record<string, MessageKey> = {
  full_time: 'jobs.typeFullTime', part_time: 'jobs.typePartTime', contract: 'jobs.typeContract', temporary: 'jobs.typeTemporary', internship: 'jobs.typeInternship', unspecified: 'jobs.typeUnspecified',
};
const CONTACT_KEYS: Record<string, MessageKey> = {
  phone: 'jobs.contactPhone', email: 'jobs.contactEmail', official_apply: 'jobs.contactApply',
};

function amount(value: number, locale: SupportedLocale): string {
  const tag = locale === 'en' ? 'en-US' : locale;
  return `$${new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(value)}`;
}

export function formatJobSalary(job: SalaryInput, locale: SupportedLocale, t: Translate): string {
  const minimum = Number(job.salary_min || 0);
  const maximum = Number(job.salary_max || 0);
  if (!minimum && !maximum) return t('jobs.salaryNegotiable');
  const periodName = job.salary_period ? t(PERIOD_KEYS[job.salary_period] || 'jobs.periodUnknown', { period: job.salary_period }) : '';
  const period = periodName ? t('jobs.periodSuffix', { period: periodName }) : '';
  if (minimum && maximum) return t('jobs.salaryRange', { minimum: amount(minimum, locale), maximum: amount(maximum, locale), period });
  if (minimum) return t('jobs.salaryMinimum', { minimum: amount(minimum, locale), period });
  return t('jobs.salaryMaximum', { maximum: amount(maximum, locale), period });
}

export function employmentTypeLabel(type: string | undefined, t: Translate): string {
  return t(TYPE_KEYS[type || 'unspecified'] || 'jobs.typeUnknown', { type: type || '' });
}

export function contactLabel(type: string | undefined, t: Translate): string {
  return t(CONTACT_KEYS[type || ''] || 'jobs.contactEmployer');
}

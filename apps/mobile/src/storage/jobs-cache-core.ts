export const JOBS_CACHE_MAX_ITEMS = 40;
export const JOBS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedJobContact = {
  type: 'phone' | 'email' | 'official_apply';
  value: string;
};

export type CachedJob = {
  id: string;
  title: string;
  description?: string;
  employment_type?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string | null;
  state_code: string;
  city: string;
  contact?: CachedJobContact | null;
};

export type JobsCacheEnvelope = {
  savedAt: number;
  items: CachedJob[];
};

function validOptionalText(value: unknown) {
  return value === undefined || value === null || typeof value === 'string';
}

function validOptionalNumber(value: unknown) {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validContact(value: unknown) {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const contact = value as CachedJobContact;
  return ['phone', 'email', 'official_apply'].includes(contact.type)
    && typeof contact.value === 'string'
    && Boolean(contact.value.trim());
}

function validJob(value: unknown): value is CachedJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as CachedJob;
  return Boolean(String(job.id || '').trim() && String(job.title || '').trim())
    && typeof job.state_code === 'string'
    && typeof job.city === 'string'
    && validOptionalText(job.description)
    && validOptionalText(job.employment_type)
    && validOptionalText(job.salary_period)
    && validOptionalNumber(job.salary_min)
    && validOptionalNumber(job.salary_max)
    && validContact(job.contact);
}

export function createBoundedJobsSnapshot(items: CachedJob[], maxItems = JOBS_CACHE_MAX_ITEMS) {
  const limit = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : JOBS_CACHE_MAX_ITEMS;
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item?.id || '').trim();
    if (!validJob(item) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

export function parseJobsCache(raw: string | null, now = Date.now()): JobsCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as JobsCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > JOBS_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(payload?.items) || payload.items.length > JOBS_CACHE_MAX_ITEMS || !payload.items.every(validJob)) return null;
    return { savedAt, items: payload.items };
  } catch {
    return null;
  }
}

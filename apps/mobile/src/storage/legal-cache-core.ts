export const LEGAL_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CachedLegalRecord = {
  id: string;
  title?: string;
  citation?: string;
  docket?: string;
  issuingBody?: string;
  publicationDate?: string;
  sourceSystem?: string;
  authorityType?: string;
};

export type LegalCacheEnvelope = { savedAt: number; records: CachedLegalRecord[] };

export function parseLegalCache(
  raw: string | null,
  options: { allowStale?: boolean; now?: number } = {},
): LegalCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as LegalCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || !Array.isArray(payload?.records)) return null;
    if (!payload.records.every((record) => record && String(record.id || '').trim())) return null;
    const now = options.now ?? Date.now();
    if (!options.allowStale && now - savedAt > LEGAL_CACHE_MAX_AGE_MS) return null;
    return { savedAt, records: payload.records };
  } catch {
    return null;
  }
}

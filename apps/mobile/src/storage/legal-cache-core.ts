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
  officialUrl?: string;
  officialPdfUrl?: string;
};

export type LegalCacheEnvelope = { savedAt: number; records: CachedLegalRecord[] };

export type CachedLegalAnalysis = {
  recordId: string;
  chineseTitle?: string;
  summary?: string;
  legalIssue?: string;
  holdingOrRule?: string;
  impact?: string;
  disclaimer?: string;
};

export type LegalAnalysisCacheEnvelope = { savedAt: number; analyses: CachedLegalAnalysis[] };

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

export function parseLegalAnalysisCache(
  raw: string | null,
  options: { allowStale?: boolean; now?: number } = {},
): LegalAnalysisCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as LegalAnalysisCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || !Array.isArray(payload?.analyses)) return null;
    if (!payload.analyses.every((analysis) => analysis && String(analysis.recordId || '').trim())) return null;
    const now = options.now ?? Date.now();
    if (!options.allowStale && now - savedAt > LEGAL_CACHE_MAX_AGE_MS) return null;
    return { savedAt, analyses: payload.analyses };
  } catch {
    return null;
  }
}

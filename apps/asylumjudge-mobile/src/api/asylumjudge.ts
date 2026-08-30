export const API_BASE = 'https://asylumjudge.com/.netlify/functions/immigration-judges';
export const MIN_REPORTABLE_DECISIONS = 50;

export type SourceRelease = {
  source_name?: string | null;
  source_url?: string | null;
  release_label?: string | null;
  source_period_start?: string | null;
  source_period_end?: string | null;
  fetched_at?: string | null;
};

export type Provenance = {
  official_release?: SourceRelease | null;
  latest_import?: (SourceRelease & {
    source_date?: string | null;
    input_rows?: number | null;
    accepted_rows?: number | null;
    completed_at?: string | null;
  }) | null;
  production_grade?: boolean;
  data_quality?: 'direct_official' | 'provisional_derivative' | string;
  methodology?: {
    grant_rate_formula?: string;
    excluded_from_rate?: string;
    minimum_reportable_decisions?: number;
    small_sample_behavior?: string;
  };
};

export type JudgeSummary = {
  id: string;
  judge_name: string;
  court_name?: string | null;
  court_city?: string | null;
  court_state?: string | null;
  total_asylum_decisions?: number;
  grants?: number;
  denials?: number;
  other_decisions?: number;
  adjudicated_decisions?: number;
  approval_rate?: number | null;
  rate_reliable?: boolean;
  minimum_reportable_decisions?: number;
  sample_status?: string;
  data_start_date?: string | null;
  data_end_date?: string | null;
  source?: string | null;
  source_updated_at?: string | null;
};

export type JudgeSearchResponse = Provenance & {
  query: string;
  count: number;
  results: JudgeSummary[];
};

export type JudgeYear = JudgeSummary & { fiscal_year: number };

export type JudgeDetailResponse = Provenance & {
  judge: JudgeSummary;
  yearly: JudgeYear[];
  nationality: Array<JudgeSummary & { nationality: string; nationality_code?: string | null }>;
  background?: {
    biography?: string | null;
    appointment_date?: string | null;
    appointment_court?: string | null;
    sources?: Array<{ url?: string; title?: string }>;
  } | null;
};

const REQUEST_TIMEOUT_MS = 15000;

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `AsylumJudge API ${response.status}`);
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('请求超时，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchJudges(query: string): Promise<JudgeSearchResponse> {
  const q = query.trim().slice(0, 100);
  if (!q) return { query: '', count: 0, results: [] };
  return getJson<JudgeSearchResponse>({ q });
}

export async function fetchJudgeDetail(id: string): Promise<JudgeDetailResponse> {
  return getJson<JudgeDetailResponse>({ mode: 'detail', id });
}

export function reportableRate(judge: JudgeSummary): number | null {
  const minimum = judge.minimum_reportable_decisions ?? MIN_REPORTABLE_DECISIONS;
  const decisions = judge.adjudicated_decisions ?? Number(judge.grants || 0) + Number(judge.denials || 0);
  if (!judge.rate_reliable || decisions < minimum || !Number.isFinite(judge.approval_rate)) return null;
  return Number(judge.approval_rate);
}

export function formatRate(judge: JudgeSummary): string {
  const rate = reportableRate(judge);
  return rate == null ? '样本不足，不显示' : `${rate.toFixed(1)}%`;
}

export function sourceLabel(data: Provenance): string {
  const release = data.official_release;
  const imported = data.latest_import;
  return release?.release_label || release?.source_name || imported?.source_name || '数据来源状态暂不可用';
}

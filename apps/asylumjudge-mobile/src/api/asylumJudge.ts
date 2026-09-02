export const API_URL = 'https://trrb.net/.netlify/functions/immigration-judges';

export type Judge = {
  id: string | number;
  judge_name: string;
  court_name?: string;
  court_city?: string;
  court_state?: string;
  total_asylum_decisions?: number;
  grants?: number;
  denials?: number;
  other_decisions?: number;
  data_start_date?: string;
  data_end_date?: string;
  source_updated_at?: string;
  background?: string;
  approval_rate?: number | null;
  adjudicated_decisions?: number;
  sample_status?: string;
};

export type OutcomeRow = {
  fiscal_year?: number;
  nationality?: string;
  nationality_code?: string;
  total_asylum_decisions?: number;
  grants?: number;
  denials?: number;
  other_decisions?: number;
  approval_rate?: number | null;
};

export type JudgeDetail = {
  judge: Judge;
  yearly?: OutcomeRow[];
  nationality?: OutcomeRow[];
  background?: string | Record<string, unknown>;
  provenance?: Record<string, unknown>;
  source_snapshot_date?: string;
};

export type Stats = {
  judges?: number;
  courts?: number;
  decisions?: number;
  provenance?: Record<string, unknown>;
};

export type Court = {
  court_name?: string;
  court?: string;
  court_city?: string;
  court_state?: string;
  city?: string;
  state?: string;
  total_asylum_decisions?: number;
  total_decisions?: number;
  grants?: number;
  denials?: number;
  approval_rate?: number;
  fiscal_year?: number;
  court_code?: string;
  [key: string]: unknown;
};

export type Country = {
  country?: string;
  country_name?: string;
  name?: string;
  code?: string;
  total_decisions?: number;
  total_asylum_decisions?: number;
  grants?: number;
  denials?: number;
  approval_rate?: number;
  nationality?: string;
  nationality_zh?: string;
  nationality_code?: string;
  [key: string]: unknown;
};

export type CourtsResponse = {
  count: number;
  courts: Court[];
  fiscal_year?: number;
  period_status?: string;
  period_end?: string;
};

export type NationalitiesResponse = {
  count: number;
  total_countries?: number;
  countries: Country[];
  source_snapshot_date?: string;
  scope_start?: string;
  scope_end?: string;
  minimum_reportable_decisions?: number;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function meritsApprovalRate(item: { grants?: number; denials?: number }) {
  const grants = numberValue(item.grants);
  const denials = numberValue(item.denials);
  const merits = grants + denials;
  return merits > 0 ? (grants / merits) * 100 : null;
}

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat('zh-CN').format(numberValue(value));
}

async function request<T>(params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`数据请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export const fetchStats = (signal?: AbortSignal) => request<Stats>({ mode: 'stats' }, signal);
export const fetchJudges = (signal?: AbortSignal) => request<{ count: number; results: Judge[] }>({ mode: 'all' }, signal);
export const fetchTopJudges = (limit = 8, signal?: AbortSignal) =>
  request<{ count: number; results: Judge[] }>({ mode: 'top', limit }, signal);
export const searchJudges = (query: string, signal?: AbortSignal) =>
  request<{ query: string; count: number; results: Judge[] }>({ q: query.trim() }, signal);
export const fetchJudgeDetail = (id: string, signal?: AbortSignal) => request<JudgeDetail>({ mode: 'detail', id }, signal);
export const fetchCourts = (signal?: AbortSignal) => request<CourtsResponse>({ mode: 'courts' }, signal);
export const fetchNationalities = (signal?: AbortSignal) =>
  request<NationalitiesResponse>({ mode: 'nationalities' }, signal);

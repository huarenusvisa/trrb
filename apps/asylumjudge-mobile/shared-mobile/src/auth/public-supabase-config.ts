const PRODUCTION_SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';

// Supabase publishable keys are designed to be bundled in public mobile clients.
// Authorization remains enforced by the signed-in user's JWT and database RLS.
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';

type PublicSupabaseEnvironment = {
  url?: string;
  key?: string;
};

function isProductionUrl(value: string) {
  return value === PRODUCTION_SUPABASE_URL;
}

function isPublishableKey(value: string) {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}

export function resolvePublicSupabaseConfig(environment: PublicSupabaseEnvironment = {}) {
  const url = environment.url?.trim() || '';
  const key = environment.key?.trim() || '';

  if (isProductionUrl(url) && isPublishableKey(key)) {
    return { url, key, source: 'environment' as const };
  }

  return {
    url: PRODUCTION_SUPABASE_URL,
    key: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    source: 'bundled-production' as const,
  };
}

export function isSafePublicSupabaseConfig(config: { url: string; key: string }) {
  return isProductionUrl(config.url) && isPublishableKey(config.key);
}

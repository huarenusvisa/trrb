(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';

  if (globalThis.supabaseClient) return;
  if (!globalThis.supabase || typeof globalThis.supabase.createClient !== 'function') {
    console.error('Supabase browser library is unavailable; shared client was not initialized.');
    return;
  }

  globalThis.supabaseClient = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();

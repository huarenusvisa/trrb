begin;

-- Supabase Storage resolves its internal tables through the authenticated
-- role's search path during user uploads. Keep public first for the app API,
-- and include storage so authenticated uploads can resolve storage.objects.
alter role authenticated set search_path = public, storage;

commit;

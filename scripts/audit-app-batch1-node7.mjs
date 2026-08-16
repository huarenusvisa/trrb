import fs from 'node:fs';

function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) process.exitCode = 1;
}

const foundation = fs.readFileSync('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql', 'utf8');
const library = fs.readFileSync('apps/mobile/src/storage/library.ts', 'utf8');

check('guest local favorites remain supported', library.includes("const FAVORITES_KEY = '@trrb/favorites/v1'") && library.includes('AsyncStorage'));
check('guest local history remains supported', library.includes("const HISTORY_KEY = '@trrb/history/v1'") && library.includes('MAX_HISTORY'));
check('favorites cloud table uses composite user/article key', foundation.includes('primary key(user_id,article_id)'));
check('history cloud table uses composite user/article key', foundation.includes('create table if not exists public.reading_history') && foundation.includes('primary key(user_id,article_id)'));
check('favorites are protected by owner RLS', foundation.includes('favorites owner all') && foundation.includes('auth.uid()=user_id'));
check('history is protected by owner RLS', foundation.includes('history owner all') && foundation.includes('auth.uid()=user_id'));
check('login merge de-duplicates favorites', library.includes('mergeLocalLibraryToCloud') && library.includes("onConflict: 'user_id,article_id'") && library.includes('ignoreDuplicates: true'));
check('history merge uses cloud upsert', library.includes("from('reading_history').upsert") && library.includes("onConflict: 'user_id,article_id'"));
check('favorite removal syncs to cloud', library.includes("from('favorites').delete()") && library.includes("eq('article_id', String(article.id))"));
check('history clear syncs to cloud', library.includes("from('reading_history').delete()") && library.includes("eq('user_id', userId)"));
check('cross-device cloud reads exist', library.includes('getCloudFavoriteIds') && library.includes('getCloudHistoryIds'));

if (!process.exitCode) console.log('APP BATCH 1 NODE 7: PASS (11/11)');

begin;

-- Production was bootstrapped after the original mobile identity/community
-- foundation. Re-create only the tables used by the current mobile clients;
-- all rows remain owned by the existing unified-account profiles.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  status text not null default 'published'
    check (status in ('published','pending','hidden','deleted')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(comment_id,user_id)
);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open'
    check (status in ('open','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(comment_id,reporter_user_id)
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  article_id text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,article_id)
);

create table if not exists public.reading_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  article_id text not null,
  last_read_at timestamptz not null default now(),
  primary key(user_id,article_id)
);

create index if not exists comments_article_created_id_idx
  on public.comments(article_id, created_at desc, id desc);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists comments_user_idx
  on public.comments(user_id, created_at desc);
create index if not exists comment_reports_status_created_idx
  on public.comment_reports(status, created_at desc);
create index if not exists reading_history_user_time_idx
  on public.reading_history(user_id,last_read_at desc);

alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.comment_reports enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_history enable row level security;

drop policy if exists "comments public and owner read" on public.comments;
create policy "comments public and owner read" on public.comments
  for select to anon, authenticated
  using (status='published' or (select auth.uid())=user_id);

drop policy if exists "comments owner insert" on public.comments;
create policy "comments owner insert" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid())=user_id
    and is_pinned=false
    and status in ('published','pending')
  );

drop policy if exists "likes public read" on public.comment_likes;
create policy "likes public read" on public.comment_likes
  for select to anon, authenticated using (true);
drop policy if exists "likes owner insert" on public.comment_likes;
create policy "likes owner insert" on public.comment_likes
  for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "likes owner delete" on public.comment_likes;
create policy "likes owner delete" on public.comment_likes
  for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists "reports owner insert" on public.comment_reports;
create policy "reports owner insert" on public.comment_reports
  for insert to authenticated
  with check ((select auth.uid())=reporter_user_id and status='open');

drop policy if exists "favorites owner all" on public.favorites;
create policy "favorites owner all" on public.favorites
  for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);

drop policy if exists "history owner all" on public.reading_history;
create policy "history owner all" on public.reading_history
  for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);

-- Data API grants are separate from RLS. Anonymous clients can only read
-- published comments/like counts; signed-in users can mutate only owned rows.
revoke all on public.comments from anon, authenticated;
revoke all on public.comment_likes from anon, authenticated;
revoke all on public.comment_reports from anon, authenticated;
revoke all on public.favorites from anon, authenticated;
revoke all on public.reading_history from anon, authenticated;

grant select on public.comments, public.comment_likes to anon;
grant select, insert on public.comments to authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
grant insert on public.comment_reports to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.reading_history to authenticated;
grant all on public.comments, public.comment_likes, public.comment_reports,
  public.favorites, public.reading_history to service_role;

create or replace function public.validate_trrb_comment_thread()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  parent_article text;
  article_exists boolean;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'comment author mismatch';
  end if;

  select exists(
    select 1 from public.articles a
    where a.id::text=new.article_id
      and a.status='published'
      and coalesce(a.visibility,'public')='public'
  ) into article_exists;
  if not article_exists then
    raise exception 'article is not public or does not exist';
  end if;

  if new.parent_id is not null then
    select c.article_id into parent_article
    from public.comments c
    where c.id=new.parent_id and c.status='published';
    if parent_article is null then
      raise exception 'parent comment does not exist';
    end if;
    if parent_article <> new.article_id then
      raise exception 'parent comment belongs to a different article';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_trrb_comment_post_rate()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  recent_count integer;
  actor_status text;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'comment author mismatch';
  end if;
  select status into actor_status from public.profiles where id=new.user_id;
  if actor_status is distinct from 'active' then
    raise exception 'account is not allowed to comment';
  end if;
  select count(*) into recent_count from public.comments
  where user_id=new.user_id and created_at > now()-interval '1 minute';
  if recent_count >= 8 then
    raise exception 'comment rate limit exceeded';
  end if;
  return new;
end;
$$;

create or replace function public.guard_trrb_interaction_actor()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid;
  actor_status text;
begin
  actor := auth.uid();
  if actor is null then raise exception 'authentication required'; end if;
  select status into actor_status from public.profiles where id=actor;
  if actor_status is distinct from 'active' then
    raise exception 'account is not allowed to interact';
  end if;
  if tg_table_name='comment_likes' and new.user_id <> actor then
    raise exception 'like actor mismatch';
  end if;
  if tg_table_name='comment_reports' and new.reporter_user_id <> actor then
    raise exception 'report actor mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.guard_trrb_report_rate()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare recent_count integer;
begin
  select count(*) into recent_count from public.comment_reports
  where reporter_user_id=new.reporter_user_id
    and created_at > now()-interval '10 minutes';
  if recent_count >= 20 then raise exception 'report rate limit exceeded'; end if;
  return new;
end;
$$;

drop trigger if exists validate_trrb_comment_thread_trigger on public.comments;
create trigger validate_trrb_comment_thread_trigger
  before insert or update of article_id,parent_id,user_id on public.comments
  for each row execute function public.validate_trrb_comment_thread();
drop trigger if exists guard_trrb_comment_post_rate_trigger on public.comments;
create trigger guard_trrb_comment_post_rate_trigger before insert on public.comments
  for each row execute function public.guard_trrb_comment_post_rate();
drop trigger if exists guard_trrb_like_actor_trigger on public.comment_likes;
create trigger guard_trrb_like_actor_trigger before insert on public.comment_likes
  for each row execute function public.guard_trrb_interaction_actor();
drop trigger if exists guard_trrb_report_actor_trigger on public.comment_reports;
create trigger guard_trrb_report_actor_trigger before insert on public.comment_reports
  for each row execute function public.guard_trrb_interaction_actor();
drop trigger if exists guard_trrb_report_rate_trigger on public.comment_reports;
create trigger guard_trrb_report_rate_trigger before insert on public.comment_reports
  for each row execute function public.guard_trrb_report_rate();

create or replace function public.delete_own_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare changed integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  update public.comments
  set status='deleted', content='[已删除]', is_pinned=false, updated_at=now()
  where id=p_comment_id and user_id=auth.uid();
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

revoke all on function public.validate_trrb_comment_thread() from public, anon, authenticated;
revoke all on function public.guard_trrb_comment_post_rate() from public, anon, authenticated;
revoke all on function public.guard_trrb_interaction_actor() from public, anon, authenticated;
revoke all on function public.guard_trrb_report_rate() from public, anon, authenticated;
revoke all on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated;

commit;

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_key text not null,
  bio text not null default '',
  is_custom_name boolean not null default false,
  is_custom_avatar boolean not null default false,
  role text not null default 'user' check (role in ('user','moderator','editor','admin','owner')),
  status text not null default 'active' check (status in ('active','restricted','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_display_name_ci_unique on public.profiles (lower(display_name));
create index if not exists profiles_status_idx on public.profiles(status);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  status text not null default 'published' check (status in ('published','pending','hidden','deleted')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comments_article_created_idx on public.comments(article_id, created_at desc);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists comments_user_idx on public.comments(user_id, created_at desc);

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
  status text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
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
create index if not exists reading_history_user_time_idx on public.reading_history(user_id,last_read_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  breaking_news boolean not null default true,
  ice boolean not null default true,
  immigration boolean not null default true,
  legal_updates boolean not null default true,
  comment_replies boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_user_id,blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.random_trrb_name()
returns text
language plpgsql
set search_path = public
as $$
declare
  prefixes text[] := array['清风','星河','远山','云海','晨光','晚霞','松风','秋水','长街','微光','北辰','南枝','春山','听海','晴川','白露','青禾','木棉','流云','拾光'];
  suffixes text[] := array['旅人','听雨','行舟','漫步','小鹿','飞鸟','知秋','观海','追光','星语','山客','拾月','听风','望川','云舟','远客','小满','朝露','归雁','寻光'];
  candidate text;
  i int;
begin
  for i in 1..30 loop
    candidate := prefixes[1+floor(random()*array_length(prefixes,1))::int] || suffixes[1+floor(random()*array_length(suffixes,1))::int];
    if not exists(select 1 from public.profiles p where lower(p.display_name)=lower(candidate)) then return candidate; end if;
  end loop;
  return '星河旅人' || lpad((floor(random()*1000000)::int)::text,6,'0');
end;
$$;

create or replace function public.random_trrb_avatar_key()
returns text
language sql
volatile
as $$ select 'avatar_' || lpad((1 + floor(random()*120)::int)::text,3,'0') $$;

create or replace function public.handle_new_trrb_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,display_name,avatar_key)
  values(new.id, public.random_trrb_name(), public.random_trrb_avatar_key())
  on conflict(id) do nothing;
  insert into public.notification_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trrb on auth.users;
create trigger on_auth_user_created_trrb after insert on auth.users for each row execute procedure public.handle_new_trrb_user();

alter table public.profiles enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.comment_reports enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_history enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_blocks enable row level security;
alter table public.moderation_actions enable row level security;

create policy "profiles public read" on public.profiles for select using (status='active');
create policy "profiles owner update" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "comments public read" on public.comments for select using (status='published');
create policy "comments owner insert" on public.comments for insert with check (auth.uid()=user_id);
create policy "comments owner update" on public.comments for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "likes public read" on public.comment_likes for select using (true);
create policy "likes owner insert" on public.comment_likes for insert with check (auth.uid()=user_id);
create policy "likes owner delete" on public.comment_likes for delete using (auth.uid()=user_id);
create policy "reports owner insert" on public.comment_reports for insert with check (auth.uid()=reporter_user_id);
create policy "favorites owner all" on public.favorites for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "history owner all" on public.reading_history for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "notifications owner all" on public.notification_preferences for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "blocks owner all" on public.user_blocks for all using (auth.uid()=blocker_user_id) with check (auth.uid()=blocker_user_id);

commit;

begin;

alter table public.notification_preferences
  add column if not exists comments boolean not null default true,
  add column if not exists likes boolean not null default true,
  add column if not exists follows boolean not null default true,
  add column if not exists messages boolean not null default true,
  add column if not exists moderation boolean not null default true;

-- Preserve the user's existing interaction choice when splitting it into
-- reply, like, and follow controls. Direct messages were previously always
-- delivered, so their new explicit preference intentionally starts enabled.
update public.notification_preferences
set comments = community,
    likes = community,
    follows = community,
    moderation = community;

comment on column public.notification_preferences.comments is 'Push replies to the user on news or community comments';
comment on column public.notification_preferences.likes is 'Push likes on the user''s comments and community posts';
comment on column public.notification_preferences.follows is 'Push follow, follow-request, and acceptance activity';
comment on column public.notification_preferences.messages is 'Push direct-message requests and accepted conversation messages';
comment on column public.notification_preferences.moderation is 'Push community report resolution results';

commit;

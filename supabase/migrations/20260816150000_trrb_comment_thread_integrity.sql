begin;

create index if not exists comments_article_created_id_idx
  on public.comments(article_id, created_at desc, id desc);

create or replace function public.validate_trrb_comment_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_article text;
  article_exists boolean;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'comment author mismatch';
  end if;

  select exists(
    select 1
    from public.articles a
    where a.id::text = new.article_id
      and a.status = 'published'
  ) into article_exists;

  if not article_exists then
    raise exception 'article is not published or does not exist';
  end if;

  if new.parent_id is not null then
    select c.article_id into parent_article
    from public.comments c
    where c.id = new.parent_id;

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

drop trigger if exists validate_trrb_comment_thread_trigger on public.comments;
create trigger validate_trrb_comment_thread_trigger
before insert or update of article_id, parent_id, user_id
on public.comments
for each row execute function public.validate_trrb_comment_thread();

-- User edits must not be able to elevate moderation state or pin content.
create or replace function public.guard_trrb_comment_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id then
    if new.user_id <> old.user_id or new.article_id <> old.article_id or new.parent_id is distinct from old.parent_id then
      raise exception 'comment ownership/thread fields are immutable';
    end if;
    if new.is_pinned <> old.is_pinned then
      raise exception 'comment pinning is moderator managed';
    end if;
    if new.status not in (old.status, 'deleted') then
      raise exception 'comment moderation status is moderator managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trrb_comment_owner_update_trigger on public.comments;
create trigger guard_trrb_comment_owner_update_trigger
before update on public.comments
for each row execute function public.guard_trrb_comment_owner_update();

commit;

begin;

grant select, insert, update, delete on public.community_posts to service_role;
grant select, insert, update, delete on public.community_post_comments to service_role;
grant select, insert, update, delete on public.community_post_likes to service_role;
grant select, insert, update, delete on public.community_post_reports to service_role;
grant select, insert on public.community_moderation_actions to service_role;

commit;

create or replace function public.enforce_publisher_withdrawn_source() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
begin
 if new.status<>'published' then return new; end if;
 if concat_ws(' ',new.title,new.summary,new.content,new.source_name,new.source_account,new.seo_title,new.seo_description) ~* '李老师不是你老师|whyyoutouzhele' then raise exception using errcode='23514',message='该来源已由发布者撤销，不得出现在公开稿件中'; end if;
 if TG_OP='INSERT' then
   if coalesce(new.source_url,'') ~* '(x[.]com|twitter[.]com)/whyyoutouzhele/' then raise exception using errcode='23514',message='发布者已停用该采集来源'; end if;
 elsif old.status<>'published' and coalesce(new.source_url,'') ~* '(x[.]com|twitter[.]com)/whyyoutouzhele/' then raise exception using errcode='23514',message='停用来源的历史线索不得重新发布';
 end if;
 return new;
end $fn$;
revoke all on function public.enforce_publisher_withdrawn_source() from public,anon,authenticated;
drop trigger if exists articles_publisher_withdrawn_source on public.articles;
create trigger articles_publisher_withdrawn_source before insert or update of status,title,summary,content,source_name,source_account,source_url,seo_title,seo_description on public.articles for each row execute function public.enforce_publisher_withdrawn_source();
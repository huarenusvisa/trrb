create or replace function public.enforce_news_body_minimum() returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare body_text text; chinese_count integer; news_row boolean;
begin
 if new.status <> 'published' or coalesce(new.visibility,'public') <> 'public' then return new; end if;
 if tg_op='UPDATE' then
   if old.status='published' and coalesce(old.visibility,'public')='public' and new.content is not distinct from old.content then return new; end if;
 end if;
 news_row := coalesce(new.category_name,'') ~ '(ICE|美国时政|中國政治|中国政治|中国热门头条|重要新闻|热门头条)'
   or coalesce(new.automation_source,'') like 'china-hot-%'
   or coalesce(new.metadata,'{}'::jsonb) ?| array['event_fingerprint','ice_story_id','ice_story_uuid','official_content_route'];
 if not news_row or new.metadata->>'generated_by'='immigration-knowledge-daily' then return new; end if;
 body_text := regexp_replace(coalesce(new.content,''),'<(script|style)\y[^>]*>[\s\S]*?</\1>','','gi');
 body_text := regexp_replace(body_text,'<[^>]*>','','g');
 body_text := regexp_replace(body_text,'https?://[^[:space:]]+','','g');
 chinese_count := char_length(regexp_replace(body_text,'[^㐀-鿿]','','g'));
 if chinese_count < 800 then
  raise exception using errcode='23514',message='news_body_minimum_800: 新闻正文至少800个汉字，须补采后发布；短讯、人工确认和待核实均不能绕过',detail='actual_chinese_chars='||chinese_count;
 end if;
 return new;
end $$;
revoke all on function public.enforce_news_body_minimum() from public;
create trigger zzzzzz_news_body_minimum before insert or update of status,visibility,content,category_name,category_id,metadata on public.articles for each row execute function public.enforce_news_body_minimum();

create or replace function public.property_workflow_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.property_agents; b public.property_brokers;
begin
 if TG_TABLE_NAME='property_listings' then
 if NEW.status='published' then
  if NEW.authorization_confirmed is not true then raise exception '缺少授权确认'; end if;
  select * into a from property_agents where id=NEW.agent_id for share;
  if a.id is null or a.status<>'verified' then raise exception '须关联已认证经纪'; end if;
  select * into b from property_brokers where id=a.broker_id for share;
  if b.id is null or b.status<>'verified' or NEW.broker_id is distinct from a.broker_id then raise exception '所属 Broker 不匹配或未认证'; end if;
  if not exists(select 1 from property_files where entity_type='listing' and entity_id=NEW.id and category='photo' and mime_type like 'image/%') then raise exception '缺少房源图片'; end if;
  if not exists(select 1 from property_files where entity_type='listing' and entity_id=NEW.id and category in ('ownership','authorization')) then raise exception '缺少产权证明或挂牌授权'; end if;
 end if;
 elsif TG_TABLE_NAME='property_claims' then
 if NEW.status='approved' and OLD.status is distinct from 'approved' then
  if NEW.source_user_id is null or NEW.agent_id is null then raise exception '认领须绑定已登录用户与经纪主页'; end if;
  select * into a from property_agents where id=NEW.agent_id for update;
  if a.source_user_id is not null and a.source_user_id<>NEW.source_user_id then raise exception '主页已被其他用户认领'; end if;
  select * into b from property_brokers where id=a.broker_id for share;
  if a.status<>'verified' or b.status<>'verified' or b.id is null then raise exception '先核验经纪和所属 Broker'; end if;
  if not exists(select 1 from property_files where entity_type='claim' and entity_id=NEW.id and category in ('identity','license')) then raise exception '缺少认领证明'; end if;
  update property_agents set source_user_id=NEW.source_user_id,updated_at=now() where id=a.id;
 end if;
 elsif TG_TABLE_NAME='property_leads' then
 if NEW.assigned_agent_id is not null then
  if TG_OP='INSERT' or NEW.assigned_agent_id is distinct from OLD.assigned_agent_id then
   select * into a from property_agents where id=NEW.assigned_agent_id for share;
   select * into b from property_brokers where id=a.broker_id for share;
   if a.id is null or a.status<>'verified' or b.id is null or b.status<>'verified' then raise exception '只能分配给经纪及 Broker 均已认证的账号'; end if;
  end if;
 end if;
 end if;
 return NEW;
end $$;

begin;

-- N2 preserves every former asylum encyclopedia article while moving it back
-- under the unified Immigration America publishing taxonomy.
alter table public.articles
  add column if not exists immigration_path text
  check (immigration_path is null or immigration_path in (
    'study','work','employment','family','humanitarian','change-status','citizenship'
  ));

-- Classify before changing the major category so the old source remains inferable
-- from immigration_path. Default asylum material belongs to humanitarian; common
-- status/work/citizenship/family topics are routed more specifically.
update public.articles
set immigration_path = case
  when lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')) ~ '(i-765|ead|工卡|工作许可|employment authorization)' then 'work'
  when lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')) ~ '(i-130|i-730|配偶|婚姻|亲属|家庭移民|family petition)' then 'family'
  when lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')) ~ '(i-485|adjustment of status|身份调整|身份转换|change of status)' then 'change-status'
  when lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')) ~ '(n-400|入籍|naturalization|citizenship)' then 'citizenship'
  else 'humanitarian'
end
where category_name = '庇护百科'
  and immigration_path is null;

update public.articles a
set category_name = '移民美国',
    category_id = coalesce((select c.id from public.categories c where c.name='移民美国' limit 1), a.category_id)
where a.category_name = '庇护百科';

-- /admin uses the same authenticated user and the same formal JOBS-R1 tables.
-- These policies extend the existing admin_users authority; they do not create a
-- second jobs data source or an independent jobs-admin identity system.
create policy "jobs admin read listings" on public.job_listings
  for select using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  );

create policy "jobs admin govern listings" on public.job_listings
  for update using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  ) with check (
    country_code='US' and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  );

create policy "jobs admin read seekers" on public.job_seeker_posts
  for select using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  );

create policy "jobs admin govern seekers" on public.job_seeker_posts
  for update using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  ) with check (
    country_code='US' and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
        and lower(au.role) in ('owner','admin')
    )
  );

commit;

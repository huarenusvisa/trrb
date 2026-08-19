-- Public readers may only see rows that are both workflow-published and
-- explicitly marked public. Admins keep the separate management policy.
drop policy if exists "Public can read published articles" on public.articles;

create policy "Public can read published articles"
on public.articles
for select
to public
using (
  status = 'published'
  and visibility = 'public'
);

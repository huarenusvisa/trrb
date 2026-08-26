-- Keep one permissive SELECT policy per secondhand table while preserving
-- public visibility and account-scoped owner management.
drop policy if exists "secondhand public read visible" on public.secondhand_listings;
drop policy if exists "secondhand owner read" on public.secondhand_listings;
drop policy if exists "secondhand public or owner read" on public.secondhand_listings;
create policy "secondhand public or owner read" on public.secondhand_listings
for select to anon, authenticated
using ((status in ('published','sold') and moderation_hold = false) or (select auth.uid()) = seller_user_id);

drop policy if exists "secondhand images public read" on public.secondhand_listing_images;
drop policy if exists "secondhand images owner read" on public.secondhand_listing_images;
drop policy if exists "secondhand images public or owner read" on public.secondhand_listing_images;
create policy "secondhand images public or owner read" on public.secondhand_listing_images
for select to anon, authenticated
using (exists (
  select 1 from public.secondhand_listings listing
  where listing.id = listing_id
    and ((listing.status in ('published','sold') and listing.moderation_hold = false)
      or listing.seller_user_id = (select auth.uid()))
));

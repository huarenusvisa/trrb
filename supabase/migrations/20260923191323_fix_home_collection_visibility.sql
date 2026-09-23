-- Preserve article assignments and topic routes. ICE uses the combined collection;
-- Xi remains available through the homepage topic-focus area only.
update public.categories
set show_on_homepage = false, show_in_navigation = false
where slug in ('ice', 'xijinping', 'xi-jinping');

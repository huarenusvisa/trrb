-- Harden the already-deployed category trigger function against mutable search paths.
alter function public.assign_article_category_from_topic() set search_path = '';

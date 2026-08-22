-- ICE candidates must be explicitly approved by a real administrator.
update public.categories
set auto_publish = false,
    updated_at = now()
where slug = 'ice';

update public.ice_stories
set status = 'pending_review',
    human_review_status = 'required',
    scheduled_at = null,
    decision_reason = concat_ws('；', nullif(decision_reason, ''), '发布熔断：缺少真实管理员审核记录')
where status in ('approved', 'scheduled')
  and (human_review_status is distinct from 'approved' or reviewed_by is null);

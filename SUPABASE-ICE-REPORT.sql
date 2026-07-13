create table if not exists ice_user_reports (
 id uuid primary key default gen_random_uuid(),
 report_date date default current_date,
 location_text text,
 city text,
 state text,
 latitude numeric,
 longitude numeric,
 location_source text default 'user_input',
 event_description text,
 media_urls jsonb default '[]',
 status text default 'draft',
 reviewer text,
 review_time timestamp,
 review_note text,
 created_at timestamp default now()
);

create index if not exists ice_user_reports_status_idx
on ice_user_reports(status);

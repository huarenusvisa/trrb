begin;

update public.automation_controls
set display_name = '招聘抓取',
    description = '全网招聘来源采集与写入；保姆、育儿嫂、月嫂、导乐、老人护理和家政阿姨同时展示在华人工作网与华人保姆网。',
    updated_at = now()
where control_key = 'jobs';

commit;

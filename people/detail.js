(()=>{
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const qs=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const personId=params.get('id');
  const cfg=window.TRRB_SUPABASE_CONFIG||{};
  const url=cfg.url||window.SUPABASE_URL||'';
  const key=cfg.anonKey||window.SUPABASE_ANON_KEY||'';
  const fmt=d=>d?esc(String(d).slice(0,10)):'时间未公开';
  const status={living:'在世',deceased:'已故',unknown:'状态未确认'};
  const verification={unverified:'未核实',partially_verified:'部分核实',verified:'已核实',self_verified:'本人认证',family_verified:'家属认证'};
  function fail(msg){qs('personHero').innerHTML=`<p class="empty">${esc(msg)}</p>`;}
  if(!personId){fail('缺少人物ID。');return;}
  if(!url||!key||!window.supabase){fail('人物资料服务暂不可用。');return;}
  const db=window.supabase.createClient(url,key,{auth:{persistSession:false}});
  db.rpc('get_public_person_detail',{p_person_id:personId}).then(({data,error})=>{
    if(error||!data){fail('未找到已公开的人物资料。');return;}
    const p=data.person||{}; const photos=data.photos||[]; const primary=photos.find(x=>x.is_primary)||photos[0];
    qs('personHero').innerHTML=`<div class="hero">${primary?`<img src="${esc(primary.image_url)}" alt="${esc(p.primary_name)}">`:'<div></div>'}<div><h1>${esc(p.primary_name)}</h1><p>${esc(p.summary||'')}</p><div class="chips"><span class="chip">${esc(status[p.life_status]||'状态未确认')}</span><span class="chip">${esc(verification[p.verification_status]||'未核实')}</span><span class="chip">人物ID ${esc(p.id)}</span></div></div></div>`;
    qs('biography').innerHTML=p.biography?`<p>${esc(p.biography).replace(/\n/g,'<br>')}</p>`:'暂无公开内容';
    qs('arrival').innerHTML=(p.us_arrival_story||p.us_arrival_date)?`<p><strong>${fmt(p.us_arrival_date)}</strong></p><p>${esc(p.us_arrival_story||'')}</p>`:'暂无公开内容';
    const occupations=data.occupations||[];
    qs('career').innerHTML=occupations.length?occupations.map(o=>`<article><h3>${esc(o.occupation)}</h3><p class="muted">${esc(o.organization||'')}${o.start_year?` · ${esc(o.start_year)}${o.end_year?`–${esc(o.end_year)}`:'–至今'}`:''}</p><p>${esc(o.description||'')}</p></article>`).join(''):'暂无公开内容';
    const timeline=data.timeline||[];
    qs('timeline').innerHTML=timeline.length?timeline.map(t=>`<article><strong>${fmt(t.event_date)}</strong><h3>${esc(t.title)}</h3><p>${esc(t.description||'')}</p></article>`).join(''):'暂无公开内容';
    qs('photos').innerHTML=photos.length?photos.map(ph=>`<figure><img loading="lazy" src="${esc(ph.image_url)}" alt="${esc(ph.caption||p.primary_name)}"><figcaption>${esc(ph.caption||'')}</figcaption></figure>`).join(''):'暂无已审核照片';
    const stories=data.stories||[];
    qs('stories').innerHTML=stories.length?stories.map(s=>`<article><h3>${esc(s.title)}</h3><p class="muted">${s.story_year?esc(s.story_year):''}</p><p>${esc(s.story).replace(/\n/g,'<br>')}</p></article>`).join(''):'暂无公开故事';
    document.title=`${p.primary_name||'人物详情'}｜美国华人人物志｜唐人日报`;
  });
})();

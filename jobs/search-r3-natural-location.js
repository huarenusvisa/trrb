(() => {
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const $=(id)=>document.getElementById(id);
  let areas=[];

  function asSearchArea(location) {
    if (!location?.state_code || !location?.city) return null;
    return {
      slug:`natural-${location.state_code}-${location.city}`.toLowerCase().replace(/[^a-z0-9-]+/g,'-'),
      label_zh:location.label || `${location.city}, ${location.state_code}`,
      label_en:location.label || `${location.city}, ${location.state_code}`,
      area_type:'city',
      state_code:location.state_code,
      city:location.city,
      county:location.county || null,
      borough:location.borough || null,
      neighborhood:location.neighborhood || null,
      metro_slug:null,
      center_latitude:location.latitude,
      center_longitude:location.longitude,
      default_radius_miles:location.neighborhood ? 10 : 25
    };
  }

  function setMessage(text,ok=false){
    const el=$('natural-location-status');
    if(!el)return;
    el.textContent=text||'';
    el.style.color=ok?'#166534':'#9a3412';
  }

  function submitNaturalLocation(){
    const input=$('natural-location');
    const value=input?.value.trim();
    if(!value)return;
    const resolved=window.JobsR3Location?.resolve(value,areas);
    const area=asSearchArea(resolved);
    if(!area){
      if(resolved?.state_code && !resolved?.city) setMessage(`已识别 ${resolved.state_code}，再加一个城市会更准确，例如“威斯康星麦迪逊”。`);
      else setMessage('暂时没有识别这个地点。可以写中文城市、州名，或 City + 州缩写。');
      return;
    }
    if(!Number.isFinite(Number(area.center_latitude)) || !Number.isFinite(Number(area.center_longitude))){
      setMessage(`已识别 ${area.label_zh}，但当前缺少地图中心点；可改用地区标签或ZIP。`);
      return;
    }
    setMessage(`已识别：${area.label_zh}`,true);
    window.dispatchEvent(new CustomEvent('jobs:r2-search-area-selected',{detail:area}));
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    areas=await window.JobsR3Location?.loadAreas(client)||[];
    $('natural-location-btn')?.addEventListener('click',submitNaturalLocation);
    $('natural-location')?.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();submitNaturalLocation();}});
  });
})();

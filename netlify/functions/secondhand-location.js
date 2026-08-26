const { SUPABASE_URL, SERVICE_KEY, safeText, requestJson } = require('./_shared/supabase-admin');
const AUTH_API_KEY = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;

function json(statusCode, body) { return { statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=3600'}, body:JSON.stringify(body) }; }
async function authenticate(event) {
  const token=safeText(event.headers.authorization||event.headers.Authorization,2400).replace(/^Bearer\s+/i,'');
  if(!token)throw Object.assign(new Error('请先登录'),{statusCode:401});
  const user=await requestJson(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:AUTH_API_KEY,Authorization:`Bearer ${token}`}});
  if(!user?.id)throw Object.assign(new Error('登录状态已过期'),{statusCode:401});
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return json(204,{});
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  try{
    await authenticate(event);
    const body=JSON.parse(event.body||'{}'),lat=Number(body.lat),lng=Number(body.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return json(400,{error:'位置坐标无效'});
    const roundedLat=Math.round(lat*1000)/1000,roundedLng=Math.round(lng*1000)/1000;
    const url=new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format','jsonv2');url.searchParams.set('lat',String(roundedLat));url.searchParams.set('lon',String(roundedLng));url.searchParams.set('zoom','13');url.searchParams.set('addressdetails','1');
    const response=await fetch(url,{headers:{'User-Agent':'HuarenGongzuoSecondhand/1.0 (tangrenribao@gmail.com)','Accept-Language':'zh-CN,en;q=0.8'}});
    if(!response.ok)throw new Error('暂时无法读取所在区域');
    const data=await response.json(),a=data.address||{};
    const city=safeText(a.city||a.town||a.village||a.municipality||a.county,100);
    const state=safeText(a['ISO3166-2-lvl4']||'',12).split('-').pop()||safeText(a.state_code,8).toUpperCase();
    const neighborhood=safeText(a.neighbourhood||a.suburb||a.city_district||a.borough,100);
    const postal=safeText(a.postcode,16);
    const label=[neighborhood,city,state].filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).join(' · ');
    return json(200,{location_label:label||safeText(data.display_name,160),city:city||'附近地区',state_code:state,neighborhood,postal_code:postal,approximate_lat:roundedLat,approximate_lng:roundedLng});
  }catch(error){console.error('Secondhand location error:',error);return json(error.statusCode||500,{error:error.message||'无法自动读取位置'});}
};

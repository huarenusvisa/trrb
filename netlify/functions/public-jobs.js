const { rest } = require('./_shared/supabase-admin');

const BLUE_COLLAR_PRIORITY = new Map([
  ['restaurant', 1],
  ['construction', 2],
  ['logistics-warehouse', 3],
  ['truck-driver', 4],
  ['retail-grocery', 5],
  ['beauty-nail', 6],
  ['massage', 7],
  ['home-care', 8],
  ['sales', 20],
  ['office-admin', 30],
  ['education', 31],
  ['legal', 32],
  ['accounting-finance', 33],
  ['real-estate', 34],
  ['it-tech', 35],
  ['other', 40]
]);

function json(statusCode,body){return{statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60, s-maxage=60','X-Content-Type-Options':'nosniff'},body:JSON.stringify(body)}}
function timestamp(row){return Date.parse(row.published_at||row.updated_at||0)||0}
function blueCollarSort(a,b){
  const ap=BLUE_COLLAR_PRIORITY.get(a.category_slug)||50;
  const bp=BLUE_COLLAR_PRIORITY.get(b.category_slug)||50;
  if(ap!==bp)return ap-bp;
  return timestamp(b)-timestamp(a);
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return json(204,{});
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});
  try{
    const requestedLimit=Math.min(Math.max(Number(event.queryStringParameters?.limit||30),1),60);
    const sort=String(event.queryStringParameters?.sort||'blue_collar');
    const fetchLimit=sort==='latest'?requestedLimit:60;
    const rows=await rest('job_listings',{query:{select:'id,title,description,category_slug,employment_type,salary_min,salary_max,salary_period,state_code,city,county,borough,neighborhood,status,published_at,updated_at',status:'eq.open',moderation_hold:'eq.false',order:'published_at.desc.nullslast,updated_at.desc',limit:String(fetchLimit)}});
    const items=Array.isArray(rows)?rows.slice():[];
    if(sort!=='latest')items.sort(blueCollarSort);
    return json(200,{source:'job_listings',country_code:'US',sort:sort==='latest'?'latest':'blue_collar',items:items.slice(0,requestedLimit)});
  }catch(error){
    console.error('Public jobs feed error:',error);
    return json(error.statusCode||500,{error:error.message||String(error)});
  }
};
(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const $ = (id) => document.getElementById(id);
  let currentUser = null, currentProfile = null, preparedPhoto = null;
  let categories = [], areas = [];
  const aliases = {'纽约':'new york city','纽约市':'new york city','法拉盛':'flushing','皇后区':'queens','布鲁克林':'brooklyn','曼哈顿':'manhattan','长岛':'long island','洛杉矶':'los angeles','蒙特利公园':'monterey park','圣盖博':'san gabriel','旧金山':'san francisco','奥克兰':'oakland','圣何塞':'san jose','费利蒙':'fremont','波士顿':'boston','芝加哥':'chicago','西雅图':'seattle','休斯顿':'houston','休斯敦':'houston','达拉斯':'dallas','拉斯维加斯':'las vegas','华盛顿':'washington dc'};
  const stateNames = {ny:'New York',ca:'California',ma:'Massachusetts',il:'Illinois',wa:'Washington',tx:'Texas',nv:'Nevada',nj:'New Jersey',dc:'Washington'};
  const generalLocations = {
    newyork:{state_code:'NY',city:'New York City',county:null,borough:null,neighborhood:null},
    newyorkcity:{state_code:'NY',city:'New York City',county:null,borough:null,neighborhood:null},
    nyc:{state_code:'NY',city:'New York City',county:null,borough:null,neighborhood:null},
    washingtondc:{state_code:'DC',city:'Washington',county:null,borough:null,neighborhood:null}
  };
  const categoryRules = [
    ['restaurant',/餐厅|餐馆|厨|炒锅|服务员|洗碗|水台|打杂|寿司|bartender|server|cook/i],['beauty-nail',/美甲|美容|理发|发型|nail|beauty|salon/i],['massage',/按摩|推拿|massage/i],['construction',/装修|建筑|木工|电工|水管|油漆|安装|construction|electrician|plumb/i],['logistics-warehouse',/仓库|物流|打包|分拣|warehouse|logistic/i],['truck-driver',/司机|卡车|送货|驾驶|driver|truck|delivery/i],['retail-grocery',/超市|零售|收银|理货|grocery|retail|cashier/i],['home-care',/家政|护理|保姆|护工|caregiver|home care/i],['legal',/律师|法律|法务|legal|paralegal/i],['accounting-finance',/会计|财务|报税|account|finance|bookkeep/i],['real-estate',/地产|房产|经纪|real estate/i],['education',/教师|老师|教育|培训|tutor|teacher/i],['it-tech',/程序|软件|开发|IT|工程师|developer|software|engineer/i],['office-admin',/文员|前台|助理|行政|office|assistant|reception/i],['sales',/销售|业务|sales/i]
  ];
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[，,·/\\()（）\s-]+/g, '');
  const setStatus = (message) => { $('publish-status').textContent = message || ''; };

  async function toggleSignedIn(user) {
    currentUser = user || null;
    $('publish-form').classList.toggle('hidden', !currentUser);
    $('login-fields').classList.toggle('hidden', Boolean(currentUser));
    $('account-summary').classList.toggle('hidden', !currentUser);
    if (!currentUser) { $('auth-status').textContent = '输入账号后即可发布。'; return; }
    currentProfile = await window.TRUnifiedAccount.loadProfile(client, currentUser.id);
    $('account-avatar').textContent = window.TRUnifiedAccount.avatarInitial(currentProfile);
    $('account-name').textContent = currentProfile?.display_name || '统一账号';
    $('account-label').textContent = window.TRUnifiedAccount.accountLabel(currentUser);
    $('auth-status').textContent = '已登录。这个账号和头像可在唐人日报关联网站继续使用。';
    const label = window.TRUnifiedAccount.accountLabel(currentUser);
    if (!$('contact').value && (/^\+\d{10,15}$/.test(label) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label))) $('contact').value = label;
  }

  async function login() {
    const button = $('login-btn'); button.disabled = true;
    $('auth-status').textContent = '正在登录；新邮箱账号需要完成验证…';
    try {
      const result = await window.TRUnifiedAccount.loginOrRegister(client, $('login-identifier').value, $('login-password').value);
      if (result.verificationRequired) {
        $('auth-status').textContent = '验证邮件已发送。请点击邮件中的链接完成验证，然后回到这里登录。';
        return;
      }
      await toggleSignedIn(result.user);
      $('auth-status').textContent = '登录成功。';
    } catch (error) { $('auth-status').textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function loadReferenceData() {
    const [categoryResult, areaResult] = await Promise.all([
      client.from('job_categories').select('slug,label_zh').eq('is_active',true).order('sort_order'),
      client.from('job_discovery_areas').select('slug,label_zh,label_en,area_type,state_code,city,county,borough,neighborhood,metro_slug').eq('is_active',true).order('sort_order')
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (areaResult.error) throw areaResult.error;
    categories = categoryResult.data || []; areas = areaResult.data || [];
    $('location-options').innerHTML = areas.filter((row) => row.state_code).map((row) => `<option value="${row.label_zh}">${row.label_en}</option>`).join('');
  }

  const displayLocation = (area) => [area.neighborhood, area.borough, area.city, area.state_code].filter(Boolean).join(' · ');
  function resolveLocation(input) {
    const raw = String(input || '').trim();
    if (!raw) throw new Error('请填写工作地区');
    const translated = aliases[raw] || raw, needle = normalize(translated);
    if (generalLocations[needle]) return generalLocations[needle];
    let best = null, bestScore = 0;
    for (const area of areas) {
      if (!area.state_code) continue;
      const values = [area.label_zh, area.label_en, area.neighborhood, area.borough, area.city, area.county].filter(Boolean);
      let score = 0;
      for (const value of values) {
        const candidate = normalize(value);
        if (candidate === needle) score = Math.max(score, 100 + candidate.length);
        else if (needle.includes(candidate) || candidate.includes(needle)) score = Math.max(score, 40 + Math.min(candidate.length, needle.length));
      }
      if (area.state_code && normalize(raw).includes(normalize(area.state_code))) score += 12;
      if (score > bestScore) { best = area; bestScore = score; }
    }
    if (best && bestScore >= 43) return best;
    const fallback = raw.match(/^(.+?)[,，\s]+([A-Za-z]{2})$/);
    if (fallback) return {state_code:fallback[2].toUpperCase(),city:fallback[1].trim(),county:null,borough:null,neighborhood:null};
    const stateEntry = Object.entries(stateNames).find(([code,name]) => needle.includes(normalize(name)) || needle.endsWith(code));
    if (stateEntry) {
      const state = stateEntry[0].toUpperCase(), city = raw.replace(new RegExp(`${stateEntry[1]}|${state}`, 'ig'), '').replace(/[,，]/g, '').trim();
      if (city) return {state_code:state,city,county:null,borough:null,neighborhood:null};
    }
    throw new Error('地区无法确认，请写成“城市 + 州缩写”，例如 Boston, MA');
  }

  function previewLocation() {
    try { const area = resolveLocation($('location').value); $('location-state').textContent = `已自动匹配：${displayLocation(area)}`; }
    catch (error) { $('location-state').textContent = $('location').value.trim() ? error.message : '输入常用地区名称，系统会自动匹配。'; }
  }
  function inferCategory(text) { const slug = categoryRules.find(([,pattern]) => pattern.test(text))?.[0] || 'other'; return categories.some((row) => row.slug === slug) ? slug : (categories[0]?.slug || 'other'); }
  function inferEmployment(text) { if ($('employment').value !== 'auto') return $('employment').value; if (/兼职|part[ -]?time/i.test(text)) return 'part_time'; if (/合同|contract|1099/i.test(text)) return 'contract'; if (/临时|temporary|季节/i.test(text)) return 'temporary'; if (/实习|intern/i.test(text)) return 'internship'; if (/全职|full[ -]?time/i.test(text)) return 'full_time'; return 'unspecified'; }
  function parseSalary(value) { const text=String(value||'').trim(); if(!text||/面议|negotiable/i.test(text))return{salary_min:null,salary_max:null,salary_period:null}; const numbers=[...text.matchAll(/(?:\$|usd\s*)?([0-9]+(?:\.[0-9]+)?)/ig)].map(m=>Number(m[1])).filter(Number.isFinite).slice(0,2); const period=/小时|时薪|hour/i.test(text)?'hour':/每天|日薪|day/i.test(text)?'day':/每周|周薪|week/i.test(text)?'week':/每月|月薪|month/i.test(text)?'month':/每年|年薪|year/i.test(text)?'year':null; const low=numbers.length===2?Math.min(...numbers):(numbers[0]??null),high=numbers.length===2?Math.max(...numbers):null; return{salary_min:low,salary_max:high,salary_period:period}; }
  function parseContact(value) { const raw=String(value||'').trim(); if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))return{method:'email',value:raw}; const digits=raw.replace(/\D/g,''); if(digits.length>=10&&digits.length<=15)return{method:'phone',value:digits.length===10?`+1${digits}`:`+${digits}`}; throw new Error('请填写有效的联系电话或邮箱'); }
  async function ensureEmployerRole(userId) { const {error}=await client.from('job_user_roles').upsert({user_id:userId,role:'employer'},{onConflict:'user_id,role',ignoreDuplicates:true}); if(error)throw error; }
  async function reencodeImage(file) { if(!file)return null; if(file.size>15*1024*1024)throw new Error('原始图片不能超过15MB'); const bitmap=await createImageBitmap(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale)); canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close?.(); return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片处理失败')),'image/jpeg',.86)); }
  async function uploadPhoto(listingId) { if(!preparedPhoto)return; const path=`${currentUser.id}/${listingId}/${crypto.randomUUID()}.jpg`; let {error}=await client.storage.from('job-images').upload(path,preparedPhoto,{contentType:'image/jpeg',upsert:false}); if(error)throw error; ({error}=await client.from('job_listing_images').insert({listing_id:listingId,uploader_user_id:currentUser.id,storage_path:path,alt_text:'雇主上传的工作环境图片',sort_order:1})); if(error)throw error; }

  async function publish(event) {
    event.preventDefault(); if(!currentUser)return; const button=$('publish-btn'); button.disabled=true;
    try {
      setStatus('正在自动整理地区和岗位信息…');
      const area=resolveLocation($('location').value),contact=parseContact($('contact').value),combined=`${$('title').value} ${$('description').value}`,salary=parseSalary($('salary').value);
      await ensureEmployerRole(currentUser.id);
      const payload={employer_user_id:currentUser.id,category_slug:inferCategory(combined),title:$('title').value.trim(),description:$('description').value.trim(),employment_type:inferEmployment(combined),...salary,country_code:'US',state_code:area.state_code,city:area.city,county:area.county||null,borough:area.borough||null,neighborhood:area.neighborhood||null,contact_method:contact.method,contact_value:contact.value,contact_public:true,status:'open',published_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      const {data,error}=await client.from('job_listings').insert(payload).select('id').single(); if(error)throw error; await uploadPhoto(data.id);
      setStatus('发布成功，岗位已进入统一招聘数据和审核后台。'); $('publish-form').reset(); preparedPhoto=null; $('photo-preview').classList.add('hidden'); $('location-state').textContent='输入常用地区名称，系统会自动匹配。';
      const label=window.TRUnifiedAccount.accountLabel(currentUser); if(/^\+\d{10,15}$/.test(label)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label))$('contact').value=label;
    } catch(error){setStatus(`无法发布：${error.message}`)} finally{button.disabled=false}
  }

  $('login-btn').addEventListener('click',login); $('login-password').addEventListener('keydown',(event)=>{if(event.key==='Enter')login()}); $('publish-form').addEventListener('submit',publish); $('location').addEventListener('input',previewLocation); $('location').addEventListener('change',previewLocation);
  $('photo').addEventListener('change',async()=>{try{preparedPhoto=await reencodeImage($('photo').files?.[0]);if(!preparedPhoto)return $('photo-preview').classList.add('hidden');$('photo-preview').src=URL.createObjectURL(preparedPhoto);$('photo-preview').classList.remove('hidden')}catch(error){preparedPhoto=null;setStatus(error.message)}});
  document.addEventListener('DOMContentLoaded',async()=>{try{await loadReferenceData()}catch(error){setStatus(`地区和行业数据读取失败：${error.message}`)}const{data}=await client.auth.getSession();await toggleSignedIn(data.session?.user||null)});
})();

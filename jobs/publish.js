(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const $ = (id) => document.getElementById(id);
  let currentUser = null;
  let preparedPhoto = null;

  function setStatus(message) { $('publish-status').textContent = message || ''; }
  function toggleSignedIn(user) {
    currentUser = user || null;
    $('publish-form').classList.toggle('hidden', !currentUser);
    $('auth-status').textContent = currentUser ? `已登录：${currentUser.email || currentUser.id}` : '请使用唐人日报统一账号登录后发布。';
  }

  async function loadCategories() {
    const {data,error} = await client.from('job_categories').select('slug,label_zh').eq('is_active',true).order('sort_order');
    if (error) { setStatus(`分类读取失败：${error.message}`); return; }
    $('category').innerHTML = (data || []).map((row) => `<option value="${row.slug}">${row.label_zh}</option>`).join('');
  }

  async function login() {
    $('auth-status').textContent = '正在登录…';
    const {data,error} = await client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
    if (error) { $('auth-status').textContent = `登录失败：${error.message}`; return; }
    toggleSignedIn(data.user);
  }

  async function ensureEmployerRole(userId) {
    const {error} = await client.from('job_user_roles').upsert({user_id:userId,role:'employer'},{onConflict:'user_id,role',ignoreDuplicates:true});
    if (error) throw error;
  }

  function numberOrNull(value) { return value === '' ? null : Number(value); }

  async function reencodeImage(file) {
    if (!file) return null;
    if (file.size > 15 * 1024 * 1024) throw new Error('原始图片不能超过15MB');
    const bitmap = await createImageBitmap(file);
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', {alpha:false});
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve,reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('图片处理失败')),'image/jpeg',0.86));
    return blob;
  }

  async function handlePhoto() {
    const file = $('photo').files?.[0];
    preparedPhoto = file ? await reencodeImage(file) : null;
    if (!preparedPhoto) { $('photo-preview').classList.add('hidden'); return; }
    $('photo-preview').src = URL.createObjectURL(preparedPhoto);
    $('photo-preview').classList.remove('hidden');
  }

  function payload(status) {
    const contactMethod = $('contact-method').value;
    const contactValue = $('contact-value').value.trim() || null;
    if (contactMethod !== 'platform' && !contactValue) throw new Error('电话、短信或Email方式需要填写联系方式');
    if ($('salary-min').value && $('salary-max').value && Number($('salary-max').value) < Number($('salary-min').value)) throw new Error('最高薪资不能低于最低薪资');
    return {
      employer_user_id: currentUser.id,
      category_slug: $('category').value,
      title: $('title').value.trim(),
      description: $('description').value.trim(),
      employment_type: $('employment').value,
      salary_min: numberOrNull($('salary-min').value),
      salary_max: numberOrNull($('salary-max').value),
      salary_period: $('salary-period').value || null,
      country_code: 'US',
      state_code: $('state').value.trim().toUpperCase(),
      city: $('city').value.trim(),
      county: $('county').value.trim() || null,
      borough: $('borough').value.trim() || null,
      neighborhood: $('neighborhood').value.trim() || null,
      contact_method: contactMethod,
      contact_value: contactValue,
      contact_public: $('contact-public').checked && contactMethod !== 'platform',
      status,
      published_at: status === 'open' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
  }

  async function uploadPhoto(listingId) {
    if (!preparedPhoto) return;
    const path = `${currentUser.id}/${listingId}/${crypto.randomUUID()}.jpg`;
    const {error:uploadError} = await client.storage.from('job-images').upload(path,preparedPhoto,{contentType:'image/jpeg',upsert:false});
    if (uploadError) throw uploadError;
    const {error:rowError} = await client.from('job_listing_images').insert({listing_id:listingId,uploader_user_id:currentUser.id,storage_path:path,alt_text:'雇主上传的工作环境图片',sort_order:1});
    if (rowError) throw rowError;
  }

  async function save(status) {
    if (!currentUser) return;
    const btn = status === 'open' ? $('publish-btn') : $('save-draft-btn');
    btn.disabled = true;
    try {
      setStatus(status === 'open' ? '正在发布到统一招聘数据库…' : '正在保存草稿…');
      await ensureEmployerRole(currentUser.id);
      const {data,error} = await client.from('job_listings').insert(payload(status)).select('id').single();
      if (error) throw error;
      await uploadPhoto(data.id);
      setStatus(status === 'open' ? `发布成功。岗位ID：${data.id}` : `草稿已保存。岗位ID：${data.id}`);
      if (status === 'open') $('publish-form').reset();
    } catch (error) {
      setStatus(`操作失败：${error.message}`);
    } finally { btn.disabled = false; }
  }

  $('login-btn').addEventListener('click', login);
  $('publish-form').addEventListener('submit', (event) => { event.preventDefault(); save('open'); });
  $('save-draft-btn').addEventListener('click', () => save('draft'));
  $('photo').addEventListener('change', () => handlePhoto().catch((error) => { preparedPhoto=null; setStatus(error.message); }));
  $('contact-method').addEventListener('change', () => { $('contact-value-row').classList.toggle('hidden', $('contact-method').value === 'platform'); });

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    const {data} = await client.auth.getSession();
    toggleSignedIn(data.session?.user || null);
    $('contact-value-row').classList.add('hidden');
  });
})();

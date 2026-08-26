const { SUPABASE_URL, SERVICE_KEY, safeText, requestJson } = require('./_shared/supabase-admin');

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.SECONDHAND_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
const AUTH_API_KEY = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;
const CATEGORIES = ['digital','baby','fashion','moving','hobby','free','home'];
const CONDITIONS = ['new','like_new','used_good','used_fair','needs_repair'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }, body: JSON.stringify(body) };
}

function responseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text.trim();
  for (const item of response?.output || []) for (const part of item?.content || []) {
    if (part?.type === 'output_text' && typeof part.text === 'string') return part.text.trim();
  }
  return '';
}

async function authenticate(event) {
  const token = safeText(event.headers.authorization || event.headers.Authorization, 2400).replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('请先登录后使用图片识别'), { statusCode:401 });
  const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:AUTH_API_KEY, Authorization:`Bearer ${token}` } });
  if (!user?.id) throw Object.assign(new Error('登录状态已过期，请重新登录'), { statusCode:401 });
  return user;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed' });
  try {
    if (!OPENAI_KEY) return json(503, { error:'图片识别服务尚未配置' });
    await authenticate(event);
    const body = JSON.parse(event.body || '{}');
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    if (!images.length) return json(400, { error:'请先上传商品图片' });
    if (images.some((value) => !/^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value)) || String(value).length > 900000)) {
      return json(400, { error:'图片格式或大小不符合识别要求' });
    }

    const schema = {
      type:'object', additionalProperties:false,
      required:['title','description','category','condition','confidence','review_note'],
      properties:{
        title:{type:'string'}, description:{type:'string'},
        category:{type:'string',enum:CATEGORIES}, condition:{type:'string',enum:CONDITIONS},
        confidence:{type:'number',minimum:0,maximum:1}, review_note:{type:'string'}
      }
    };
    const content = [
      { type:'input_text', text:[
        '分析这些二手商品实拍图片，为美国华人本地二手市场生成简体中文发布文案。',
        'title必须准确简短，不超过30个中文字符；description只写图片中可以合理确认的品牌、型号、颜色、数量、外观和可见使用痕迹。',
        '不得编造购买时间、尺寸、功能是否正常或配件是否齐全；无法确认时提醒卖家补充。',
        '分类只能选：digital手机数码、baby母婴用品、fashion服饰鞋包、moving搬家清仓、hobby收藏兴趣、free免费赠送、home家具家电。',
        '成色只能选：new全新、like_new几乎全新、used_good正常使用、used_fair明显痕迹、needs_repair需要维修。',
        'review_note用一句话指出最需要卖家确认的信息。'
      ].join('\n') },
      ...images.map((image_url) => ({ type:'input_image', image_url, detail:'low' }))
    ];
    const response = await requestJson('https://api.openai.com/v1/responses', {
      method:'POST', headers:{ Authorization:`Bearer ${OPENAI_KEY}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model:OPENAI_MODEL,
        input:[{ role:'user', content }],
        max_output_tokens:700,
        text:{ format:{ type:'json_schema', name:'secondhand_listing_suggestion', strict:true, schema } }
      })
    });
    const parsed = JSON.parse(responseText(response));
    const result = {
      title:safeText(parsed.title, 60), description:safeText(parsed.description, 4000),
      category:CATEGORIES.includes(parsed.category) ? parsed.category : 'moving',
      condition:CONDITIONS.includes(parsed.condition) ? parsed.condition : 'used_good',
      confidence:Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      review_note:safeText(parsed.review_note, 240)
    };
    if (!result.title) throw new Error('系统没有识别出有效标题，请手动填写');
    return json(200, result);
  } catch (error) {
    console.error('Secondhand AI error:', error);
    return json(error.statusCode || 500, { error:error.message || '图片识别失败，请手动填写' });
  }
};


const TOPICS = {
  study: ['F-1学生签证','J-1交流访问','M-1职业学生','CPT','OPT','STEM OPT','Day 1 CPT'],
  work: ['H-1B专业工作','L-1跨国公司派遣','O-1杰出人才','H-2A农业工','H-2B临时工','TN专业人士','E-1/E-2商业签证','R-1宗教工作者'],
  employment: ['EB-1A杰出人才','EB-1B教授研究员','EB-1C跨国高管','EB-2 NIW','EB-2 PERM','EB-3','EB-4','EB-5投资移民'],
  family: ['美国公民婚姻绿卡','绿卡配偶F2A','K-1未婚夫/妻','父母移民','子女移民','兄弟姐妹移民','CR-1/IR-1配偶移民','F1/F2B/F3/F4优先类别'],
  humanitarian: ['政治庇护','防止递解','禁止酷刑公约保护','VAWA家暴保护','U签证','T签证','SIJS特殊青少年','TPS临时保护身份'],
  'change-status': ['B-2转F-1','F-1转H-1B','J-1豁免','身份延期','身份恢复','I-485境内调整身份','EAD工卡','Advance Parole旅行许可'],
  citizenship: ['N-400入籍申请','连续居住','实际居住','英语与公民考试','入籍面试','入籍宣誓','N-600公民证明','衍生与取得公民']
};

const CATEGORY_NAMES = {
  study: '赴美留学',
  work: '赴美工作',
  employment: '职业移民',
  family: '家庭移民',
  humanitarian: '人道主义庇护',
  'change-status': '境内身份转换',
  citizenship: '入籍美国公民'
};

exports.handler = async function handler(event) {
  try {
    const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase environment' }) };
    }

    const hours = Math.max(1, Math.min(168, Number(event.queryStringParameters?.hours || 30)));
    const targetPerTopic = Math.max(1, Math.min(50, Number(event.queryStringParameters?.target || 10)));
    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
    const params = new URLSearchParams({
      select: 'id,title,category_name,published_at,status',
      status: 'eq.published',
      published_at: `gte.${cutoff}`,
      category_name: 'like.移民美国·*',
      order: 'published_at.asc',
      limit: '5000'
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: await response.text() }) };
    }
    const rows = await response.json();
    const details = [];
    for (const [key, topics] of Object.entries(TOPICS)) {
      const categoryName = CATEGORY_NAMES[key];
      for (const topic of topics) {
        const prefix = `移民美国·${categoryName}·${topic}·`;
        const matched = rows.filter(row => String(row.category_name || '').startsWith(prefix));
        details.push({
          category_key: key,
          category: categoryName,
          topic,
          count: matched.length,
          target: targetPerTopic,
          missing: Math.max(0, targetPerTopic - matched.length),
          latest_published_at: matched.length ? matched[matched.length - 1].published_at : null
        });
      }
    }

    const total = details.reduce((sum, item) => sum + item.count, 0);
    const totalTarget = details.length * targetPerTopic;
    const completedTopics = details.filter(item => item.count >= targetPerTopic).length;
    const missingTopics = details.filter(item => item.count < targetPerTopic);
    const payload = {
      generated_at: new Date().toISOString(),
      window_hours: hours,
      topic_count: details.length,
      target_per_topic: targetPerTopic,
      total_target: totalTarget,
      total_published: total,
      remaining: Math.max(0, totalTarget - total),
      completed_topics: completedTopics,
      incomplete_topics: missingTopics.length,
      complete: missingTopics.length === 0,
      details
    };
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
      body: JSON.stringify(payload)
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

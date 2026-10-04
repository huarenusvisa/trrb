export const TXT_TEMPLATE = `账号：your-email@example.com
密码：填写账号密码
目标：社区
栏目：热门讨论
标题：填写至少四个字的标题
正文：
在这里填写完整正文，社区正文至少二十个字。正文下面的所有行都会保留。
`;

const categories = {
  热门讨论: 'hot_discussion', 移民互助: 'immigration_help', 法庭经历: 'court_experience',
  庇护面谈: 'uscis_interview', ICE经历: 'ice_experience', 律师评价: 'lawyer_review', 爆料: 'tipoff',
} as const;
export type TxtPost = {
  identifier: string; password: string; target: 'community' | 'profile';
  category: typeof categories[keyof typeof categories]; title: string; content: string;
};

export function parseTxtPost(raw: string): TxtPost {
  if (raw.length > 50000) throw new Error('TXT 文件过大，请每个文件放一篇内容。');
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  const keys: Record<string, string> = { 账号: 'identifier', 密码: 'password', 目标: 'target', 栏目: 'category', 标题: 'title' };
  let content = '';
  let foundBody = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const match = lines[i].match(/^\s*([^：:]+)[：:](.*)$/);
    if (!match) throw new Error('TXT 格式不正确，请按页面模板填写。');
    const key = match[1].trim();
    if (key === '正文') {
      content = [match[2], ...lines.slice(i + 1)].join('\n').trim();
      foundBody = true;
      break;
    }
    if (!keys[key] || fields[keys[key]] !== undefined) throw new Error('TXT 字段重复或无法识别，请按模板填写。');
    fields[keys[key]] = match[2].trim();
  }
  if (!fields.identifier || !fields.password || !foundBody || !content) throw new Error('请填写账号、密码、目标和正文。');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.identifier);
  const phone = /^\+?[\d ()-]+$/.test(fields.identifier) && fields.identifier.replace(/\D/g, '').length >= 10;
  if (!email && !phone) throw new Error('账号需要填写登录邮箱或手机号。');
  if (fields.password.length < 8 || fields.password.length > 128) throw new Error('密码需要 8–128 位。');
  const target = fields.target === '社区' ? 'community' : fields.target === '个人主页动态' ? 'profile' : null;
  if (!target) throw new Error('目标只能填写“社区”或“个人主页动态”。');
  const category = categories[fields.category as keyof typeof categories] || (Object.values(categories).includes(fields.category as TxtPost['category']) ? fields.category as TxtPost['category'] : undefined);
  if (target === 'community' && !category) throw new Error('请选择模板列出的有效社区栏目。');
  const title = fields.title || '';
  if (target === 'community' && (title.length < 4 || title.length > 120 || content.length < 20 || content.length > 12000)) throw new Error('社区标题需要 4–120 字，正文需要 20–12000 字。');
  if (target === 'profile' && content.length > 2000) throw new Error('个人主页动态正文最多 2000 字。');
  return { identifier: email ? fields.identifier.toLowerCase() : fields.identifier.replace(/[ ()-]/g, ''), password: fields.password, target, category: category || 'hot_discussion', title, content };
}

// Passwords are deliberately excluded from receipts and duplicate detection.
export function txtReceiptInput(post: TxtPost) {
  return JSON.stringify([post.identifier, post.target, post.category, post.title, post.content]);
}

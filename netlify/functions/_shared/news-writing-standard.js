const VERSION='publisher-news-standard-20261002-v3';
const BLOCKED_SOURCE=/李老师不是你老师|whyyoutouzhele/i;
const INSTRUCTIONS='发布者采写标准（2026-10-02）：停用李老师不是你老师及whyyoutouzhele账号，不得采集、重试发布或在公开稿件中引用。采集线索不是成稿，禁止直接复制截断原文、重复标题摘要或用免责声明填充正文。普通稿正文至少800个汉字，通常写至1200至1999字；深度稿沿用既定字数和资料标准。美国时政不得降为几十字或百字短讯：须检索同一事件的美国官方文件、原始报道或直接当事人材料，写清美国政府/机构/企业的具体角色，并补充至少两个有来源的美国关联事实，例如政策/法律依据、国会与执行程序、历史订单与交付、美国国内后果和下一节点。背景须与当前事件直接相关，明确日期和归因，不能拿其他国家案例冒充本次事实、拿总项目数字冒充本次订单数字、为字数虚构内容或泛泛补写中美影响。证据不足仍允许在完成采写后先发布并标注待核实，人工后续处理；此授权不允许原始线索或残句直接发布。';
function blockedSource(value){return BLOCKED_SOURCE.test(String(value || ''));}
function sourceBlocked(tweet={}){return blockedSource([tweet.source_username,tweet.source_name,tweet.source_account,tweet.source_url,tweet.x_url,tweet.metadata?.collection_source?.url,tweet.ai_payload?.source_username].filter(Boolean).join(' '));}
function assertEditedContent(article,{usPolitics=false}={}){
 const title=String(article?.title || '').trim(),content=String(article?.content || '').trim();
 if(blockedSource([title,article?.summary,content,article?.source_name,article?.source_account].join(' ')))throw new Error('已停用来源不得出现在公开稿件中');
 const text=content.replace(/<[^>]*>/g,'').replace(/https?:\/\/\S+/g,'');
 const n=(text.match(/[\u3400-\u9fff]/g)||[]).length;
 const min=usPolitics || !(article?.editorial_depth==='brief' || article?.publication_scope==='topic_only')?800:50;
 if(!title || n<min)throw new Error('正文尚未完成采写：至少'+min+'个正文汉字');
 if(/【编辑提示】|自动加工未完成|未经编辑不得发布|原文称[：:]\s*$/.test(content))throw new Error('内部线索或编辑提示不能直接发布');
 if(/[A-Za-z(（,:，：]$/.test(text.trim()))throw new Error('正文末尾疑似截断，须补全后发布');
 if((text.match(/\(/g)||[]).length!==(text.match(/\)/g)||[]).length || (text.match(/（/g)||[]).length!==(text.match(/）/g)||[]).length)throw new Error('正文括号未闭合，疑似截断');
 const sentences=text.split(/[。！？!?\n]+/u).map(x=>x.replace(/[\p{P}\p{S}\s\d]+/gu,'')).filter(x=>x.length>=12);
 const total=sentences.reduce((n,s)=>n+s.length,0),unique=[...new Set(sentences)].reduce((n,s)=>n+s.length,0);
 if(!sentences.length || (total && unique/total<0.8))throw new Error('正文未成稿或存在大量重复');
 if(usPolitics && (article?.editorial_review?.us_context_adequate!==true || String(article?.editorial_review?.us_context_evidence || '').trim().length<20))throw new Error('美国时政须经复核并交代有来源的美国具体角色及关联背景');
 return n;
}
module.exports={VERSION,INSTRUCTIONS,blockedSource,sourceBlocked,assertEditedContent};

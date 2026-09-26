// One-shot scoped integration; asserts known source anchors and never writes production data.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const changed=new Map();
const read=path=>changed.has(path)?changed.get(path):readFileSync(path,'utf8');
function once(path,before,after){const text=read(path);if(text.split(before).length!==2)throw new Error('Unexpected source anchor: '+path+' '+before.slice(0,80));changed.set(path,text.replace(before,after));}
const profile='user/profile.js',community='community/community.js';
const hashes={[profile]:'670bcac17c66bee4ccdac775ab09f6a3d8058d45',[community]:'222a8e3d8083cceeda635c7f3ee3616dde3976d3'};
for(const [path,hash] of Object.entries(hashes))if(execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim()!==hash)throw new Error('Concurrent changes; reconcile before integration: '+path);
// Separate responsive contracts: desktop side-by-side, phone/narrow tablet stacked.
once('assets/social-detail.css','@media(max-width:760px){','@media(max-width:900px){');
once('assets/social-detail.css','(min-width:761px)','(min-width:901px)');

once(profile,"    const version=++state.detailVersion;","    const version=++state.detailVersion;\n    window.TrrbDetail.prepare($('post-detail-dialog'),postId);");
once(profile,"'<p class=\"notice\">媒体暂时不可用，正文仍可阅读。</p>'","'<p class=\"notice detail-media-error\">媒体暂时不可用，正文仍可阅读。</p>'");
once(profile,'      // The article opens independently; a comment-service error cannot blank it.',`      window.TrrbDetail.enhance($('post-detail-dialog'),{
        postId,followSource:$('follow-button'),onFollow:toggleFollow,publishedAt:post.created_at
      });
      // The article opens independently; a comment-service error cannot blank it.`);
once(profile,".join(''):'<p>暂无评论。</p>';",".join(''):'<p>暂无评论。</p>';\n        window.TrrbDetail.restoreScroll($('post-detail-dialog'));");
once(profile,"    $('profile-hero').classList.remove('hidden');","    $('profile-hero').classList.remove('hidden');\n    window.TrrbDetail.syncFollow($('post-detail-dialog'));");
once(profile,'  function bind(){',"  function bind(){\n    window.TrrbDetail.bind($('post-detail-dialog'),()=>{state.detailVersion++;});");
once(profile,"    const message=form.querySelector('.form-message');","    const message=form.querySelector('.form-message');\n    const activeDetailVersion=state.detailVersion;");
once(profile,"      await openPcPost(form.dataset.pcCommentForm);","      if($('post-detail-dialog').open&&state.detailVersion===activeDetailVersion)await openPcPost(form.dataset.pcCommentForm);");

once(community,'  async function openPost(postId) {','  let communityDetailVersion=0;\n  async function openPost(postId) {');
once(community,"    if (!window.TrrbSocial.uuid(postId)) return;","    if (!window.TrrbSocial.uuid(postId)) return;\n    const version=++communityDetailVersion;\n    window.TrrbDetail.prepare($('post-dialog'),postId);");
once(community,"      const post = data.posts?.[0];","      if(version!==communityDetailVersion||!$('post-dialog').open)return;\n      const post = data.posts?.[0];");
once(community,"      if (!$('post-dialog').open) $('post-dialog').showModal();","      window.TrrbDetail.enhance($('post-dialog'),{postId});");
once(community,"    } catch (error) { $('post-detail').innerHTML=","    } catch (error) { if(version!==communityDetailVersion)return; $('post-detail').innerHTML=");
once(community,'  function bind() {',"  function bind() {\n    window.TrrbDetail.bind($('post-dialog'),()=>{communityDetailVersion++;});");
once(community,'form.reset(); await openPost(form.dataset.commentForm);',"form.reset(); if($('post-dialog').open)await openPost(form.dataset.commentForm);");

for(const path of ['user/index.html','user/center/index.html','community/index.html']){
  once(path,'</head>','  <link rel="stylesheet" href="/assets/social-detail.css?v=20260926-detail-1" />\n</head>');
  const script=path.startsWith('community/')?'community/community.js':'user/profile.js';
  once(path,`  <script src="/${script}?v=20260926-social-2"></script>`,`  <script src="/assets/social-detail.js?v=20260926-detail-1"></script>\n  <script src="/${script}?v=20260926-social-2-detail-1"></script>`);
}
for(const [path,content] of changed){writeFileSync(path,content);if(path.endsWith('.js'))execFileSync('node',['--check',path],{stdio:'inherit'});}
execFileSync('node',['--check','assets/social-detail.js'],{stdio:'inherit'});
writeFileSync('.social-detail-integration.json',JSON.stringify({version:'20260926-detail-1',changed_files:[...changed.keys()],database_writes:false,mobile_layout:'image-above-body',desktop_layout:'image-left-body-right'},null,2));
console.log(JSON.stringify({event:'social-detail-integrated',files:[...changed.keys()]}));

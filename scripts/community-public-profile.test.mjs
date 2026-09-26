import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),social=require('../assets/social-cards.js');
const user='8e5569ee-86bf-4fc1-94a3-497d2657efb0',id='588963ac-59bf-4f1c-bbf8-19e5743e3a77';
const guide={id,user_id:user,title:'庇护年费缴纳指引',content:'这是社区帖子测试，不是实际缴费建议。',status:'published',created_at:'2026-09-15T21:47:00Z',profiles:{display_name:'测试作者'}};
const client={storage:{from:bucket=>({getPublicUrl:path=>({data:{publicUrl:`https://media.example/storage/${bucket}/${path}`}})})}};

test('an author with zero dynamics still has their published community guide',()=>{
 const merged=social.merge([guide],[]);assert.equal(merged.length,1);assert.equal(merged[0].type,'community');
 const html=social.card(guide,'community',{client});assert.match(html,/庇护年费缴纳指引/);assert.ok(html.includes(`/community/?post=${id}`));assert.ok(html.includes(`/user/?id=${user}`));assert.doesNotMatch(html,/data-remove-own-content|data-edit-own-dynamic/);
});
test('dynamic cover and title link to the post, author links only to public profile',()=>{
 const html=social.card({...guide,caption:'动态标题\n动态正文',profile_post_media:[{media_type:'image',signed_url:'https://media.example/image.jpg',width:800,height:1000}]},'profile',{client});
 assert.ok(html.includes(`/user/?id=${user}&amp;post=${id}`));assert.match(html,/data-open-profile-post/);assert.match(html,/note-author/);assert.doesNotMatch(html,/data-open-post=/);
});
test('real uploaded avatar wins and absent avatar keeps a readable initial',()=>{
 const html=social.avatar({display_name:'小张',avatar_path:'person/avatar.jpg'},client);assert.match(html,/profile-media\/person\/avatar.jpg/);assert.match(html,/<img/);
 assert.doesNotMatch(social.avatar({display_name:'小张'},client),/<img/);
 assert.equal(social.safeUrl(''), '');assert.equal(social.safeUrl('javascript:alert(1)'), '');
});
test('untrusted names, captions and HTML cannot execute; only http links become links',()=>{
 const html=social.card({...guide,title:'<img src=x onerror=alert(1)>',content:'<script>bad()</script>'},'community',{client});assert.doesNotMatch(html,/<script>|<img src=x/);
 const body=social.linkify('步骤：https://epay.eoir.justice.gov/ 。 <script>x</script> javascript:alert(1)');assert.match(body,/rel="noopener noreferrer nofollow ugc"/);assert.doesNotMatch(body,/<script>|href="javascript/);
});
test('author filtering happens in database query before pagination, and public status is explicit',async()=>{
 const calls=[];const query={select(...a){calls.push(['select',...a]);return this;},eq(...a){calls.push(['eq',...a]);return this;},neq(...a){calls.push(['neq',...a]);return this;},order(){return this;},range(...a){calls.push(['range',...a]);return Promise.resolve({data:[guide],count:41,error:null});}};
 const result=await social.authorCommunityPosts({from:table=>{assert.equal(table,'community_posts');return query;}},user,{offset:30});
 assert.equal(result.count,41);assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','user_id',user],['eq','status','published']]);assert.deepEqual(calls.at(-1),['range',30,59]);
 await assert.rejects(social.authorCommunityPosts({},'bad-id'),/无效/);
});
test('public page and personal center are separate routes, center identity comes from login',()=>{
 const js=readFileSync('user/profile.js','utf8'),pub=readFileSync('user/index.html','utf8'),center=readFileSync('user/center/index.html','utf8');
 assert.match(pub,/data-profile-view="public"/);assert.match(center,/data-profile-view="owner"/);assert.doesNotMatch(pub,/id="owner-panel"/);assert.match(center,/id="owner-panel"/);
 assert.match(js,/state.userId=state.session\?\.user\?\.id\|\|''/);assert.match(js,/owner:canManage\(\)/);assert.match(js,/social.authorCommunityPosts/);assert.match(js,/Promise.allSettled/);
});
test('profile detail cannot be blocked by comment failure and supports direct links outside first page',()=>{
 const js=readFileSync('user/profile.js','utf8');assert.match(js,/评论暂时无法读取，正文不受影响/);assert.match(js,/eq\('id',postId\)\.eq\('user_id',state.userId\)/);assert.match(js,/params.get\('post'\)/);
 const community=readFileSync('community/community.js','utf8');assert.match(community,/event.preventDefault\(\); void openPost/);assert.match(community,/get\('post'\)/);
});
test('community API returns avatar path and new assets are cache-versioned on both pages',()=>{
 assert.match(readFileSync('netlify/functions/community-api.js','utf8'),/profiles!community_posts_user_id_fkey\(display_name,avatar_key,avatar_path\)/);
 for(const path of ['community/index.html','user/index.html','user/center/index.html']){const html=readFileSync(path,'utf8');assert.match(html,/social-cards.js\?v=20260926-social-2/);assert.match(html,/social-discovery.css\?v=20260926-social-2/);}
});

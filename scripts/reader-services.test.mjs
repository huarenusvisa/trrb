import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function setup(ok=true) {
 const requests=[];
 const form=(name,fields)=>({
  name:{tagName:'INPUT'},fields,dataset:{},action:'https://trrb.net/thanks',controls:[{disabled:false}],
  getAttribute:key=>key==='name'?name:null,reportValidity:()=>true,
  querySelectorAll(){return this.controls;},after(status){this.status=status;},addEventListener(type,fn){this[type]=fn;},reset(){this.didReset=true;}
 });
 const subscription=form('daily-subscribe',[['email','reader+test@example.com']]);
 const tip=form('news-tip',[['message','新闻线索 & 来源'],['name','读者']]);
 const dialog={querySelector:()=>({addEventListener(){}}),addEventListener(){}};
 const document={querySelector:()=>dialog,querySelectorAll:()=>[subscription,tip],addEventListener(){},createElement:()=>({setAttribute(){}})};
 const context={document,location:{hash:''},FormData:class extends Map{constructor(form){super(form.fields)}},File,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{requests.push({url,...options});return{ok};}};
 vm.runInNewContext(fs.readFileSync(new URL('../reader-services.js',import.meta.url),'utf8'),context);
 return{subscription,tip,requests};
}
test('both forms keep their registered name even when an input shadows form.name',async()=>{
 const {subscription,tip,requests}=setup();
 await subscription.submit({preventDefault(){}});await tip.submit({preventDefault(){}});
 assert.equal(new URLSearchParams(requests[0].body).get('form-name'),'daily-subscribe');
 assert.equal(requests[1].body.get('form-name'),'news-tip');assert.equal(requests[1].body.get('message'),'新闻线索 & 来源');
 assert.equal(tip.didReset,true);assert.match(tip.status.textContent,/线索已收到/);
});
test('submission failure preserves the draft and re-enables retry',async()=>{
 const{tip}=setup(false);await tip.submit({preventDefault(){}});
 assert.equal(tip.didReset,undefined);assert.equal(tip.controls[0].disabled,false);assert.equal(tip.dataset.sending,undefined);assert.match(tip.status.textContent,/填写内容已保留/);
});

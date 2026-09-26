/* Presentation-only enhancement. Original article/comment nodes and authenticated handlers are retained. */
(function(root){
  'use strict';
  const records=new WeakMap();
  const element=(tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const pause=video=>{try{video.pause();}catch{}};
  function lockPage(){document.documentElement.classList.toggle('trrb-detail-open',Boolean(document.querySelector('dialog.trrb-detail-modal[open]')));}
  function outside(dialog,event){const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;}
  function bind(dialog,onClose){
    if(!dialog)return null;
    let r=records.get(dialog);
    if(r){if(onClose)r.onClose=onClose;return r;}
    r={postId:'',index:0,restoreTop:0,downOutside:false,gesture:null,onClose};records.set(dialog,r);
    dialog.classList.add('trrb-detail-modal');dialog.setAttribute('aria-label','内容详情');
    dialog.addEventListener('pointerdown',event=>{r.downOutside=event.target===dialog&&outside(dialog,event);});
    dialog.addEventListener('click',event=>{
      // A drag that started inside must not accidentally dismiss the article.
      if(event.target===dialog&&r.downOutside&&outside(dialog,event)){dialog.close();return;}
      const step=event.target.closest('[data-detail-step]');
      if(step){event.preventDefault();select(dialog,r.index+Number(step.dataset.detailStep));return;}
      const dot=event.target.closest('[data-detail-slide-to]');
      if(dot){event.preventDefault();select(dialog,Number(dot.dataset.detailSlideTo));}
    });
    dialog.addEventListener('keydown',event=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing)return;
      if(event.target.closest('input,textarea,select,video,[contenteditable="true"]'))return;
      if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&r.slides?.length>1){event.preventDefault();select(dialog,r.index+(event.key==='ArrowRight'?1:-1));}
      // Escape keeps the native dialog cancel behavior and focus restoration.
    });
    dialog.addEventListener('error',event=>{
      const media=event.target;if(!media?.matches?.('img.detail-media,video.detail-media'))return;
      const slide=media.closest('.detail-slide');if(!slide)return;
      media.hidden=true;if(!slide.querySelector('.detail-media-unavailable'))slide.append(element('p','detail-media-unavailable','媒体暂时无法加载，可继续查看正文或切换其他图片。'));
    },true);
    dialog.addEventListener('close',()=>{
      dialog.querySelectorAll('video').forEach(pause);
      const closedPost=r.postId;r.postId='';r.index=0;r.restoreTop=0;r.gesture=null;r.downOutside=false;
      lockPage();if(r.onClose)r.onClose();
      const url=new URL(location.href);
      if(closedPost&&url.searchParams.get('post')===closedPost){url.searchParams.delete('post');history.replaceState(history.state,'',url);}
    });
    return r;
  }
  function prepare(dialog,postId){
    const r=bind(dialog),same=r.postId===postId&&dialog.open;
    r.restoreTop=same?(r.scroll?.scrollTop||0):0;r.index=same?r.index:0;r.postId=postId;
    dialog.querySelectorAll('video').forEach(pause);
    r.slides=[];r.gallery=null;r.scroll=null;
    root.requestAnimationFrame(lockPage);
  }
  function select(dialog,index){
    const r=records.get(dialog),n=r?.slides?.length||0;if(!n)return;
    r.index=((index%n)+n)%n;
    r.slides.forEach((slide,i)=>{
      slide.hidden=i!==r.index;slide.setAttribute('aria-hidden',String(i!==r.index));
      if(i!==r.index)slide.querySelectorAll('video').forEach(pause);
    });
    r.dots?.forEach((dot,i)=>{dot.classList.toggle('active',i===r.index);if(i===r.index)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
    if(r.counter)r.counter.textContent=`${r.index+1} / ${n}`;
    if(r.gallery)r.gallery.dataset.activeIndex=String(r.index);
  }
  function syncFollow(dialog){
    const r=records.get(dialog);if(!r?.follow)return;
    const source=r.followSource;
    r.follow.hidden=!source||source.hidden||source.classList.contains('hidden');
    r.follow.textContent=source?.textContent?.trim()||'关注';
    r.follow.setAttribute('aria-label',r.follow.textContent+'作者');
    r.follow.disabled=Boolean(r.followBusy||source?.disabled);
  }
  function restoreScroll(dialog){
    const r=records.get(dialog);if(r?.scroll&&r.restoreTop>0)r.scroll.scrollTop=r.restoreTop;
  }
  function enhance(dialog,{postId,followSource=null,onFollow=null,publishedAt=''}={}){
    const r=bind(dialog);if(!dialog.open||r.postId!==postId)return;
    const content=dialog.querySelector('#post-detail-content,#post-detail');
    if(!content||content.querySelector(':scope > .detail-layout'))return;
    const author=content.querySelector(':scope > .author-line');if(!author)return;
    const media=[...content.children].filter(el=>el.matches('.detail-media,.detail-media-error'));
    const form=content.querySelector(':scope > .detail-comment-form,:scope > .comment-form');
    const guest=content.querySelector('[data-detail-login]')?.closest('p');
    const composer=form||guest;
    const layout=element('div','detail-layout'+(media.length?'':' detail-layout-text'));
    const side=element('section','detail-content-panel');
    side.setAttribute('aria-label','作者、正文与评论');
    const header=element('header','detail-author-header');header.append(author);
    r.follow=null;r.followSource=followSource;
    if(followSource&&onFollow){
      const follow=element('button','detail-follow','关注');follow.type='button';follow.dataset.detailFollow='';r.follow=follow;
      follow.addEventListener('click',async()=>{if(r.followBusy)return;r.followBusy=true;syncFollow(dialog);try{await onFollow();}finally{r.followBusy=false;syncFollow(dialog);}});
      header.append(follow);syncFollow(dialog);
    }
    const scroll=element('div','detail-content-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','正文与评论，可滚动');r.scroll=scroll;
    media.forEach(el=>el.remove());if(composer)composer.remove();
    scroll.append(...Array.from(content.childNodes));
    if(publishedAt&&Number.isFinite(Date.parse(publishedAt))){
      const time=element('time','detail-publication-time',new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric'}).format(new Date(publishedAt)));
      time.dateTime=new Date(publishedAt).toISOString();const commentHead=scroll.querySelector('.detail-comment-head,.comment-list');scroll.insertBefore(time,commentHead||null);
    }
    side.append(header,scroll);
    if(composer){const footer=element('footer','detail-composer');footer.append(composer);side.append(footer);}else side.classList.add('detail-no-composer');
    r.slides=[];r.dots=[];r.counter=null;
    if(media.length){
      const gallery=element('section','detail-gallery');gallery.tabIndex=0;gallery.setAttribute('aria-label','图片与视频轮播');gallery.setAttribute('aria-roledescription','轮播');r.gallery=gallery;
      const stage=element('div','detail-gallery-stage');
      media.forEach((item,i)=>{
        const slide=element('div','detail-slide');slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','幻灯片');slide.setAttribute('aria-label',`${i+1} / ${media.length}`);
        if(item.tagName==='IMG'){item.draggable=false;if(!item.alt)item.alt=`动态图片 ${i+1}`;}
        if(item.tagName==='VIDEO'){item.autoplay=false;item.setAttribute('playsinline','');}
        slide.append(item);stage.append(slide);r.slides.push(slide);
      });
      gallery.append(stage);
      if(media.length>1){
        for(const [step,label,glyph] of [[-1,'上一张','‹'],[1,'下一张','›']]){const button=element('button','detail-gallery-arrow '+(step<0?'detail-prev':'detail-next'),glyph);button.type='button';button.dataset.detailStep=String(step);button.setAttribute('aria-label',label);gallery.append(button);}
        const dots=element('div','detail-gallery-dots');dots.setAttribute('role','group');dots.setAttribute('aria-label','选择图片');
        media.forEach((_,i)=>{const dot=element('button','detail-gallery-dot');dot.type='button';dot.dataset.detailSlideTo=String(i);dot.setAttribute('aria-label',`查看第 ${i+1} 张`);dots.append(dot);r.dots.push(dot);});gallery.append(dots);
        const count=element('span','detail-gallery-counter');count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');r.counter=count;gallery.append(count);
        stage.addEventListener('pointerdown',event=>{
          if(!event.isPrimary||event.button!==0||event.target.closest('video,button')){r.gesture=null;return;}
          r.gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
        });
        stage.addEventListener('pointerup',event=>{
          const start=r.gesture;r.gesture=null;if(!start||start.id!==event.pointerId)return;
          const dx=event.clientX-start.x,dy=event.clientY-start.y;
          if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4){select(dialog,r.index+(dx<0?1:-1));if(event.cancelable)event.preventDefault();}
        });
        stage.addEventListener('pointercancel',()=>{r.gesture=null;});
      }
      layout.append(gallery);
    }
    layout.append(side);content.replaceChildren(layout);
    dialog.classList.toggle('detail-has-media',media.length>0);
    select(dialog,r.index);lockPage();root.requestAnimationFrame(()=>restoreScroll(dialog));
  }
  root.TrrbDetail={bind,prepare,enhance,select,syncFollow,restoreScroll};
})(window);

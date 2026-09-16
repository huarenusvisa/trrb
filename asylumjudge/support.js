(() => {
  const dialog = document.getElementById('site-support-dialog');
  if (!dialog) return;
  const carousel = dialog.querySelector('.support-carousel');
  const tabs = [...dialog.querySelectorAll('[data-support-tab]')];
  const slides = [...dialog.querySelectorAll('.support-slide')];
  let selected = 0;
  let opener;
  const markSelected = (index) => {
    selected = index;
    tabs.forEach((tab,i) => { tab.setAttribute('aria-selected',String(i===index)); tab.tabIndex=i===index?0:-1; slides[i].inert=i!==index; });
  };
  const select = (index, smooth = false) => {
    markSelected(index);
    carousel.scrollTo({left:index*carousel.clientWidth,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
  };
  document.querySelectorAll('[data-support-open]').forEach(button => button.addEventListener('click',() => {
    opener=button;
    dialog.showModal();
    document.documentElement.classList.add('support-dialog-open');
    select(Number(button.dataset.supportOpen));
    tabs[selected].focus({preventScroll:true});
  }));
  tabs.forEach((tab,i)=> {
    tab.addEventListener('click',()=>select(i));
    tab.addEventListener('keydown',event=> {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?1:1-selected;
      select(index); tabs[index].focus({preventScroll:true});
    });
  });
  let frame;
  carousel.addEventListener('scroll',()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{if(carousel.clientWidth) markSelected(Math.min(1,Math.max(0,Math.round(carousel.scrollLeft/carousel.clientWidth))));});
  },{passive:true});
  dialog.querySelector('.support-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.documentElement.classList.remove('support-dialog-open');opener?.focus({preventScroll:true});});
  window.addEventListener('resize',()=>{if(dialog.open)select(selected);});
})();

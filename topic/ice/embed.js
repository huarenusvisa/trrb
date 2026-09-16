(function(){
  if(new URLSearchParams(location.search).get('embed')!=='1'||window.parent===window)return;
  document.documentElement.classList.add('ice-embedded');
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('#snapshot-modal:not([hidden])'))window.parent.postMessage('ice-tracking-close',location.origin);});
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||link.target==='_blank')return;const url=new URL(link.href);if(url.origin===location.origin && url.pathname!==location.pathname){link.target='_top';}});
})();

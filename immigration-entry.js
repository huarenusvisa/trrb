(function(){
  const params=new URLSearchParams(window.location.search);
  const category=(params.get('category')||'').trim();
  const path=window.location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();
  if(category==='移民美国'||path==='immigration'){
    window.location.replace('/immigrate/');
  }
})();
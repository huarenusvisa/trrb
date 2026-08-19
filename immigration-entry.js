(function(){
  const params=new URLSearchParams(window.location.search);
  const category=(params.get('category')||'').trim();
  const path=window.location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();

  // /immigration is the canonical news category. /immigrate/ is the separate
  // immigration knowledge center and must not hijack the news route.
  // Keep only a browser fallback for old query-style category links.
  if(path==='listing.html'&&category==='移民美国'){
    window.location.replace('/immigration');
  }
})();

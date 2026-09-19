(function(){
  const params=new URLSearchParams(window.location.search);
  const category=(params.get('category')||'').trim();
  const path=window.location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();

  // “移民美国” is a knowledge-base entry. Preserve the category name in the
  // database, but send legacy query-style links to the knowledge center.
  if(path==='listing.html'&&category==='移民美国'){
    window.location.replace('/immigrate/');
  }
})();

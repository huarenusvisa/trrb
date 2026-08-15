function iso(d){return d.toISOString().slice(0,10)}
const today=new Date();const start=new Date(today);start.setUTCDate(start.getUTCDate()-30);
const startIso=iso(start),endIso=iso(today);const dateFilter=`xfilter(date "${startIso.replace(/-/g,'/')}~~${endIso.replace(/-/g,'/')}")`;
const endpoint='https://ww3.ca2.uscourts.gov/dtSearch/dtisapi6.dll';
const body=new URLSearchParams();
body.append('index','*{aa12e167958cdbcaa709fa14b9161a4a} OPN');
body.append('rctopin','30');
body.append('StartDate',startIso);body.append('EndDate',endIso);
body.append('request','*');body.append('searchType','allwords');body.append('cmd','search');body.append('SearchForm','%%SearchForm%%');body.append('dtsPdfWh','*');body.append('OrigSearchForm','/decisions.html');body.append('autoStopLimit','5000');body.append('pageSize','50');body.append('sort','date');body.append('fileConditions',dateFilter);body.append('booleanConditions','');
const r=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; TRRB-Legal-Collector-Debug/1.7)','content-type':'application/x-www-form-urlencoded','accept':'text/html,*/*','referer':'https://ww3.ca2.uscourts.gov/decisions.html'},body});
const text=await r.text();console.log('status',r.status,'final',r.url,'type',r.headers.get('content-type'),'len',text.length,'filter',dateFilter);
const hrefs=[...text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);console.log('HREFS',hrefs.slice(0,200));
console.log('PDF-HREFS',hrefs.filter(x=>/pdf|dtsearch|decision|opinion/i.test(x)).slice(0,200));
console.log(text.slice(0,15000));
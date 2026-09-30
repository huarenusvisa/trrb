/* Manual homepage pins expire 48 hours after the pin action, never after an edit. */
(function(root){
  'use strict';
  const MAX_PIN_MS=48*60*60*1000;
  const time=v=>typeof v==='string'&&v.trim()?Date.parse(v):NaN;
  function pinState(row,now=Date.now()){
    const m=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
    const mode=String(m.homepage_focus_override||'auto').toLowerCase();
    const started=time(row?.homepage_pinned_at||m.homepage_focus_updated_at);
    const explicit=time(row?.homepage_pin_expires_at||m.homepage_focus_expires_at);
    const until=Number.isFinite(started)?Math.min(started+MAX_PIN_MS,Number.isFinite(explicit)?explicit:Infinity):NaN;
    const publication=time(row?.published_at||row?.created_at);
    const visible=row?.status==='published'&&row?.visibility==='public'&&!row?.hidden_at&&!row?.archived_at&&(!Number.isFinite(publication)||publication<=now);
    const active=mode==='force'&&visible&&Number.isFinite(until)&&started<=now&&now<until;
    return {active,mode:mode==='exclude'?'exclude':active?'force':'auto',pinned_at:Number.isFinite(started)?new Date(started).toISOString():null,expires_at:Number.isFinite(until)?new Date(until).toISOString():null,remaining_ms:active?until-now:0,expired:mode==='force'&&!active};
  }
  const api={MAX_PIN_MS,pinState,isPinned:(row,now)=>pinState(row,now).active,effectiveMode:(row,now)=>pinState(row,now).mode};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TrrbArticlePins=api;
})(typeof window!=='undefined'?window:globalThis);

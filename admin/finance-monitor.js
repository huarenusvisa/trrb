(function(){
  const el=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function statusPill(ok){return `<span class="status-pill ${ok?'status-published':'status-hidden'}">${ok?'正常':'异常'}</span>`}
  function renderConfig(environment={}){const rows=[['Supabase URL',environment.supabaseUrl],['Supabase 服务端权限',environment.supabaseServiceRole],['Twelve Data 商业 Key',environment.twelveDataApiKey]];el('finance-config-list').innerHTML=rows.map(([name,on])=>`<div><span>${esc(name)}</span><b class="${on?'finance-ok':'finance-wait'}">${on?'已配置':'待配置'}</b></div>`).join('')}
  function render(data){
    const checks=Array.isArray(data.checks)?data.checks:[];
    el('finance-monitor-mode').textContent=data.mode==='provider'?'正式接口':'测试数据';
    el('finance-monitor-provider').textContent=data.provider||'—';
    el('finance-monitor-coverage').textContent=data.coverage?.total!=null?`${data.coverage.total} 只`:'—';
    el('finance-monitor-health').textContent=data.ok?'正常':'需处理';
    renderConfig(data.environment);
    el('finance-checks-body').innerHTML=checks.length?checks.map(check=>`<tr><td><b>${esc(check.name)}</b><br><small>${esc(check.key)}</small></td><td>${statusPill(check.ok)}</td><td>${esc(check.status||'—')}</td><td>${esc(check.latencyMs)} ms</td></tr>`).join(''):'<tr><td colspan="4">没有返回接口检查结果。</td></tr>';
    el('finance-monitor-message').textContent=`最近检测：${new Date(data.checkedAt).toLocaleString('zh-CN')} · ${data.providerConfigured?'正式 Key 已就绪':'尚未购买/配置正式 Key，继续使用测试数据'}`;
  }
  async function loadFinanceHealth(){
    const message=el('finance-monitor-message');if(!message)return;
    message.textContent='正在检测财经接口…';
    try{
      const token=await window.getAdminAccessToken?.();
      if(!token)throw new Error('后台登录状态无效，请重新登录');
      const response=await fetch('/api/finance/admin/health',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Cache-Control':'no-cache'}});
      const body=await response.json().catch(()=>null);
      if(!response.ok&&!body?.checks)throw new Error(body?.error||`检测失败（${response.status}）`);
      render(body);
    }catch(error){message.textContent=`财经接口检测失败：${error?.message||error}`;el('finance-checks-body').innerHTML='<tr><td colspan="4">暂时无法读取，请检查登录状态与部署日志。</td></tr>'}
  }
  window.loadFinanceHealth=loadFinanceHealth;
})();

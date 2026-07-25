(function(){
  const params=new URLSearchParams(location.search);
  if(params.get('path')!=='change-status')return;

  const topic=params.get('topic')||'';
  const blueprints={
    'b2-to-f1':['B-2转F-1是什么','适用人群','合法入境与I-94','不得提前入学','学校录取与I-20','SEVIS I-901缴费','I-539身份转换申请','资金证明与学习计划','旅游目的与学习目的说明','桥梁申请与身份连续性','审理期间能否上课','申请批准后的身份生效','申请被拒后的停留问题','出境重新申请F-1签证','常见风险与拒绝原因','常见问题'],
    'f1-to-h1b':['F-1转H-1B路径概览','F-1、OPT与STEM OPT身份衔接','H-1B注册与抽签','中签后I-129申请','身份转换与领事处理区别','Cap-Gap延期','Cap-Gap期间工作授权','H-1B生效日期','OPT到期与失业天数','维持F-1身份','未中签后的备选方案','名额豁免H-1B','旅行对身份转换的影响','H-4家属身份','常见问题'],
    'j1-waiver':['J-1两年回国居住要求是什么','如何判断是否受212(e)限制','DS-2019与签证标注','咨询意见Advisory Opinion','无异议声明','利益相关政府机构申请','迫害理由豁免','极端困难豁免','康拉德30医生项目','DS-3035申请','案件编号与材料寄送','国务院审查与USCIS决定','豁免待审期间的身份规划','J-1转H-1B或绿卡','常见问题'],
    extension:['身份延期是什么','适用的非移民身份','I-94到期日判断','必须在到期前递交','I-539申请','主申请人与家属申请','延期理由与停留计划','资金证明','护照有效期','审理期间的授权停留','逾期递交与特殊情况','延期申请被拒后的后果','离境与待审申请','多次延期风险','常见问题'],
    reinstatement:['F-1身份恢复是什么','哪些情况属于失去身份','五个月内申请要求','超过五个月的例外说明','非故意或不可控原因','未从事未经授权工作','继续就读或即将复学','学校DSO与新I-20','I-539恢复身份申请','个人说明与证据','恢复申请待审期间上课','不能工作与旅行限制','恢复被拒后的后果','出境重新取得F-1身份','常见问题'],
    i485:['I-485境内调整身份是什么','必须人在美国境内','移民类别与基础申请','签证名额与排期','表A与表B','合法入境与检查放行','身份逾期与非法工作问题','245(i)与其他例外','I-485申请材料','I-864经济担保','I-693移民体检','指纹与背景审查','I-765工卡与I-131旅行许可','面试与补件','案件转移与审理','可移植性与AC21','批准、拒绝与上诉选择','常见问题'],
    ead:['EAD工卡是什么','工卡不等于移民身份','常见申请类别','I-765申请','资格类别代码','首次申请与续卡','自动延期规则','庇护申请人C08工卡','调整身份C09工卡','OPT与STEM OPT工卡','家属类工卡','递延行动与人道类工卡','生物信息与补件','工卡丢失或信息错误','未经授权工作的风险','常见问题'],
    'advance-parole':['Advance Parole是什么','旅行许可与回美证的区别','哪些申请人可以申请','I-131申请','I-485待审期间旅行','未经许可离境可能视为放弃I-485','H-1B与L-1身份例外','庇护申请人旅行风险','原籍国旅行风险','非法停留与三年十年禁令','紧急旅行许可','旅行文件有效期与次数','入境仍由CBP决定','Advance Parole不保证入境','常见问题']
  };

  const aliases={
    'b2-to-f1':['b-2转f-1','旅游转学生','i-539','i20','sevis'],
    'f1-to-h1b':['f-1转h-1b','cap-gap','opt转h1b','h1b身份转换'],
    'j1-waiver':['j-1豁免','212(e)','ds-3035','无异议声明'],
    extension:['身份延期','延期停留','i-539','extension of stay'],
    reinstatement:['身份恢复','f1恢复身份','reinstatement','失去学生身份'],
    i485:['i-485','调整身份','境内绿卡','adjustment of status'],
    ead:['ead','工卡','i-765','就业授权'],
    'advance-parole':['advance parole','旅行许可','回美证','i-131']
  };

  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  const steps=blueprints[topic];
  if(steps){
    const root=document.querySelector('#knowledge-steps');
    const title=document.querySelector('#structure-title');
    if(title)title.textContent=`${document.querySelector('#center-title')?.textContent.replace('知识中心','')||''}完整知识目录`;
    if(root)root.innerHTML=steps.map((step,index)=>`<div class="knowledge-step"><strong>${String(index+1).padStart(2,'0')} · ${esc(step)}</strong><small>按办理顺序整理身份条件、材料、风险与后续步骤</small></div>`).join('');
  }

  if(!topic||!aliases[topic])return;
  const originalFetch=window.fetch;
  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    return response;
  };
})();
export function mountBrokerage(root) {
  root.innerHTML = `
    <section class="page brokerage-page" data-page="brokerage">
      <div class="brokerage-hero">
        <span class="brokerage-kicker">唐人财经 · 投资账户</span>
        <h2>投资服务中心</h2>
        <p>此模块用于未来接入持牌合作机构后的开户、KYC、风险测评与账户状态流程。</p>
        <button class="brokerage-primary" type="button">开始开户</button>
        <button class="brokerage-secondary" type="button">已有账户，去登录</button>
      </div>
      <div class="brokerage-card"><b>模拟账户</b><span>总资产 100.00万</span></div>
      <h3>账户服务</h3>
      <div class="brokerage-list">
        <div>开户进度 <span>›</span></div>
        <div>身份与KYC <span>›</span></div>
        <div>风险测评 <span>›</span></div>
        <div>账户协议 <span>›</span></div>
        <div>客服帮助 <span>›</span></div>
      </div>
      <p class="brokerage-risk">该模块默认关闭。只有在完成适用的证券/基金销售合规安排、合作机构接入、隐私与用户协议审核后才允许对外展示。</p>
    </section>`;
}

export const brokerageStyles = `
.brokerage-hero{margin:22px 0;background:linear-gradient(135deg,#eef5ff,#f7f9fd);border-radius:18px;padding:28px;text-align:center}.brokerage-kicker{font-size:12px;color:#2f75e8;font-weight:800}.brokerage-hero h2{font-size:25px;margin:10px 0}.brokerage-hero p{color:#718096;line-height:1.7}.brokerage-primary{border:0;background:#2f75e8;color:#fff;font-size:18px;font-weight:800;padding:14px 46px;border-radius:9px}.brokerage-secondary{display:block;margin:13px auto 0;border:0;background:transparent;color:#2f75e8;font-size:15px}.brokerage-card{display:flex;justify-content:space-between;background:#fff;border:1px solid #edf0f5;border-radius:15px;padding:20px;margin:16px 0}.brokerage-list{border:1px solid #edf0f5;border-radius:15px;padding:0 18px}.brokerage-list div{display:flex;justify-content:space-between;padding:18px 0;border-bottom:1px solid #edf0f5}.brokerage-list div:last-child{border-bottom:0}.brokerage-risk{font-size:12px;color:#8b96a8;line-height:1.7;margin:26px 0}
`;

(() => {
  'use strict';

  function num(id) {
    return Number(document.getElementById(id)?.textContent || 0);
  }

  function ensureBanner() {
    const page = document.getElementById('ice-review-page');
    const tabs = document.getElementById('review-tabs');
    if (!page || !tabs) return null;
    let banner = document.getElementById('ice-pipeline-summary');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'ice-pipeline-summary';
      banner.setAttribute('role', 'status');
      banner.style.cssText = [
        'margin:14px 0',
        'padding:14px 16px',
        'border-radius:12px',
        'border:1px solid #d0d5dd',
        'background:#fff',
        'font-weight:700',
        'line-height:1.55'
      ].join(';');
      tabs.parentNode.insertBefore(banner, tabs);
    }
    return banner;
  }

  function activate(filter) {
    const button = document.querySelector(`.review-tab[data-review-filter="${filter}"]`);
    if (!button) return;
    button.click();
  }

  function update() {
    const banner = ensureBanner();
    if (!banner) return;

    const pending = num('tab-count-pending_review');
    const corroboration = num('tab-count-pending_corroboration');
    const approved = num('tab-count-approved');
    const published = num('tab-count-published');
    const failed = num('tab-count-failed');
    const totalWaiting = pending + corroboration + approved;

    if (failed > 0) {
      banner.style.borderColor = '#f04438';
      banner.style.background = '#fff4f3';
      banner.innerHTML = `⚠️ ICE流水线有 <b>${failed}</b> 条处理失败，请打开“处理失败”检查。`;
      return;
    }

    if (published > 0 && totalWaiting === 0) {
      banner.style.borderColor = '#12b76a';
      banner.style.background = '#ecfdf3';
      banner.innerHTML = `✅ 当前数据库累计已发布 <b>${published}</b> 条；待处理为0表示审核队列已处理完毕。这里是累计数量，不代表最近一轮新增数量。`;
      const active = document.querySelector('.review-tab.active')?.dataset.reviewFilter;
      if (active === 'pending_review') activate('published');
      return;
    }

    if (totalWaiting > 0) {
      banner.style.borderColor = '#f79009';
      banner.style.background = '#fffaeb';
      banner.innerHTML = `当前有 <b>${totalWaiting}</b> 条等待处理：人工审核 ${pending}、等待交叉信源 ${corroboration}、已通过待发布 ${approved}。`;
      return;
    }

    banner.style.borderColor = '#d0d5dd';
    banner.style.background = '#f9fafb';
    banner.innerHTML = '本轮暂未发现符合条件的新ICE内容；系统仍会按计划继续采集。';
  }

  const observer = new MutationObserver(() => window.setTimeout(update, 0));

  function start() {
    const tabs = document.getElementById('review-tabs');
    if (!tabs) return;
    observer.observe(tabs, { subtree: true, childList: true, characterData: true });
    document.getElementById('refresh-review')?.addEventListener('click', () => window.setTimeout(update, 500));
    update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

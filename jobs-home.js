(function () {
  function jobsMarkup() {
    return `
      <header class="immigration-hub-head jobs-hub-head">
        <h2>招聘求职</h2>
        <a href="/jobs/">进入招聘求职</a>
      </header>
      <div class="immigration-hub-grid jobs-hub-grid">
        <a href="/jobs/?mode=hiring" aria-label="进入招聘岗位入口">
          <strong>我要招聘</strong><span aria-hidden="true">›</span>
        </a>
        <a href="/jobs/?mode=seeking" aria-label="进入求职入口">
          <strong>我要求职</strong><span aria-hidden="true">›</span>
        </a>
      </div>
      <p class="jobs-hub-note">仅限美国招聘与求职。岗位和求职资料使用统一账号体系。</p>
      <a class="immigration-hub-all" href="/jobs/">查看招聘求职入口</a>`;
  }

  function replaceAsylumCard() {
    const root = document.querySelector('#sections-grid');
    if (!root) return;
    const card = root.querySelector('#asylum') || Array.from(root.querySelectorAll('.news-box')).find((item) => item.querySelector('h2')?.textContent.trim() === '庇护百科');
    if (!card) return;
    if (card.dataset.jobsHub === 'true') return;
    card.dataset.jobsHub = 'true';
    card.id = 'jobs-home-hub';
    card.classList.add('immigration-knowledge-card', 'jobs-knowledge-card');
    card.innerHTML = jobsMarkup();
  }

  function start() {
    replaceAsylumCard();
    const root = document.querySelector('#sections-grid');
    if (!root) return;
    new MutationObserver(replaceAsylumCard).observe(root, { childList: true, subtree: false });
    window.setInterval(replaceAsylumCard, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

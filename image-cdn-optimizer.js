(() => {
  "use strict";

  // Disabled on the homepage because rewriting every news image through
  // /.netlify/images caused intermittent blank cards and repeated fallbacks
  // during cold/incognito loads. Article renderers now use their original
  // image URL and their own onerror fallback directly.
  document.documentElement.dataset.trrbImageProxy = "disabled";
})();

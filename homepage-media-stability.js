(() => {
  "use strict";

  // The previous MutationObserver inserted generated gradient covers before
  // the real homepage renderer finished. On slow or private-browser loads it
  // could replace every hero and ranking image with the same placeholder.
  // Keep this file as a compatibility no-op; image fallback is handled by
  // articles-home.js only after an actual image request fails.
  document.documentElement.dataset.trrbMediaFallback = "renderer-only";
})();

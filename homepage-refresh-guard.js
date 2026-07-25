(() => {
  "use strict";

  // Previous versions restored rendered homepage HTML from sessionStorage.
  // That stale DOM was then replaced again by the live article loaders,
  // causing the visible jump/rearrangement after every refresh.
  try {
    sessionStorage.removeItem("trrb-home-render-v1");
  } catch {}
})();

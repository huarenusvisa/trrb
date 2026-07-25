(() => {
  "use strict";

  // Remove stale experiments from earlier refresh fixes. Do not intercept
  // innerHTML and do not inject placeholder cards: both could freeze the
  // archived first render and prevent live images from replacing it.
  try { sessionStorage.removeItem("trrb-home-render-v1"); } catch {}

  const style = document.createElement("style");
  style.id = "trrb-home-layout-hotfix";
  style.textContent = `
    @media (min-width: 901px) {
      .site-header .header-inner {
        height: 126px !important;
        min-height: 126px !important;
        align-items: center !important;
      }
      .site-header .brand {
        flex: 0 0 280px !important;
        width: 280px !important;
        max-width: 280px !important;
        align-self: center !important;
        margin: 0 !important;
      }
      .site-header .brand img {
        display: block !important;
        width: 280px !important;
        height: 81px !important;
        max-width: 280px !important;
        object-fit: contain !important;
        object-position: left center !important;
      }
      .site-header .slogan { min-width: 240px !important; }
    }
    #hero { min-height: 426px; }
    #top-list { min-height: 426px; }
    @media (max-width: 767px) {
      #hero { min-height: 240px; }
      #top-list { min-height: 0; }
    }
  `;
  document.head.appendChild(style);
})();

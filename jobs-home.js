(() => {
  // Jobs is still a prelaunch product. Keep this file as a compatibility shim
  // for older cached homepage shells, but do not expose or mutate homepage
  // content until the jobs product is formally launched.
  window.TRRB_JOBS_HOME_PRELAUNCH = true;
})();

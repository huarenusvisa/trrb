function bindSiteSearch() {
  const forms = document.querySelectorAll(".site-search");
  const params = new URLSearchParams(window.location.search);
  const currentQuery = params.get("q") || "";

  forms.forEach((form) => {
    const input = form.querySelector('input[name="q"]');
    if (input) input.value = currentQuery;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input ? input.value.trim() : "";
      const nextParams = new URLSearchParams();
      if (query) nextParams.set("q", query);
      window.location.href = `./listing.html${query ? `?${nextParams.toString()}` : ""}`;
    });
  });
}

bindSiteSearch();

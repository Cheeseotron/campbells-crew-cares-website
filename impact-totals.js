(() => {
  const showMinimum = (selector, value) => {
    const card = document.querySelector(selector);
    const output = card?.querySelector("strong");
    if (!card || !output || !Number.isFinite(value) || value <= 0) return;
    output.textContent = `At least ${value.toLocaleString()}+`;
    card.hidden = false;
  };

  fetch("/portal-api/public/impact", { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      const impact = payload?.impact;
      if (!impact) return;
      const years = Number(impact.years_serving || 0);
      const yearsOutput = document.querySelector("[data-impact-years]");
      if (yearsOutput && years > 0) yearsOutput.textContent = `${years} years`;
      showMinimum("[data-impact-children]", Number(impact.children_minimum || 0));
      showMinimum("[data-impact-families]", Number(impact.families_minimum || 0));
      showMinimum("[data-impact-people-fed]", Number(impact.people_fed_minimum || 0));
    })
    .catch(() => { /* The static “Since 2017” fallback remains visible. */ });
})();

document.addEventListener("DOMContentLoaded", () => {
  const formatPhone = (phone) => {
    let digits = phone.value.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length < 4) phone.value = digits;
    else if (digits.length < 7) phone.value = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else phone.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };
  document.querySelectorAll('input[type="tel"]').forEach((phone) => {
    phone.addEventListener("input", () => formatPhone(phone));
    phone.addEventListener("change", () => formatPhone(phone));
    phone.addEventListener("focus", () => formatPhone(phone));
    formatPhone(phone);
    setTimeout(() => formatPhone(phone), 250);
  });

  const form = document.querySelector("#group-signup-form");
  if (!form) return;
  const list = document.querySelector("#member-list");
  const addButton = document.querySelector("#add-volunteer-member");
  let roleGuides = {};
  let additionalMemberMarkup = "";
  try { roleGuides = JSON.parse(form.dataset.roleGuides || "{}"); } catch {}
  try { additionalMemberMarkup = JSON.parse(form.dataset.additionalMember || '\"\"'); } catch {}
  const updateGuide = (card) => {
    const select = card?.querySelector("[data-role]");
    const guide = card?.querySelector("[data-role-guide-copy]");
    if (select && guide) guide.textContent = roleGuides[select.value] || "Ask an organizer about the expectations for this role.";
  };
  const updateAgeGroup = (card) => {
    const ageGroup = card?.querySelector("[data-age-group]");
    const note = card?.querySelector("[data-minor-note]");
    const role = card?.querySelector("[data-role]");
    if (!ageGroup) return;
    const isMinor = ageGroup.value === "minor";
    if (note) note.hidden = !isMinor;
    [...(role?.options || [])].forEach((option) => {
      const adultOnly = /(^|\b)(cart checker|check-in\s*\/\s*cart checker)(\b|$)/i.test(option.value);
      option.disabled = isMinor && adultOnly;
    });
    if (isMinor && role?.selectedOptions?.[0]?.disabled) {
      const firstAvailable = [...role.options].find((option) => !option.disabled);
      if (firstAvailable) role.value = firstAvailable.value;
      updateGuide(card);
    }
  };
  addButton?.addEventListener("click", () => {
    if (!additionalMemberMarkup) return;
    list.insertAdjacentHTML("beforeend", additionalMemberMarkup);
    const card = list.lastElementChild;
    updateGuide(card);
    updateAgeGroup(card);
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    card.querySelector("[data-first]")?.focus();
  });
  list?.addEventListener("click", (event) => {
    if (event.target.matches(".member-remove")) event.target.closest("[data-member]")?.remove();
  });
  list?.addEventListener("change", (event) => {
    if (event.target.matches("[data-role]")) updateGuide(event.target.closest("[data-member]"));
    if (event.target.matches("[data-age-group]")) updateAgeGroup(event.target.closest("[data-member]"));
  });
  [...(list?.querySelectorAll("[data-member]") || [])].forEach((card) => { updateGuide(card); updateAgeGroup(card); });
  form.addEventListener("submit", (event) => {
    const members = [...list.querySelectorAll("[data-member]")].map((card) => ({
      firstName: card.querySelector("[data-first]").value,
      lastName: card.querySelector("[data-last]").value,
      email: card.querySelector("[data-email]").value,
      phone: card.querySelector("[data-phone]").value,
      role: card.querySelector("[data-role]").value,
      ageGroup: card.querySelector("[data-age-group]").value
    }));
    const emails = members.map((member) => member.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) {
      event.preventDefault();
      alert("Each volunteer needs a different email address.");
      return;
    }
    const minors = members.filter((member) => member.ageGroup === "minor");
    if (minors.length && !members.some((member) => member.ageGroup === "adult")) {
      event.preventDefault();
      alert("Volunteers under 18 must be signed up with at least one adult volunteer in this same group.");
      return;
    }
    form.elements.membersJson.value = JSON.stringify(members);
  });
});

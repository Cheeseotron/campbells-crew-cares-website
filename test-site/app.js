(function () {
  "use strict";

  const TEST_PIN = "2017";
  const SERVER_AUTH = document.documentElement.dataset.serverAuth === "true";
  const SESSION_KEY = "ccc-test-site-unlocked";
  const STATE_KEY = "ccc-signup-prototype-state-v3";
  const main = document.querySelector("#main");
  const lockScreen = document.querySelector("#lock-screen");
  const appShell = document.querySelector("#app-shell");
  const pinForm = document.querySelector("#pin-form");
  const pinInput = document.querySelector("#pin");
  const pinError = document.querySelector("#pin-error");
  const lockButton = document.querySelector("#lock-button");
  const appDialog = document.querySelector("#app-dialog");
  const dialogContent = document.querySelector("#dialog-content");

  const volunteerRoles = [
    { id: "shopper", title: "Shopping Buddy", description: "Shop one-on-one with a child and help them select essential items." },
    { id: "checkin", title: "Check-in Crew", description: "Welcome families, confirm arrival, and direct them to the right place." },
    { id: "checkout", title: "Checkout Helper", description: "Organize carts, receipts, and completed shopping groups." },
    { id: "runner", title: "Event Runner", description: "Help staff solve small needs and keep the event moving smoothly." },
    { id: "photographer", title: "Photographer", description: "Capture respectful event moments under Campbell's Crew guidelines." },
    { id: "setup", title: "Setup & Cleanup", description: "Prepare signs and stations before the event or help close afterward." }
  ];

  const acknowledgments = [
    { id: "arrival", title: "Arrival and check-in", text: "Our family will arrive at the designated Walmart Garden Center meeting location at the assigned time." },
    { id: "shopping", title: "Volunteer-led shopping", text: "Each child shops with an assigned Campbell's Crew volunteer. Parents remain in the designated waiting area and allow the volunteer to guide the experience." },
    { id: "safety", title: "Safety and accommodations", text: "A parent may intervene during an emergency or when directed by Campbell's Crew. Needed disability, medical, communication, or behavioral accommodations should be shared in advance." },
    { id: "essentials", title: "Essential items only", text: "Campbell's Crew is a bare-necessities charity. Event funds are for approved clothing, shoes, and personal necessities—not toys or other non-essential merchandise." },
    { id: "review", title: "Application review", text: "Submitting an application does not guarantee acceptance. Campbell's Crew may approve, waitlist, request more information, or decline an application after review." },
    { id: "photos", title: "Required photography release", text: "Photography and video occur throughout this large volunteer-run event. I authorize my participating children to be photographed and authorize Campbell's Crew to use selected images in its charitable communications." },
    { id: "accuracy", title: "Accurate information", text: "The information I provide will be complete and accurate. Duplicate or intentionally false information may result in an application being denied or cancelled." }
  ];

  function createDefaultState() {
    return {
      event: {
        title: "2026 Winter Clothing for Kids",
        date: "Saturday, December 5, 2026",
        time: "6:00 AM – 10:00 AM",
        location: "Queen Creek Walmart · Garden Center",
        address: "21055 E Rittenhouse Rd, Queen Creek, AZ",
        volunteerStatus: "open",
        recipientStatus: "code",
        volunteerCode: "CREW26",
        recipientCode: "HOPE26",
        volunteerCapacity: 120,
        recipientCapacity: 100,
        shoppingBudget: 150
      },
      volunteers: [
        { id: "VOL-26001", name: "Jordan Ellis", email: "jordan@example.org", phone: "480-555-0141", role: "Shopping Buddy", shift: "5:30 AM – 10:00 AM", status: "confirmed", checkedIn: true, checkedAt: "5:34 AM" },
        { id: "VOL-26002", name: "Taylor Morgan", email: "taylor@example.org", phone: "480-555-0172", role: "Check-in Crew", shift: "5:15 AM – 9:00 AM", status: "confirmed", checkedIn: true, checkedAt: "5:21 AM" },
        { id: "VOL-26003", name: "Riley Chen", email: "riley@example.org", phone: "602-555-0189", role: "Shopping Buddy", shift: "5:30 AM – 10:00 AM", status: "confirmed", checkedIn: false, checkedAt: "" },
        { id: "VOL-26004", name: "Morgan Patel", email: "morgan@example.org", phone: "480-555-0128", role: "Photographer", shift: "6:00 AM – 9:30 AM", status: "confirmed", checkedIn: false, checkedAt: "" },
        { id: "VOL-26005", name: "Casey Flores", email: "casey@example.org", phone: "602-555-0117", role: "Event Runner", shift: "5:30 AM – 10:00 AM", status: "confirmed", checkedIn: false, checkedAt: "" }
      ],
      applications: [
        {
          id: "CCC-26041", guardian: "Maria Alvarez", email: "maria@example.org", phone: "480-555-0107", address: "1842 S Desert View Dr", city: "Mesa", zip: "85204", referral: "School counselor", emergencyName: "Luis Alvarez", emergencyPhone: "480-555-0159", emergencyRelation: "Uncle", submitted: "Aug 14, 2026", status: "submitted", flags: ["Similar household address"], checkedIn: false,
          children: [
            { name: "Sofia", birthdate: "2017-03-12", age: 9, gender: "Girl", shirt: "10/12", pants: "10", shoes: "4", underwear: "10/12", coat: "10/12", preferences: "Purple, art, comfortable leggings", accommodations: "Sensitive to loud noises" },
            { name: "Mateo", birthdate: "2019-08-09", age: 7, gender: "Boy", shirt: "7/8", pants: "8 slim", shoes: "2", underwear: "7/8", coat: "8", preferences: "Blue, dinosaurs, tag-free shirts", accommodations: "None" }
          ]
        },
        {
          id: "CCC-26042", guardian: "Danielle Brooks", email: "danielle@example.org", phone: "602-555-0114", address: "902 E Palm Ln", city: "Phoenix", zip: "85006", referral: "Community partner", emergencyName: "Monica Brooks", emergencyPhone: "602-555-0198", emergencyRelation: "Grandmother", submitted: "Aug 15, 2026", status: "review", flags: ["Phone used on prior application", "Child name resembles existing record"], checkedIn: false,
          children: [
            { name: "Avery", birthdate: "2016-11-21", age: 9, gender: "Girl", shirt: "12/14", pants: "12", shoes: "5", underwear: "12/14", coat: "14", preferences: "Black, green, graphic tees", accommodations: "Needs extra time making choices" }
          ]
        },
        {
          id: "CCC-26038", guardian: "Elena Ramirez", email: "elena@example.org", phone: "480-555-0166", address: "551 W Ocotillo Rd", city: "Chandler", zip: "85248", referral: "Church referral", emergencyName: "Rosa Ramirez", emergencyPhone: "480-555-0182", emergencyRelation: "Sister", submitted: "Aug 12, 2026", status: "approved", flags: [], checkedIn: true, checkedAt: "6:07 AM",
          children: [
            { name: "Lucas", birthdate: "2015-06-18", age: 11, gender: "Boy", shirt: "Youth XL", pants: "16 husky", shoes: "7", underwear: "Youth XL", coat: "Adult S", preferences: "Red, basketball, athletic pants", accommodations: "None" }
          ]
        },
        {
          id: "CCC-26035", guardian: "Kendra White", email: "kendra@example.org", phone: "602-555-0134", address: "1307 N 24th St", city: "Phoenix", zip: "85008", referral: "Social worker", emergencyName: "James White", emergencyPhone: "602-555-0149", emergencyRelation: "Father", submitted: "Aug 11, 2026", status: "info", flags: ["Eligibility document missing"], checkedIn: false,
          children: [
            { name: "Noah", birthdate: "2018-02-03", age: 8, gender: "Boy", shirt: "8", pants: "8", shoes: "3", underwear: "8", coat: "8/10", preferences: "Minecraft, soft sweatshirts", accommodations: "None" }
          ]
        }
      ],
      activity: [
        { text: "Maria Alvarez submitted recipient application CCC-26041.", time: "18 minutes ago" },
        { text: "Jordan Ellis was checked in by Event Staff.", time: "32 minutes ago" },
        { text: "Recipient application CCC-26038 was approved.", time: "Yesterday" },
        { text: "Volunteer registration opened for the Winter event.", time: "2 days ago" }
      ]
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STATE_KEY);
      return saved ? JSON.parse(saved) : createDefaultState();
    } catch (error) {
      return createDefaultState();
    }
  }

  let state = loadState();
  let selectedVolunteerRole = "shopper";
  let volunteerConfirmation = null;
  let recipientStep = 0;
  let recipientConfirmation = null;
  let recipientDraft = createRecipientDraft();
  let checkinType = "recipients";

  function createRecipientDraft() {
    return {
      acknowledgments: {}, guardian: "", email: "", phone: "", address: "", city: "", zip: "", referral: "", preferredContact: "Email", notes: "",
      children: [{ name: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", underwear: "", coat: "", preferences: "", accommodations: "" }],
      emergencyName: "", emergencyPhone: "", emergencyRelation: "", recipientCode: "", documents: []
    };
  }

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatStatus(value) {
    const labels = { open: "Open", code: "Access code", closed: "Closed", submitted: "Submitted", review: "Under review", approved: "Approved", info: "Needs information", waitlisted: "Waitlisted", declined: "Declined", checked: "Checked in" };
    return labels[value] || value;
  }

  function statusPill(value, override) {
    return `<span class="status-pill status-pill--${esc(value)}">${esc(override || formatStatus(value))}</span>`;
  }

  function currentTime() {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());
  }

  function makeId(prefix, collection) {
    const max = collection.reduce((highest, item) => {
      const number = Number(String(item.id).replace(/\D/g, ""));
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 26000);
    return `${prefix}-${max + 1}`;
  }

  function toast(message) {
    const region = document.querySelector("#toast-region");
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function setUnlocked(unlocked) {
    lockScreen.hidden = unlocked;
    appShell.hidden = !unlocked;
    if (unlocked) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      if (!window.location.hash) window.location.hash = "home";
      renderRoute();
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      pinInput.value = "";
      pinError.hidden = true;
      window.location.hash = "";
      window.setTimeout(() => pinInput.focus(), 0);
    }
  }

  function routeParts() {
    return (window.location.hash.replace(/^#/, "") || "home").split("/");
  }

  function updateNav(route) {
    document.querySelectorAll("#app-nav a").forEach((link) => {
      const section = link.getAttribute("href").replace(/^#/, "").split("/")[0];
      if (section === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function renderRoute() {
    if (sessionStorage.getItem(SESSION_KEY) !== "yes") return;
    const [route, subroute = "dashboard"] = routeParts();
    updateNav(route);
    if (route === "volunteer") renderVolunteer();
    else if (route === "recipient") renderRecipient();
    else if (route === "organizer") renderOrganizer(subroute);
    else renderHome();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderHome() {
    main.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <div><p class="eyebrow">One crew · One simple system</p><h1>How can we<br><span>help today?</span></h1></div>
          <p class="hero-lede">Register to volunteer, apply for event assistance, or open the organizer workspace.</p>
        </div>
        <div class="path-grid" aria-label="Choose an area">
          <button class="path-card path-card--bright" type="button" data-go="volunteer"><span class="path-number">01</span><div><p>Join the crew</p><h2>Volunteer</h2><span class="path-link">View opportunities <b>→</b></span></div></button>
          <button class="path-card path-card--light" type="button" data-go="recipient"><span class="path-number">02</span><div><p>Request assistance</p><h2>Recipient application</h2><span class="path-link">Before you apply <b>→</b></span></div></button>
          <button class="path-card path-card--dark" type="button" data-go="organizer/dashboard"><span class="path-number">03</span><div><p>Board & event staff</p><h2>Organizer</h2><span class="path-link">Open dashboard <b>→</b></span></div></button>
        </div>
      </section>`;
    main.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => { window.location.hash = button.dataset.go; }));
  }

  function renderVolunteer() {
    if (volunteerConfirmation) {
      main.innerHTML = `<div class="page-content"><div class="confirmation"><div class="confirmation-mark">✓</div><p class="eyebrow">You're on the list</p><h1>Thank you, ${esc(volunteerConfirmation.name)}.</h1><p>We've saved your demonstration registration for <strong>${esc(volunteerConfirmation.role)}</strong>. In the finished system, a confirmation and instruction sheet would be emailed immediately.</p><div class="confirmation-number"><span>Volunteer confirmation</span><strong>${esc(volunteerConfirmation.id)}</strong></div><button class="button button--green" type="button" id="another-volunteer">Register another volunteer <span>→</span></button></div></div>`;
      document.querySelector("#another-volunteer").addEventListener("click", () => { volunteerConfirmation = null; renderVolunteer(); });
      return;
    }

    const event = state.event;
    const isClosed = event.volunteerStatus === "closed";
    main.innerHTML = `
      <section class="page-hero"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Volunteer registration</p><h1>Join the <span>crew.</span></h1></div><p>Choose the role that fits you best. We'll send the event instructions after registration.</p></div></section>
      <div class="page-content">
        <a class="back-link" href="#home">← Back to signup home</a>
        <section class="event-summary"><div><span class="status-pill status-pill--${esc(event.volunteerStatus)}">Volunteer signup ${esc(formatStatus(event.volunteerStatus))}</span><h2>${esc(event.title)}</h2><div class="event-meta"><span>${esc(event.date)}</span><span>${esc(event.time)}</span><span>${esc(event.location)}</span></div></div><strong>${state.volunteers.length} / ${esc(event.volunteerCapacity)} registered</strong></section>
        ${isClosed ? `<div class="content-card"><h2>Volunteer registration is currently closed.</h2><p>Organizers can reopen it at any time from the event settings area.</p></div>` : `
        <section aria-labelledby="role-title"><div class="section-heading"><div><p class="eyebrow">Step 1</p><h2 id="role-title">Choose a role.</h2></div><p>You can revise roles and shifts later from the organizer dashboard.</p></div>
          <div class="role-grid">${volunteerRoles.map((role, index) => `<button class="role-card" type="button" data-role="${role.id}" aria-pressed="${selectedVolunteerRole === role.id}"><span>0${index + 1}</span><h3>${esc(role.title)}</h3><p>${esc(role.description)}</p></button>`).join("")}</div>
        </section>
        <section class="content-card" aria-labelledby="volunteer-details-title"><p class="eyebrow">Step 2</p><h2 id="volunteer-details-title">Your information</h2><p>Only the basics are needed for volunteer registration.</p>
          <form id="volunteer-form">
            <div class="form-grid">
              <div class="field"><label for="vol-first">First name</label><input id="vol-first" name="firstName" autocomplete="given-name" required></div>
              <div class="field"><label for="vol-last">Last name</label><input id="vol-last" name="lastName" autocomplete="family-name" required></div>
              <div class="field"><label for="vol-email">Email</label><input id="vol-email" name="email" type="email" autocomplete="email" required></div>
              <div class="field"><label for="vol-phone">Mobile phone</label><input id="vol-phone" name="phone" type="tel" autocomplete="tel" required></div>
              <div class="field"><label for="vol-shift">Preferred shift</label><select id="vol-shift" name="shift" required><option value="">Choose a shift</option><option>5:15 AM – 9:00 AM</option><option>5:30 AM – 10:00 AM</option><option>6:00 AM – 9:30 AM</option><option>Setup the evening before</option><option>Cleanup only</option></select></div>
              <div class="field"><label for="vol-shirt">Volunteer shirt size</label><select id="vol-shirt" name="shirt"><option value="">Not needed / choose later</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></div>
              ${event.volunteerStatus === "code" ? `<div class="field field--span-2"><label for="vol-code">Volunteer invitation code</label><input id="vol-code" name="volunteerCode" required><small>Prototype testing code: CREW26</small></div>` : ""}
              <div class="field field--span-2"><label for="vol-notes">Anything organizers should know? <span>(optional)</span></label><textarea id="vol-notes" name="notes" placeholder="Accessibility needs, preferred team member, or a helpful note"></textarea></div>
            </div>
            <input type="hidden" name="role" value="${esc(selectedVolunteerRole)}">
            <div class="inline-note"><strong>What happens next?</strong> The finished system will immediately email your confirmation, arrival instructions, and any role-specific information.</div>
            <label class="checkbox-row"><input type="checkbox" name="agreement" required><span>I agree to follow Campbell's Crew event, privacy, and child-safety instructions.</span></label>
            <div class="form-actions form-actions--end"><button class="button button--green" type="submit">Complete registration <span>→</span></button></div>
          </form>
        </section>`}
      </div>`;

    main.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => { selectedVolunteerRole = button.dataset.role; renderVolunteer(); }));
    const form = document.querySelector("#volunteer-form");
    if (form) form.addEventListener("submit", submitVolunteer);
  }

  function submitVolunteer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (state.event.volunteerStatus === "code" && String(data.get("volunteerCode") || "").trim().toUpperCase() !== state.event.volunteerCode.toUpperCase()) {
      toast("The volunteer invitation code does not match this event.");
      return;
    }
    const role = volunteerRoles.find((item) => item.id === data.get("role"));
    const record = {
      id: makeId("VOL", state.volunteers), name: `${data.get("firstName")} ${data.get("lastName")}`.trim(), email: data.get("email"), phone: data.get("phone"), role: role ? role.title : "Volunteer", shift: data.get("shift"), status: "confirmed", checkedIn: false, checkedAt: ""
    };
    state.volunteers.push(record);
    state.activity.unshift({ text: `${record.name} registered as ${record.role}.`, time: "Just now" });
    saveState();
    volunteerConfirmation = record;
    renderVolunteer();
  }

  function recipientStepsHtml() {
    const labels = ["Before you apply", "Household", "Children", "Emergency & files", "Review"];
    return `<aside class="application-steps" aria-label="Application progress">${labels.map((label, index) => `<div class="application-step ${recipientStep === index ? "is-current" : ""} ${recipientStep > index ? "is-complete" : ""}"><span>${recipientStep > index ? "✓" : index + 1}</span>${esc(label)}</div>`).join("")}</aside>`;
  }

  function renderRecipient() {
    if (recipientConfirmation) {
      main.innerHTML = `<div class="page-content"><div class="confirmation"><div class="confirmation-mark">✓</div><p class="eyebrow">Application received</p><h1>Thank you, ${esc(recipientConfirmation.guardian)}.</h1><p>Your demonstration application has been added to the organizer review queue. Submission does not guarantee acceptance; Campbell's Crew will contact you after review.</p><div class="confirmation-number"><span>Application number</span><strong>${esc(recipientConfirmation.id)}</strong></div>${recipientConfirmation.flags.length ? `<div class="inline-note"><strong>Prototype note:</strong> The duplicate-checking demonstration added ${recipientConfirmation.flags.length} review flag${recipientConfirmation.flags.length === 1 ? "" : "s"}. Flags require human review and do not automatically reject an application.</div>` : ""}<button class="button button--green" type="button" id="new-application">Start another test application <span>→</span></button></div></div>`;
      document.querySelector("#new-application").addEventListener("click", () => { recipientDraft = createRecipientDraft(); recipientStep = 0; recipientConfirmation = null; renderRecipient(); });
      return;
    }

    if (state.event.recipientStatus === "closed") {
      main.innerHTML = `<section class="page-hero page-hero--ink"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Recipient application</p><h1>Applications are <span>closed.</span></h1></div><p>Campbell's Crew can reopen this event from the organizer workspace when it is ready to accept applications.</p></div></section><div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="content-card"><h2>${esc(state.event.title)}</h2><p>New recipient applications are not being accepted right now.</p></div></div>`;
      return;
    }

    main.innerHTML = `
      <section class="page-hero page-hero--ink"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Recipient application</p><h1>Before you <span>apply.</span></h1></div><p>This guided application explains how the event works, collects each child's essential sizes and preferences, and gives Campbell's Crew what it needs for a careful review.</p></div></section>
      <div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="application-layout">${recipientStepsHtml()}<section class="application-panel" id="recipient-panel"></section></div></div>`;
    const panel = document.querySelector("#recipient-panel");
    if (recipientStep === 0) renderOrientation(panel);
    else if (recipientStep === 1) renderHousehold(panel);
    else if (recipientStep === 2) renderChildren(panel);
    else if (recipientStep === 3) renderEmergency(panel);
    else renderReview(panel);
  }

  function renderOrientation(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 1 of 5</p><h2>How the event works.</h2><p>Please review each section carefully. Initial every item to confirm that you understand it before continuing.</p>
      <div class="video-card"><img src="../assets/images/campbell-story-video-thumbnail.jpg" alt="Campbell speaking in a video"><div class="video-card__content"><strong>Event orientation video</strong><span>Video placeholder · Written instructions are provided below</span></div></div>
      <div class="inline-note"><strong>Why both video and text?</strong> The eventual video will have captions and a transcript. The written explanation will always remain available.</div>
      <form id="orientation-form"><div class="ack-list">${acknowledgments.map((item) => { const saved = recipientDraft.acknowledgments[item.id] || {}; return `<label class="ack-item"><input type="checkbox" name="ack-${item.id}" ${saved.checked ? "checked" : ""} required><p><strong>${esc(item.title)}.</strong> ${esc(item.text)}</p><input type="text" name="initial-${item.id}" value="${esc(saved.initials || "")}" maxlength="4" aria-label="Initial for ${esc(item.title)}" placeholder="Initial" required></label>`; }).join("")}</div><div class="form-actions"><a class="button button--ghost" href="#home">Cancel</a><button class="button button--green" type="submit">Continue to household <span>→</span></button></div></form>`;
    document.querySelector("#orientation-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      acknowledgments.forEach((item) => { recipientDraft.acknowledgments[item.id] = { checked: data.get(`ack-${item.id}`) === "on", initials: String(data.get(`initial-${item.id}`) || "").trim().toUpperCase() }; });
      recipientStep = 1;
      renderRecipient();
    });
  }

  function renderHousehold(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 2 of 5</p><h2>Household information.</h2><p>Tell us how to contact the parent or legal guardian completing this application.</p>
      <form id="household-form"><div class="form-grid">
        <div class="field field--span-2"><label for="guardian">Parent or legal guardian's full name</label><input id="guardian" name="guardian" autocomplete="name" value="${esc(recipientDraft.guardian)}" required></div>
        <div class="field"><label for="recipient-email">Email</label><input id="recipient-email" name="email" type="email" autocomplete="email" value="${esc(recipientDraft.email)}" required></div>
        <div class="field"><label for="recipient-phone">Mobile phone</label><input id="recipient-phone" name="phone" type="tel" autocomplete="tel" value="${esc(recipientDraft.phone)}" required></div>
        <div class="field field--span-2"><label for="recipient-address">Home address</label><input id="recipient-address" name="address" autocomplete="street-address" value="${esc(recipientDraft.address)}" required></div>
        <div class="field"><label for="recipient-city">City</label><input id="recipient-city" name="city" autocomplete="address-level2" value="${esc(recipientDraft.city)}" required></div>
        <div class="field"><label for="recipient-zip">ZIP code</label><input id="recipient-zip" name="zip" inputmode="numeric" autocomplete="postal-code" value="${esc(recipientDraft.zip)}" maxlength="10" required></div>
        <div class="field"><label for="referral">Who referred your family?</label><input id="referral" name="referral" value="${esc(recipientDraft.referral)}" placeholder="School, counselor, church, organization, or person" required></div>
        <div class="field"><label for="preferred-contact">Preferred contact</label><select id="preferred-contact" name="preferredContact"><option ${recipientDraft.preferredContact === "Email" ? "selected" : ""}>Email</option><option ${recipientDraft.preferredContact === "Text message" ? "selected" : ""}>Text message</option><option ${recipientDraft.preferredContact === "Phone call" ? "selected" : ""}>Phone call</option></select></div>
        <div class="field field--span-2"><label for="household-notes">Anything important about your family's circumstances? <span>(optional)</span></label><textarea id="household-notes" name="notes">${esc(recipientDraft.notes)}</textarea></div>
      </div><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Continue to children <span>→</span></button></div></form>`;
    document.querySelector("[data-recipient-back]").addEventListener("click", () => { recipientStep = 0; renderRecipient(); });
    document.querySelector("#household-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      saveHousehold(new FormData(event.currentTarget));
      recipientStep = 2;
      renderRecipient();
    });
  }

  function saveHousehold(data) {
    ["guardian", "email", "phone", "address", "city", "zip", "referral", "preferredContact", "notes"].forEach((key) => { recipientDraft[key] = String(data.get(key) || "").trim(); });
  }

  function renderChildren(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 3 of 5</p><h2>Participating children.</h2><p>Add every child being considered. Exact sizes and preferences help the assigned shopping volunteer.</p>
      <form id="children-form">${recipientDraft.children.map((child, index) => childFormHtml(child, index)).join("")}<button class="button button--ghost" type="button" id="add-child">+ Add another child</button><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Continue <span>→</span></button></div></form>`;
    document.querySelector("#add-child").addEventListener("click", () => {
      syncChildren();
      recipientDraft.children.push({ name: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", underwear: "", coat: "", preferences: "", accommodations: "" });
      renderRecipient();
    });
    document.querySelectorAll("[data-remove-child]").forEach((button) => button.addEventListener("click", () => {
      syncChildren();
      recipientDraft.children.splice(Number(button.dataset.removeChild), 1);
      if (!recipientDraft.children.length) recipientDraft.children.push({ name: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", underwear: "", coat: "", preferences: "", accommodations: "" });
      renderRecipient();
    }));
    document.querySelector("[data-recipient-back]").addEventListener("click", () => { syncChildren(); recipientStep = 1; renderRecipient(); });
    document.querySelector("#children-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      syncChildren();
      recipientStep = 3;
      renderRecipient();
    });
  }

  function childFormHtml(child, index) {
    return `<section class="child-card"><div class="child-card__header"><h3>Child ${index + 1}</h3>${recipientDraft.children.length > 1 ? `<button class="link-button" type="button" data-remove-child="${index}">Remove</button>` : ""}</div><div class="form-grid">
      <div class="field field--span-2"><label for="child-${index}-name">Child's full name</label><input id="child-${index}-name" name="child-${index}-name" value="${esc(child.name)}" required></div>
      <div class="field"><label for="child-${index}-birthdate">Date of birth</label><input id="child-${index}-birthdate" name="child-${index}-birthdate" type="date" value="${esc(child.birthdate)}" required></div>
      <div class="field"><label for="child-${index}-gender">Shopping section / gender</label><select id="child-${index}-gender" name="child-${index}-gender" required><option value="">Choose one</option><option ${child.gender === "Girl" ? "selected" : ""}>Girl</option><option ${child.gender === "Boy" ? "selected" : ""}>Boy</option><option ${child.gender === "Other / discuss with organizer" ? "selected" : ""}>Other / discuss with organizer</option></select></div>
      <div class="field"><label for="child-${index}-shirt">Shirt size</label><input id="child-${index}-shirt" name="child-${index}-shirt" value="${esc(child.shirt)}" required></div>
      <div class="field"><label for="child-${index}-pants">Pants size</label><input id="child-${index}-pants" name="child-${index}-pants" value="${esc(child.pants)}" required></div>
      <div class="field"><label for="child-${index}-shoes">Shoe size</label><input id="child-${index}-shoes" name="child-${index}-shoes" value="${esc(child.shoes)}" required></div>
      <div class="field"><label for="child-${index}-underwear">Underwear size</label><input id="child-${index}-underwear" name="child-${index}-underwear" value="${esc(child.underwear)}" required></div>
      <div class="field"><label for="child-${index}-coat">Coat size</label><input id="child-${index}-coat" name="child-${index}-coat" value="${esc(child.coat)}" required></div>
      <div class="field field--span-2"><label for="child-${index}-preferences">Colors, styles, interests, likes, or dislikes</label><textarea id="child-${index}-preferences" name="child-${index}-preferences" required>${esc(child.preferences)}</textarea></div>
      <div class="field field--span-2"><label for="child-${index}-accommodations">Medical, sensory, communication, mobility, or behavioral accommodations</label><textarea id="child-${index}-accommodations" name="child-${index}-accommodations" required>${esc(child.accommodations)}</textarea><small>Enter “None” if no accommodation is needed.</small></div>
    </div></section>`;
  }

  function syncChildren() {
    const form = document.querySelector("#children-form");
    if (!form) return;
    const data = new FormData(form);
    recipientDraft.children = recipientDraft.children.map((child, index) => {
      const next = {};
      ["name", "birthdate", "gender", "shirt", "pants", "shoes", "underwear", "coat", "preferences", "accommodations"].forEach((key) => { next[key] = String(data.get(`child-${index}-${key}`) || child[key] || "").trim(); });
      return next;
    });
  }

  function renderEmergency(panel) {
    const codeRequired = state.event.recipientStatus === "code";
    panel.innerHTML = `
      <p class="eyebrow">Step 4 of 5</p><h2>Emergency contact & documents.</h2><p>This information is available only to authorized organizers and the limited event staff who need it.</p>
      <form id="emergency-form"><div class="form-grid">
        <div class="field"><label for="emergency-name">Emergency contact name</label><input id="emergency-name" name="emergencyName" value="${esc(recipientDraft.emergencyName)}" required></div>
        <div class="field"><label for="emergency-phone">Emergency contact phone</label><input id="emergency-phone" name="emergencyPhone" type="tel" value="${esc(recipientDraft.emergencyPhone)}" required></div>
        <div class="field"><label for="emergency-relation">Relationship</label><input id="emergency-relation" name="emergencyRelation" value="${esc(recipientDraft.emergencyRelation)}" required></div>
        ${codeRequired ? `<div class="field"><label for="recipient-code">Invitation code</label><input id="recipient-code" name="recipientCode" value="${esc(recipientDraft.recipientCode)}" required><small>Prototype testing code: HOPE26</small></div>` : ""}
        <div class="field field--span-2"><label>Supporting paperwork</label><div class="file-drop"><div><strong>Choose demonstration documents</strong><input id="recipient-documents" name="documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png"><small>No files leave this device in the prototype.</small></div></div>${recipientDraft.documents.length ? `<small>Selected: ${recipientDraft.documents.map(esc).join(", ")}</small>` : ""}</div>
      </div><div class="inline-note"><strong>Production security:</strong> Actual documents will be encrypted, kept private, and shown only through temporary links to authorized reviewers.</div><div id="code-error" class="validation-summary" hidden>The invitation code does not match this event.</div><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Review application <span>→</span></button></div></form>`;
    const fileInput = document.querySelector("#recipient-documents");
    fileInput.addEventListener("change", () => { recipientDraft.documents = Array.from(fileInput.files).map((file) => file.name); });
    document.querySelector("[data-recipient-back]").addEventListener("click", () => { saveEmergency(new FormData(document.querySelector("#emergency-form"))); recipientStep = 2; renderRecipient(); });
    document.querySelector("#emergency-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const data = new FormData(event.currentTarget);
      saveEmergency(data);
      if (codeRequired && recipientDraft.recipientCode.toUpperCase() !== state.event.recipientCode.toUpperCase()) {
        document.querySelector("#code-error").hidden = false;
        return;
      }
      recipientStep = 4;
      renderRecipient();
    });
  }

  function saveEmergency(data) {
    ["emergencyName", "emergencyPhone", "emergencyRelation", "recipientCode"].forEach((key) => { recipientDraft[key] = String(data.get(key) || recipientDraft[key] || "").trim(); });
  }

  function renderReview(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 5 of 5</p><h2>Review and sign.</h2><p>Confirm the key information below. You can return to any previous section if something needs to change.</p>
      <div class="review-list">
        <div class="review-row"><span>Parent / guardian</span><strong>${esc(recipientDraft.guardian)}</strong></div>
        <div class="review-row"><span>Contact</span><strong>${esc(recipientDraft.email)} · ${esc(recipientDraft.phone)}</strong></div>
        <div class="review-row"><span>Address</span><strong>${esc(recipientDraft.address)}, ${esc(recipientDraft.city)}, AZ ${esc(recipientDraft.zip)}</strong></div>
        <div class="review-row"><span>Referral</span><strong>${esc(recipientDraft.referral)}</strong></div>
        <div class="review-row"><span>Children</span><strong>${recipientDraft.children.map((child) => esc(child.name)).join(", ")}</strong></div>
        <div class="review-row"><span>Emergency contact</span><strong>${esc(recipientDraft.emergencyName)} · ${esc(recipientDraft.emergencyPhone)}</strong></div>
        <div class="review-row"><span>Documents</span><strong>${recipientDraft.documents.length ? recipientDraft.documents.map(esc).join(", ") : "No demonstration documents selected"}</strong></div>
      </div>
      <form id="signature-form"><div class="signature-box"><div class="form-grid"><div class="field field--span-2"><label for="signature">Electronic signature — type your full legal name</label><input id="signature" name="signature" autocomplete="name" required></div><div class="field field--span-2"><label class="checkbox-row"><input type="checkbox" name="authority" required><span>I am the parent or legal guardian, or I have authority to submit this application for the participating children.</span></label><label class="checkbox-row"><input type="checkbox" name="accuracy" required><span>I certify that this application is complete and accurate and that I agree to every acknowledgment initialed at the beginning.</span></label></div></div></div><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Submit application <span>→</span></button></div></form>`;
    document.querySelector("[data-recipient-back]").addEventListener("click", () => { recipientStep = 3; renderRecipient(); });
    document.querySelector("#signature-form").addEventListener("submit", submitRecipient);
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function findApplicationFlags(draft) {
    const flags = [];
    if (state.applications.some((item) => normalize(item.email) === normalize(draft.email))) flags.push("Email used on another application");
    if (state.applications.some((item) => normalize(item.phone) === normalize(draft.phone))) flags.push("Phone used on another application");
    if (state.applications.some((item) => normalize(`${item.address}${item.zip}`) === normalize(`${draft.address}${draft.zip}`))) flags.push("Household address matches another application");
    const existingChildren = state.applications.flatMap((item) => item.children);
    draft.children.forEach((child) => {
      if (existingChildren.some((existing) => normalize(existing.name) === normalize(child.name) && existing.birthdate === child.birthdate)) flags.push(`Possible duplicate child: ${child.name}`);
    });
    return [...new Set(flags)];
  }

  function submitRecipient(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (normalize(data.get("signature")) !== normalize(recipientDraft.guardian)) {
      toast("The electronic signature must match the parent or guardian name.");
      return;
    }
    const flags = findApplicationFlags(recipientDraft);
    const record = {
      id: makeId("CCC", state.applications), guardian: recipientDraft.guardian, email: recipientDraft.email, phone: recipientDraft.phone, address: recipientDraft.address, city: recipientDraft.city, zip: recipientDraft.zip, referral: recipientDraft.referral, emergencyName: recipientDraft.emergencyName, emergencyPhone: recipientDraft.emergencyPhone, emergencyRelation: recipientDraft.emergencyRelation, submitted: "Just now", status: flags.length ? "review" : "submitted", flags, checkedIn: false,
      children: recipientDraft.children.map((child) => ({ ...child, age: child.birthdate ? Math.max(0, new Date().getFullYear() - Number(child.birthdate.slice(0, 4))) : "" }))
    };
    state.applications.unshift(record);
    state.activity.unshift({ text: `${record.guardian} submitted recipient application ${record.id}.`, time: "Just now" });
    saveState();
    recipientConfirmation = record;
    renderRecipient();
  }

  function organizerShell(subroute, content) {
    const reviewCount = state.applications.filter((item) => ["submitted", "review", "info"].includes(item.status)).length;
    return `<div class="organizer-shell"><aside class="organizer-sidebar"><div class="organizer-sidebar__title"><span>Private workspace</span><strong>Organizer tools</strong></div><nav class="organizer-menu" aria-label="Organizer sections">
      ${organizerLink("dashboard", "Overview", subroute)}${organizerLink("events", "Event setup", subroute)}${organizerLink("volunteers", "Volunteers", subroute)}${organizerLink("applications", "Applications", subroute, reviewCount)}${organizerLink("checkin", "Check-in", subroute)}${organizerLink("packets", "Print packets", subroute)}${organizerLink("settings", "Settings", subroute)}
      </nav><p class="organizer-sidebar__footer">Prototype organizer · In production, each board member will use an individual Google Workspace login.</p></aside><section class="organizer-main">${content}</section></div>`;
  }

  function organizerLink(route, label, current, count) {
    return `<a href="#organizer/${route}" ${route === current ? `aria-current="page"` : ""}>${esc(label)}${count ? `<em>${count}</em>` : ""}</a>`;
  }

  function renderOrganizer(subroute) {
    let content;
    if (subroute === "events") content = organizerEvents();
    else if (subroute === "volunteers") content = organizerVolunteers();
    else if (subroute === "applications") content = organizerApplications();
    else if (subroute === "checkin") content = organizerCheckin();
    else if (subroute === "packets") content = organizerPackets();
    else if (subroute === "settings") content = organizerSettings();
    else content = organizerDashboard();
    main.innerHTML = organizerShell(subroute, content);
    bindOrganizer(subroute);
  }

  function heading(kicker, title, description, action) {
    return `<header class="organizer-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action || ""}</header>`;
  }

  function organizerDashboard() {
    const applicants = state.applications.reduce((total, item) => total + item.children.length, 0);
    const approved = state.applications.filter((item) => item.status === "approved").reduce((total, item) => total + item.children.length, 0);
    const review = state.applications.filter((item) => ["submitted", "review", "info"].includes(item.status)).length;
    const volunteerPercent = Math.min(100, Math.round((state.volunteers.length / state.event.volunteerCapacity) * 100));
    const recipientPercent = Math.min(100, Math.round((applicants / state.event.recipientCapacity) * 100));
    return `${heading("Organizer overview", "Good morning.", "Here is what is happening across the Winter event.", `<a class="button button--green" href="#organizer/checkin">Open check-in →</a>`)}
      <div class="metric-grid"><article class="metric-card"><span>Volunteers registered</span><strong>${state.volunteers.length}</strong><small>${state.event.volunteerCapacity - state.volunteers.length} spots remaining</small></article><article class="metric-card"><span>Children requested</span><strong>${applicants}</strong><small>Across ${state.applications.length} households</small></article><article class="metric-card"><span>Awaiting review</span><strong>${review}</strong><small>Needs organizer attention</small></article><article class="metric-card"><span>Children approved</span><strong>${approved}</strong><small>Ready for event packets</small></article></div>
      <div class="dashboard-grid"><article class="panel"><div class="panel-header"><div><h2>${esc(state.event.title)}</h2><p>${esc(state.event.date)} · ${esc(state.event.location)}</p></div>${statusPill(state.event.volunteerStatus, "Volunteer signup " + formatStatus(state.event.volunteerStatus))}</div><div class="progress-block"><div class="progress-block__label"><span>Volunteer capacity</span><strong>${state.volunteers.length} / ${state.event.volunteerCapacity}</strong></div><div class="progress-track"><span style="width:${volunteerPercent}%"></span></div></div><div class="progress-block"><div class="progress-block__label"><span>Recipient capacity</span><strong>${applicants} / ${state.event.recipientCapacity}</strong></div><div class="progress-track"><span style="width:${recipientPercent}%"></span></div></div><div class="quick-actions" style="margin-top:28px"><a class="quick-action" href="#organizer/events"><strong>Edit event</strong><span>→</span></a><a class="quick-action" href="#organizer/applications"><strong>Review applications</strong><span>→</span></a><a class="quick-action" href="#organizer/volunteers"><strong>View volunteers</strong><span>→</span></a><a class="quick-action" href="#organizer/packets"><strong>Prepare packets</strong><span>→</span></a></div></article><article class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p>Changes made in this prototype</p></div></div><div class="activity-list">${state.activity.slice(0, 6).map((item) => `<div class="activity-item"><span class="activity-dot"></span><p>${esc(item.text)}</p><time>${esc(item.time)}</time></div>`).join("")}</div></article></div>`;
  }

  function organizerEvents() {
    const e = state.event;
    return `${heading("Event management", "Event setup", "Update the event once and every signup page reflects it.")}
      <form id="event-form"><article class="panel"><div class="panel-header"><div><h2>Event details</h2><p>Public-facing information</p></div></div><div class="form-grid"><div class="field field--span-2"><label for="event-title">Event name</label><input id="event-title" name="title" value="${esc(e.title)}" required></div><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" value="${esc(e.date)}" required></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" value="${esc(e.time)}" required></div><div class="field"><label for="event-location">Meeting location</label><input id="event-location" name="location" value="${esc(e.location)}" required></div><div class="field"><label for="event-address">Address</label><input id="event-address" name="address" value="${esc(e.address)}" required></div><div class="field"><label for="vol-capacity">Volunteer capacity</label><input id="vol-capacity" name="volunteerCapacity" type="number" min="1" value="${esc(e.volunteerCapacity)}" required></div><div class="field"><label for="rec-capacity">Recipient child capacity</label><input id="rec-capacity" name="recipientCapacity" type="number" min="1" value="${esc(e.recipientCapacity)}" required></div><div class="field"><label for="budget">Per-child shopping budget</label><input id="budget" name="shoppingBudget" type="number" min="0" value="${esc(e.shoppingBudget)}" required></div></div></article>
      <article class="panel"><div class="panel-header"><div><h2>Volunteer registration</h2><p>Control when the simple volunteer form is available.</p></div></div><div class="event-editor-grid">${statusChoice("volunteerStatus", "open", "Open", "Anyone with access can register.", e.volunteerStatus)}${statusChoice("volunteerStatus", "code", "Access code", "Require an invitation code.", e.volunteerStatus)}${statusChoice("volunteerStatus", "closed", "Closed", "Show a registration closed message.", e.volunteerStatus)}</div><div class="field"><label for="volunteer-access-code">Volunteer invitation code</label><input id="volunteer-access-code" name="volunteerCode" value="${esc(e.volunteerCode)}" maxlength="20"><small>Only used when volunteer access is set to Access code.</small></div></article>
      <article class="panel"><div class="panel-header"><div><h2>Recipient applications</h2><p>Recipient access is managed separately from volunteers.</p></div></div><div class="event-editor-grid">${statusChoice("recipientStatus", "open", "Open", "Allow applications without a code.", e.recipientStatus)}${statusChoice("recipientStatus", "code", "Access code", "Require the referral invitation code.", e.recipientStatus)}${statusChoice("recipientStatus", "closed", "Closed", "Stop new applications.", e.recipientStatus)}</div><div class="field"><label for="recipient-access-code">Recipient invitation code</label><input id="recipient-access-code" name="recipientCode" value="${esc(e.recipientCode)}" maxlength="20"><small>Only used when recipient access is set to Access code.</small></div></article>
      <div class="form-actions form-actions--end"><button class="button button--green" type="submit">Save event changes →</button></div></form>`;
  }

  function statusChoice(name, value, title, copy, current) {
    return `<div class="status-choice"><input id="${name}-${value}" type="radio" name="${name}" value="${value}" ${current === value ? "checked" : ""}><label for="${name}-${value}"><strong>${esc(title)}</strong><span>${esc(copy)}</span></label></div>`;
  }

  function organizerVolunteers(filter = "") {
    const normalized = normalize(filter);
    const rows = state.volunteers.filter((item) => !normalized || normalize(`${item.name} ${item.email} ${item.phone} ${item.role}`).includes(normalized));
    return `${heading("Volunteer management", "Volunteers", "Search registrations, confirm roles, and check people in.", `<button class="button button--light" type="button" data-export="volunteers">Export CSV</button>`)}<div class="table-tools"><label class="search-field"><span class="screen-reader-only">Search volunteers</span><input id="volunteer-search" type="search" value="${esc(filter)}" placeholder="Search name, email, phone, or role"></label><span>${rows.length} volunteer${rows.length === 1 ? "" : "s"}</span></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Volunteer</th><th>Role</th><th>Shift</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.email)} · ${esc(item.phone)}</small></td><td>${esc(item.role)}</td><td>${esc(item.shift)}</td><td>${item.checkedIn ? statusPill("checked") : statusPill("submitted", "Confirmed")}</td><td><button class="button button--small ${item.checkedIn ? "button--ghost" : "button--green"}" type="button" data-checkin-volunteer="${esc(item.id)}">${item.checkedIn ? "Undo" : "Check in"}</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  function organizerApplications(filter = "") {
    const normalized = normalize(filter);
    const rows = state.applications.filter((item) => !normalized || normalize(`${item.guardian} ${item.email} ${item.phone} ${item.id} ${item.children.map((child) => child.name).join(" ")}`).includes(normalized));
    return `${heading("Recipient review", "Applications", "Flags organize the review work; a person always makes the final decision.", `<button class="button button--light" type="button" data-export="applications">Export CSV</button>`)}<div class="table-tools"><label class="search-field"><span class="screen-reader-only">Search applications</span><input id="application-search" type="search" value="${esc(filter)}" placeholder="Search guardian, child, phone, or ID"></label><span>${rows.length} household${rows.length === 1 ? "" : "s"}</span></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Application</th><th>Children</th><th>Review flags</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${esc(item.guardian)}</strong><small>${esc(item.id)} · ${esc(item.submitted)}</small></td><td>${item.children.map((child) => `<strong>${esc(child.name)}</strong>`).join("")}</td><td>${item.flags.length ? `<div class="flag-list">${item.flags.map((flag) => `<span class="flag">${esc(flag)}</span>`).join("")}</div>` : `<small>No automatic flags</small>`}</td><td>${statusPill(item.status)}</td><td><button class="button button--small button--ghost" type="button" data-open-application="${esc(item.id)}">Review</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  function organizerCheckin(filter = "") {
    const records = checkinType === "volunteers" ? state.volunteers : state.applications.filter((item) => item.status === "approved");
    const normalized = normalize(filter);
    const rows = records.filter((item) => !normalized || normalize(checkinType === "volunteers" ? `${item.name} ${item.email} ${item.phone}` : `${item.guardian} ${item.id} ${item.children.map((child) => child.name).join(" ")}`).includes(normalized));
    const checked = records.filter((item) => item.checkedIn).length;
    return `${heading("Event-day tools", "Check-in", "Designed for quick use on phones, tablets, and laptops.")}
      <div class="checkin-summary"><article class="checkin-card"><strong>${checked}</strong><span>Checked in</span></article><article class="checkin-card"><strong>${Math.max(0, records.length - checked)}</strong><span>Still expected</span></article></div>
      <article class="panel"><div class="table-tools"><div class="segmented"><button type="button" data-checkin-type="recipients" aria-pressed="${checkinType === "recipients"}">Recipients</button><button type="button" data-checkin-type="volunteers" aria-pressed="${checkinType === "volunteers"}">Volunteers</button></div><label class="search-field"><span class="screen-reader-only">Search check-in list</span><input id="checkin-search" type="search" value="${esc(filter)}" placeholder="Search the check-in list"></label></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>${checkinType === "volunteers" ? "Role" : "Children"}</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map((item) => `<tr><td><strong>${esc(checkinType === "volunteers" ? item.name : item.guardian)}</strong><small>${esc(checkinType === "volunteers" ? item.id : `${item.id} · ${item.phone}`)}</small></td><td>${checkinType === "volunteers" ? esc(item.role) : item.children.map((child) => esc(child.name)).join(", ")}</td><td>${item.checkedIn ? statusPill("checked", `Checked ${item.checkedAt || "in"}`) : statusPill("submitted", "Expected")}</td><td><button class="button button--small ${item.checkedIn ? "button--ghost" : "button--green"}" type="button" data-checkin-record="${esc(item.id)}">${item.checkedIn ? "Undo" : "Check in"}</button></td></tr>`).join("") : `<tr><td colspan="4"><div class="empty-state"><strong>No matching records</strong>Try another search.</div></td></tr>`}</tbody></table></div></article>`;
  }

  function organizerPackets() {
    const approved = state.applications.filter((item) => item.status === "approved");
    return `${heading("Volunteer handoff", "Print packets", "Only approved families appear here. Packets contain essential event-day information—not the full application.", `<button class="button button--green" type="button" data-print>Print all packets</button>`)}<div class="inline-note" style="margin-bottom:24px"><strong>Privacy by design:</strong> Supporting documents, eligibility notes, and review flags are intentionally excluded from shopping packets.</div><div class="packet-grid">${approved.length ? approved.map((item) => `<article class="packet-card"><div class="packet-card__head"><div><p class="eyebrow">Shopping packet</p><h3>${esc(item.guardian)} family</h3><p>${esc(item.id)} · Emergency: ${esc(item.emergencyName)}, ${esc(item.emergencyPhone)}</p></div>${statusPill("approved")}</div>${item.children.map((child) => `<div class="packet-child"><strong>${esc(child.name)} · Age ${esc(child.age)} · ${esc(child.gender)}</strong><span>Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</span><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodation:</strong> ${esc(child.accommodations)}</p></div>`).join("")}<button class="button button--small button--ghost" type="button" data-print>Print this packet</button></article>`).join("") : `<div class="empty-state"><strong>No approved applications yet</strong>Approve an application to create its shopping packet.</div>`}</div>`;
  }

  function organizerSettings() {
    return `${heading("Prototype controls", "Settings", "Manage demonstration data and see the planned production access model.")}
      <article class="panel"><div class="panel-header"><div><h2>Test-site access</h2><p>Current shared preview access</p></div>${statusPill("open", "PIN enabled")}</div><div class="detail-grid"><div class="detail-item"><span>Test path</span><strong>campbellscrew.com/test-site</strong></div><div class="detail-item"><span>PIN</span><strong>••••</strong></div><div class="detail-item"><span>Search visibility</span><strong>No indexing requested</strong></div><div class="detail-item"><span>Data</span><strong>Fictional demonstration records</strong></div></div></article>
      <article class="panel"><div class="panel-header"><div><h2>Production administrator access</h2><p>Planned replacement for the shared PIN</p></div></div><p>Board members will use individual Campbell's Crew Google Workspace accounts. Permissions can separate super administrators, event managers, reviewers, check-in staff, and read-only board members.</p></article>
      <article class="panel"><div class="panel-header"><div><h2>Reset prototype</h2><p>Restore the original fictional event, volunteers, and applications.</p></div></div><button class="button button--danger" type="button" data-reset-demo>Reset all demonstration data</button></article>`;
  }

  function bindOrganizer(subroute) {
    if (subroute === "events") {
      document.querySelector("#event-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const data = new FormData(event.currentTarget);
        ["title", "date", "time", "location", "address", "volunteerStatus", "recipientStatus", "volunteerCode", "recipientCode"].forEach((key) => { state.event[key] = String(data.get(key) || "").trim(); });
        ["volunteerCapacity", "recipientCapacity", "shoppingBudget"].forEach((key) => { state.event[key] = Number(data.get(key)); });
        state.activity.unshift({ text: "Event settings were updated by Organizer.", time: "Just now" });
        saveState();
        toast("Event changes saved across the prototype.");
        renderOrganizer("events");
      });
    }

    const volunteerSearch = document.querySelector("#volunteer-search");
    if (volunteerSearch) volunteerSearch.addEventListener("input", () => { main.innerHTML = organizerShell("volunteers", organizerVolunteers(volunteerSearch.value)); bindOrganizer("volunteers"); const next = document.querySelector("#volunteer-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const applicationSearch = document.querySelector("#application-search");
    if (applicationSearch) applicationSearch.addEventListener("input", () => { main.innerHTML = organizerShell("applications", organizerApplications(applicationSearch.value)); bindOrganizer("applications"); const next = document.querySelector("#application-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const checkinSearch = document.querySelector("#checkin-search");
    if (checkinSearch) checkinSearch.addEventListener("input", () => { main.innerHTML = organizerShell("checkin", organizerCheckin(checkinSearch.value)); bindOrganizer("checkin"); const next = document.querySelector("#checkin-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });

    document.querySelectorAll("[data-checkin-volunteer]").forEach((button) => button.addEventListener("click", () => { toggleVolunteerCheckin(button.dataset.checkinVolunteer); renderOrganizer("volunteers"); }));
    document.querySelectorAll("[data-open-application]").forEach((button) => button.addEventListener("click", () => openApplication(button.dataset.openApplication)));
    document.querySelectorAll("[data-checkin-type]").forEach((button) => button.addEventListener("click", () => { checkinType = button.dataset.checkinType; renderOrganizer("checkin"); }));
    document.querySelectorAll("[data-checkin-record]").forEach((button) => button.addEventListener("click", () => { toggleCheckinRecord(button.dataset.checkinRecord); renderOrganizer("checkin"); }));
    document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", () => window.print()));
    document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportCsv(button.dataset.export)));
    const reset = document.querySelector("[data-reset-demo]");
    if (reset) reset.addEventListener("click", () => {
      if (!window.confirm("Reset every fictional signup and organizer change in this prototype?")) return;
      state = createDefaultState();
      saveState();
      toast("Demonstration data restored.");
      renderOrganizer("settings");
    });
  }

  function toggleVolunteerCheckin(id) {
    const record = state.volunteers.find((item) => item.id === id);
    if (!record) return;
    record.checkedIn = !record.checkedIn;
    record.checkedAt = record.checkedIn ? currentTime() : "";
    state.activity.unshift({ text: `${record.name} was ${record.checkedIn ? "checked in" : "returned to expected"} by Event Staff.`, time: "Just now" });
    saveState();
    toast(`${record.name} ${record.checkedIn ? "checked in" : "check-in undone"}.`);
  }

  function toggleCheckinRecord(id) {
    const collection = checkinType === "volunteers" ? state.volunteers : state.applications;
    const record = collection.find((item) => item.id === id);
    if (!record) return;
    record.checkedIn = !record.checkedIn;
    record.checkedAt = record.checkedIn ? currentTime() : "";
    const label = checkinType === "volunteers" ? record.name : `${record.guardian} family`;
    state.activity.unshift({ text: `${label} was ${record.checkedIn ? "checked in" : "returned to expected"} by Event Staff.`, time: "Just now" });
    saveState();
    toast(`${label} ${record.checkedIn ? "checked in" : "check-in undone"}.`);
  }

  function openApplication(id) {
    const item = state.applications.find((record) => record.id === id);
    if (!item) return;
    dialogContent.innerHTML = `<div class="dialog-body"><p class="eyebrow">Recipient application ${esc(item.id)}</p><h2 id="dialog-title">${esc(item.guardian)}</h2><p class="dialog-subtitle">Submitted ${esc(item.submitted)} · ${statusPill(item.status)}</p>
      ${item.flags.length ? `<div class="dialog-section"><h3>Automatic review flags</h3><div class="flag-list">${item.flags.map((flag) => `<span class="flag">${esc(flag)}</span>`).join("")}</div><p class="field-help">Flags organize human review. They never automatically reject a family.</p></div>` : ""}
      <div class="dialog-section"><h3>Household</h3><div class="detail-grid"><div class="detail-item"><span>Email</span><strong>${esc(item.email)}</strong></div><div class="detail-item"><span>Phone</span><strong>${esc(item.phone)}</strong></div><div class="detail-item"><span>Address</span><strong>${esc(item.address)}, ${esc(item.city)}, AZ ${esc(item.zip)}</strong></div><div class="detail-item"><span>Referral</span><strong>${esc(item.referral)}</strong></div><div class="detail-item"><span>Emergency contact</span><strong>${esc(item.emergencyName)}</strong></div><div class="detail-item"><span>Emergency phone</span><strong>${esc(item.emergencyPhone)}</strong></div></div></div>
      <div class="dialog-section"><h3>Participating children</h3>${item.children.map((child) => `<div class="child-card"><strong>${esc(child.name)} · Age ${esc(child.age)} · ${esc(child.gender)}</strong><p>Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodations:</strong> ${esc(child.accommodations)}</p></div>`).join("")}</div>
      <div class="dialog-actions"><button class="button button--green" type="button" data-application-status="approved" data-application-id="${esc(item.id)}">Approve</button><button class="button button--ghost" type="button" data-application-status="info" data-application-id="${esc(item.id)}">Request information</button><button class="button button--ghost" type="button" data-application-status="waitlisted" data-application-id="${esc(item.id)}">Waitlist</button><button class="button button--danger" type="button" data-application-status="declined" data-application-id="${esc(item.id)}">Decline</button></div></div>`;
    appDialog.showModal();
    document.body.classList.add("dialog-open");
    dialogContent.querySelectorAll("[data-application-status]").forEach((button) => button.addEventListener("click", () => {
      updateApplicationStatus(button.dataset.applicationId, button.dataset.applicationStatus);
      closeDialog();
      renderOrganizer("applications");
    }));
  }

  function updateApplicationStatus(id, status) {
    const item = state.applications.find((record) => record.id === id);
    if (!item) return;
    item.status = status;
    state.activity.unshift({ text: `${item.id} was marked ${formatStatus(status)} by Organizer.`, time: "Just now" });
    saveState();
    toast(`${item.id} marked ${formatStatus(status)}.`);
  }

  function closeDialog() {
    if (appDialog.open) appDialog.close();
    document.body.classList.remove("dialog-open");
  }

  function exportCsv(type) {
    const rows = type === "volunteers"
      ? [["ID", "Name", "Email", "Phone", "Role", "Shift", "Checked in"], ...state.volunteers.map((item) => [item.id, item.name, item.email, item.phone, item.role, item.shift, item.checkedIn ? "Yes" : "No"])]
      : [["ID", "Guardian", "Email", "Phone", "Children", "Status", "Flags"], ...state.applications.map((item) => [item.id, item.guardian, item.email, item.phone, item.children.map((child) => child.name).join("; "), formatStatus(item.status), item.flags.join("; ")])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `campbells-crew-${type}-demo.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast(`${type === "volunteers" ? "Volunteer" : "Application"} CSV created.`);
  }

  pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pinInput.value.trim() === TEST_PIN) {
      setUnlocked(true);
      return;
    }
    pinError.hidden = false;
    pinInput.select();
  });

  pinInput.addEventListener("input", () => {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
    pinError.hidden = true;
  });

  lockButton.addEventListener("click", () => {
    if (SERVER_AUTH) {
      window.location.assign("/test-site/logout");
      return;
    }
    setUnlocked(false);
  });
  document.querySelector("[data-close-dialog]").addEventListener("click", closeDialog);
  appDialog.addEventListener("click", (event) => { if (event.target === appDialog) closeDialog(); });
  window.addEventListener("hashchange", renderRoute);

  setUnlocked(SERVER_AUTH || sessionStorage.getItem(SESSION_KEY) === "yes");
})();

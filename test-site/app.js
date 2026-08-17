(function () {
  "use strict";

  const TEST_PIN = "2017";
  const SERVER_AUTH = document.documentElement.dataset.serverAuth === "true";
  const SESSION_KEY = "ccc-test-site-unlocked";
  const STATE_KEY = "ccc-signup-prototype-state-v4";
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
    { id: "shopper", title: "Shopper", description: "Shop one-on-one with a child for approved essentials.", shift: "6:00 AM – 10:00 AM", capacity: 65, enabled: true },
    { id: "cart-checker", title: "Cart Checker", description: "Review carts against the event shopping guide.", shift: "7:00 AM – 10:00 AM", capacity: 8, enabled: true },
    { id: "checkout", title: "Checkout Assistant", description: "Keep checkout groups organized and moving.", shift: "7:00 AM – 10:00 AM", capacity: 10, enabled: true },
    { id: "photographer", title: "Photographer", description: "Capture respectful event moments under charity guidelines.", shift: "6:00 AM – 9:30 AM", capacity: 3, enabled: true },
    { id: "greeter", title: "Greeter / Sign-In", description: "Welcome families and volunteers and confirm arrival.", shift: "5:30 AM – 9:00 AM", capacity: 12, enabled: true },
    { id: "floater", title: "Floater", description: "Go wherever organizers need an extra set of hands.", shift: "5:30 AM – 10:00 AM", capacity: 22, enabled: true }
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
        shoppingBudget: 150,
        roles: volunteerRoles.map((role) => ({ ...role })),
        questions: { shirtSize: true, volunteerNotes: true, accommodations: true, preferences: true, documents: true },
        budgetItems: [
          { id: "shirts", label: "Shirts", enabled: true, mode: "always", amount: 20 },
          { id: "pants", label: "Pants", enabled: true, mode: "always", amount: 25 },
          { id: "socks", label: "Socks", enabled: true, mode: "always", amount: 10 },
          { id: "underwear", label: "Underwear", enabled: true, mode: "always", amount: 15 },
          { id: "bras", label: "Bras", enabled: true, mode: "relevant", amount: 15 },
          { id: "coats", label: "Coats", enabled: true, mode: "always", amount: 25 },
          { id: "shoes", label: "Shoes", enabled: true, mode: "always", amount: 30 },
          { id: "toys", label: "Toys", enabled: false, mode: "optional", amount: 10 }
        ],
        templates: { rules: "2026-event-rules.pdf", child: "CCC-child-shopping-sheet.pdf" },
        emailTemplates: [
          { id: "vol-confirm", title: "Volunteer registration confirmed", enabled: true, subject: "You're registered for {{event}}", timing: "Immediately after signup" },
          { id: "rec-received", title: "Recipient application received", enabled: true, subject: "We received your Campbell's Crew application", timing: "Immediately after application" },
          { id: "day-before", title: "Day-before reminder", enabled: true, subject: "Tomorrow: {{event}} details", timing: "One day before event" },
          { id: "needs-info", title: "Application needs information", enabled: true, subject: "Action needed for application {{id}}", timing: "Sent manually after review" }
        ]
      },
      volunteers: [
        { id: "VOL-26001", name: "Jordan Ellis", email: "jordan@example.org", phone: "480-555-0141", role: "Shopper", shift: "6:00 AM – 10:00 AM", status: "confirmed", checkedIn: true, checkedAt: "5:34 AM", notes: "", history: [{ event: "Christmas Shopping 2025", role: "Shopper", result: "Attended" }, { event: "Back-to-School 2025", role: "Floater", result: "Attended" }] },
        { id: "VOL-26002", name: "Taylor Morgan", email: "taylor@example.org", phone: "480-555-0172", role: "Greeter / Sign-In", shift: "5:30 AM – 9:00 AM", status: "confirmed", checkedIn: true, checkedAt: "5:21 AM", notes: "", history: [{ event: "Christmas Shopping 2025", role: "Greeter / Sign-In", result: "Attended" }] },
        { id: "VOL-26003", name: "Riley Chen", email: "riley@example.org", phone: "602-555-0189", role: "Shopper", shift: "6:00 AM – 10:00 AM", status: "confirmed", checkedIn: false, checkedAt: "", notes: "Called out sick in 2025.", history: [{ event: "Christmas Shopping 2025", role: "Shopper", result: "Excused absence" }] },
        { id: "VOL-26004", name: "Morgan Patel", email: "morgan@example.org", phone: "480-555-0128", role: "Photographer", shift: "6:00 AM – 9:30 AM", status: "confirmed", checkedIn: false, checkedAt: "" },
        { id: "VOL-26005", name: "Casey Flores", email: "casey@example.org", phone: "602-555-0117", role: "Floater", shift: "5:30 AM – 10:00 AM", status: "confirmed", checkedIn: false, checkedAt: "", notes: "", history: [{ event: "Summer Shopping 2026", role: "Floater", result: "No-show" }] }
      ],
      applications: [
        {
          id: "CCC-26041", guardian: "Maria Alvarez", email: "maria@example.org", phone: "480-555-0107", address: "1842 S Desert View Dr", city: "Mesa", zip: "85204", referral: "School counselor", emergencyName: "Luis Alvarez", emergencyPhone: "480-555-0159", emergencyRelation: "Uncle", submitted: "Aug 14, 2026", status: "submitted", flags: ["Similar household address"], checkedIn: false,
          previousAttendance: [{ event: "Christmas Shopping 2024", result: "No-show" }], updated: true, children: [
            { id: "CH-260411", name: "Sofia", birthdate: "2017-03-12", age: 9, gender: "Girl", shirt: "10/12", pants: "10", shoes: "4", underwear: "10/12", coat: "10/12", preferences: "Purple, art, comfortable leggings", accommodations: "Sensitive to loud noises", attendance: "expected", attendanceNote: "" },
            { id: "CH-260412", name: "Mateo", birthdate: "2019-08-09", age: 7, gender: "Boy", shirt: "7/8", pants: "8 slim", shoes: "2", underwear: "7/8", coat: "8", preferences: "Blue, dinosaurs, tag-free shirts", accommodations: "None", attendance: "expected", attendanceNote: "" }
          ]
        },
        {
          id: "CCC-26042", guardian: "Danielle Brooks", email: "danielle@example.org", phone: "602-555-0114", address: "902 E Palm Ln", city: "Phoenix", zip: "85006", referral: "Community partner", emergencyName: "Monica Brooks", emergencyPhone: "602-555-0198", emergencyRelation: "Grandmother", submitted: "Aug 15, 2026", status: "review", flags: ["Phone used on prior application", "Child name resembles existing record"], checkedIn: false,
          previousAttendance: [], updated: false, children: [
            { id: "CH-260421", name: "Avery", birthdate: "2016-11-21", age: 9, gender: "Girl", shirt: "12/14", pants: "12", shoes: "5", underwear: "12/14", coat: "14", preferences: "Black, green, graphic tees", accommodations: "Needs extra time making choices", attendance: "expected", attendanceNote: "" }
          ]
        },
        {
          id: "CCC-26038", guardian: "Elena Ramirez", email: "elena@example.org", phone: "480-555-0166", address: "551 W Ocotillo Rd", city: "Chandler", zip: "85248", referral: "Church referral", emergencyName: "Rosa Ramirez", emergencyPhone: "480-555-0182", emergencyRelation: "Sister", submitted: "Aug 12, 2026", status: "approved", flags: [], checkedIn: true, checkedAt: "6:07 AM",
          previousAttendance: [{ event: "Christmas Shopping 2025", result: "Attended" }], updated: false, children: [
            { id: "CH-260381", name: "Lucas", birthdate: "2015-06-18", age: 11, gender: "Boy", shirt: "Youth XL", pants: "16 husky", shoes: "7", underwear: "Youth XL", coat: "Adult S", preferences: "Red, basketball, athletic pants", accommodations: "None", attendance: "checked", attendanceNote: "", checkedAt: "6:07 AM" }
          ]
        },
        {
          id: "CCC-26035", guardian: "Kendra White", email: "kendra@example.org", phone: "602-555-0134", address: "1307 N 24th St", city: "Phoenix", zip: "85008", referral: "Social worker", emergencyName: "James White", emergencyPhone: "602-555-0149", emergencyRelation: "Father", submitted: "Aug 11, 2026", status: "info", flags: ["Eligibility document missing"], checkedIn: false,
          previousAttendance: [], updated: false, children: [
            { id: "CH-260351", name: "Noah", birthdate: "2018-02-03", age: 8, gender: "Boy", shirt: "8", pants: "8", shoes: "3", underwear: "8", coat: "8/10", preferences: "Minecraft, soft sweatshirts", accommodations: "None", attendance: "expected", attendanceNote: "" }
          ]
        }
      ],
      users: [
        { name: "Shane Faulkner", email: "shane@campbellscrew.com", role: "Executive Owner", status: "Active" },
        { name: "Board Administrator", email: "admin@campbellscrew.com", role: "Event Administrator", status: "Invited" },
        { name: "Event iPad", email: "checkin@campbellscrew.com", role: "Check-In Staff", status: "Active" }
      ],
      reports: [{ event: "Christmas Shopping 2025", status: "Closed", childrenRegistered: 112, childrenAttended: 104, volunteersRegistered: 76, volunteersAttended: 69, volunteerHours: 318, totalSpent: 18420 }],
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
  let volunteerStep = 0;
  let volunteerConfirmation = null;
  let recipientStep = 0;
  let recipientConfirmation = null;
  let recipientDraft = createRecipientDraft();
  let checkinType = "recipients";
  let applicationSort = "submitted-newest";

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
    const roles = event.roles.filter((role) => role.enabled);
    const role = roles.find((item) => item.id === selectedVolunteerRole) || roles[0];
    if (role) selectedVolunteerRole = role.id;
    const isClosed = event.volunteerStatus === "closed";
    const roleMarkup = roles.map((item) => {
      const registered = state.volunteers.filter((volunteer) => volunteer.role === item.title).length;
      return `<button class="compact-role" type="button" data-role="${esc(item.id)}" aria-pressed="${selectedVolunteerRole === item.id}"><span class="compact-role__radio"></span><span><strong>${esc(item.title)}</strong><b>${esc(item.shift)} · ${Math.max(0, item.capacity - registered)} spots</b><small>${esc(item.description)}</small></span></button>`;
    }).join("");
    main.innerHTML = `<div class="volunteer-simple"><a class="back-link" href="#home">← Back to signup home</a>
      ${(volunteerStep === 0 || isClosed) ? `<section class="volunteer-event-card"><div class="volunteer-event-card__top"><span><i></i> Registration ${isClosed ? "closed" : "open"}</span><b>${Math.max(0, event.volunteerCapacity - state.volunteers.length)} spots left</b><button class="dots-button" type="button" data-organizer-access aria-label="Organizer options">•••</button></div><div class="volunteer-event-card__body"><div class="volunteer-date"><small>DEC</small><strong>05</strong></div><div><p class="eyebrow">Featured event</p><h1>${esc(event.title)}</h1><p><strong>${esc(event.date)} · ${esc(event.time)}</strong></p><p>${esc(event.location)}</p>
      ${isClosed ? `<div class="closed-message"><strong>Volunteer registration is closed.</strong><span>Please check back for another opportunity.</span></div>` : `<div class="volunteer-card-actions"><button class="button button--dark" type="button" data-vol-step="1">Choose a role →</button><button class="button button--text" type="button" data-event-details>Event details</button></div>`}</div></div></section>` : ""}
      ${!isClosed && volunteerStep === 1 ? `<section class="volunteer-focus-card"><div class="focus-card-head"><p class="eyebrow">Step 1 of 2</p><button type="button" class="dialog-close-inline" data-vol-step="0" aria-label="Close">×</button></div><h2>How would you<br>like to help?</h2><div class="compact-role-list">${roleMarkup}</div><button class="button button--dark button--wide" type="button" data-vol-step="2">Continue with ${esc(role?.title || "selected role")} →</button></section>` : ""}
      ${!isClosed && volunteerStep === 2 ? `<section class="volunteer-focus-card"><div class="focus-card-head"><p class="eyebrow">Step 2 of 2</p><button type="button" class="dialog-close-inline" data-vol-step="1" aria-label="Back">←</button></div><h2>A few details,<br>and you're in.</h2><div class="selected-role"><span>Selected role</span><strong>${esc(role?.title || "Volunteer")}</strong><small>${esc(role?.shift || event.time)}</small></div><form id="volunteer-form"><div class="form-grid"><div class="field"><label for="vol-first">First name</label><input id="vol-first" name="firstName" autocomplete="given-name" required></div><div class="field"><label for="vol-last">Last name</label><input id="vol-last" name="lastName" autocomplete="family-name" required></div><div class="field field--span-2"><label for="vol-email">Email address</label><input id="vol-email" name="email" type="email" autocomplete="email" required></div><div class="field field--span-2"><label for="vol-phone">Mobile phone</label><input id="vol-phone" name="phone" type="tel" autocomplete="tel" required></div>${event.questions.shirtSize ? `<div class="field"><label for="vol-shirt">T-shirt size</label><select id="vol-shirt" name="shirt"><option value="">Choose size</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></div>` : ""}${event.questions.volunteerNotes ? `<div class="field field--span-2"><label for="vol-notes">Special notes <span>(optional)</span></label><textarea id="vol-notes" name="notes" placeholder="Anything organizers should know?"></textarea></div>` : ""}${event.volunteerStatus === "code" ? `<div class="field field--span-2"><label for="vol-code">Invitation code</label><input id="vol-code" name="volunteerCode" required></div>` : ""}</div><input type="hidden" name="role" value="${esc(selectedVolunteerRole)}"><input type="hidden" name="shift" value="${esc(role?.shift || event.time)}"><label class="checkbox-row"><input type="checkbox" name="agreement" required><span>I agree to follow Campbell's Crew event and child-safety instructions.</span></label><button class="button button--dark button--wide" type="submit">Complete signup →</button></form></section>` : ""}</div>`;

    main.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => { selectedVolunteerRole = button.dataset.role; renderVolunteer(); }));
    main.querySelectorAll("[data-vol-step]").forEach((button) => button.addEventListener("click", () => { volunteerStep = Number(button.dataset.volStep); renderVolunteer(); }));
    const details = main.querySelector("[data-event-details]");
    if (details) details.addEventListener("click", openEventDetails);
    const organizerAccess = main.querySelector("[data-organizer-access]");
    if (organizerAccess) organizerAccess.addEventListener("click", openOrganizerAccess);
    const form = document.querySelector("#volunteer-form");
    if (form) form.addEventListener("submit", submitVolunteer);
  }

  function openEventDetails() {
    dialogContent.innerHTML = `<div class="dialog-body"><p class="eyebrow">Event details</p><h2 id="dialog-title">${esc(state.event.title)}</h2><div class="detail-grid"><div class="detail-item"><span>Date</span><strong>${esc(state.event.date)}</strong></div><div class="detail-item"><span>Time</span><strong>${esc(state.event.time)}</strong></div><div class="detail-item"><span>Location</span><strong>${esc(state.event.location)}</strong></div><div class="detail-item"><span>Address</span><strong>${esc(state.event.address)}</strong></div></div><button class="button button--green" type="button" data-close-dialog-inner>Continue to signup →</button></div>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("[data-close-dialog-inner]").addEventListener("click", () => { closeDialog(); volunteerStep = 1; renderVolunteer(); });
  }

  function openOrganizerAccess() {
    dialogContent.innerHTML = `<div class="dialog-body"><p class="eyebrow">Private organizer access</p><h2 id="dialog-title">Manage this event</h2><p>Authorized organizers can jump directly to this event's settings.</p><a class="button button--dark" href="#organizer/events" data-close-dialog-inner>Organizer access →</a></div>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("[data-close-dialog-inner]").addEventListener("click", closeDialog);
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
    const role = state.event.roles.find((item) => item.id === data.get("role"));
    const record = {
      id: makeId("VOL", state.volunteers), name: `${data.get("firstName")} ${data.get("lastName")}`.trim(), email: data.get("email"), phone: data.get("phone"), role: role ? role.title : "Volunteer", shift: data.get("shift"), shirt: data.get("shirt") || "", notes: data.get("notes") || "", history: [], status: "confirmed", checkedIn: false, checkedAt: ""
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
      children: recipientDraft.children.map((child, index) => ({ ...child, id: `child-${Date.now()}-${index}`, attendance: "expected", attendanceNote: "", age: child.birthdate ? Math.max(0, new Date().getFullYear() - Number(child.birthdate.slice(0, 4))) : "" }))
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
      ${organizerLink("dashboard", "Overview", subroute)}${organizerLink("events", "Event setup", subroute)}${organizerLink("volunteers", "Volunteer directory", subroute)}${organizerLink("applications", "Applications", subroute, reviewCount)}${organizerLink("checkin", "Check-in", subroute)}${organizerLink("packets", "Print packets", subroute)}${organizerLink("emails", "Email center", subroute)}${organizerLink("reports", "Reports & history", subroute)}${organizerLink("settings", "Settings", subroute)}
      </nav><p class="organizer-sidebar__footer">Signed in as Executive Owner · Demonstration workspace</p></aside><section class="organizer-main">${content}</section></div>`;
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
    else if (subroute === "emails") content = organizerEmails();
    else if (subroute === "reports") content = organizerReports();
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
    return `<div class="event-context"><label>Working event<select aria-label="Working event"><option>${esc(state.event.title)}</option><option>Christmas Shopping 2025 (closed)</option></select></label><div><button class="button button--light" type="button" data-demo-action="duplicate">Duplicate event</button><button class="button button--green" type="button" data-demo-action="create">Create event</button></div></div>${heading("Organizer overview", state.event.title, "Current event operations and items needing attention.", `<a class="button button--green" href="#organizer/checkin">Open check-in →</a>`)}
      <div class="metric-grid"><article class="metric-card"><span>Volunteers registered</span><strong>${state.volunteers.length}</strong><small>${state.event.volunteerCapacity - state.volunteers.length} spots remaining</small></article><article class="metric-card"><span>Children requested</span><strong>${applicants}</strong><small>Across ${state.applications.length} households</small></article><article class="metric-card"><span>Awaiting review</span><strong>${review}</strong><small>Needs organizer attention</small></article><article class="metric-card"><span>Children approved</span><strong>${approved}</strong><small>Ready for event packets</small></article></div>
      <div class="dashboard-grid"><article class="panel"><div class="panel-header"><div><h2>${esc(state.event.title)}</h2><p>${esc(state.event.date)} · ${esc(state.event.location)}</p></div>${statusPill(state.event.volunteerStatus, "Volunteer signup " + formatStatus(state.event.volunteerStatus))}</div><div class="progress-block"><div class="progress-block__label"><span>Volunteer capacity</span><strong>${state.volunteers.length} / ${state.event.volunteerCapacity}</strong></div><div class="progress-track"><span style="width:${volunteerPercent}%"></span></div></div><div class="progress-block"><div class="progress-block__label"><span>Recipient capacity</span><strong>${applicants} / ${state.event.recipientCapacity}</strong></div><div class="progress-track"><span style="width:${recipientPercent}%"></span></div></div><div class="quick-actions" style="margin-top:28px"><a class="quick-action" href="#organizer/events"><strong>Edit event</strong><span>→</span></a><a class="quick-action" href="#organizer/applications"><strong>Review applications</strong><span>→</span></a><a class="quick-action" href="#organizer/volunteers"><strong>View volunteers</strong><span>→</span></a><a class="quick-action" href="#organizer/packets"><strong>Prepare packets</strong><span>→</span></a></div></article><article class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p>Changes made in this prototype</p></div></div><div class="activity-list">${state.activity.slice(0, 6).map((item) => `<div class="activity-item"><span class="activity-dot"></span><p>${esc(item.text)}</p><time>${esc(item.time)}</time></div>`).join("")}</div></article></div>`;
  }

  function organizerEvents() {
    const e = state.event;
    const budgetTotal = e.budgetItems.filter((item) => item.enabled).reduce((sum, item) => sum + Number(item.amount), 0);
    return `${heading("Event management", "Event setup", "Configure the public forms, event-day rules, budgets and access in one place.", `<a class="button button--light" href="#volunteer">Preview volunteer page</a>`)}
      <form id="event-form"><details class="settings-section" open><summary><span><b>01</b><strong>Event basics</strong></span><small>Date, place and overall capacity</small></summary><div class="settings-section__body"><div class="form-grid"><div class="field field--span-2"><label for="event-title">Event name</label><input id="event-title" name="title" value="${esc(e.title)}" required></div><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" value="${esc(e.date)}" required></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" value="${esc(e.time)}" required></div><div class="field"><label for="event-location">Meeting location</label><input id="event-location" name="location" value="${esc(e.location)}" required></div><div class="field"><label for="event-address">Address</label><input id="event-address" name="address" value="${esc(e.address)}" required></div><div class="field"><label for="vol-capacity">Overall volunteer capacity</label><input id="vol-capacity" name="volunteerCapacity" type="number" min="1" value="${esc(e.volunteerCapacity)}"></div><div class="field"><label for="rec-capacity">Recipient child capacity</label><input id="rec-capacity" name="recipientCapacity" type="number" min="1" value="${esc(e.recipientCapacity)}"></div></div></div></details>
      <details class="settings-section" open><summary><span><b>02</b><strong>Volunteer roles & spots</strong></span><small>Names, shifts and limits</small></summary><div class="settings-section__body"><div class="editor-table"><div class="editor-row editor-row--head"><span>Open</span><span>Role</span><span>Shift</span><span>Spots</span></div>${e.roles.map((role) => `<div class="editor-row"><label class="switch"><input type="checkbox" name="role-enabled-${role.id}" ${role.enabled ? "checked" : ""}><span></span></label><input aria-label="${esc(role.title)} role name" name="role-title-${role.id}" value="${esc(role.title)}"><input aria-label="${esc(role.title)} shift" name="role-shift-${role.id}" value="${esc(role.shift)}"><input aria-label="${esc(role.title)} spots" name="role-capacity-${role.id}" type="number" min="0" value="${esc(role.capacity)}"></div>`).join("")}</div><button class="button button--light" type="button" data-demo-action="add-role">+ Add another role</button></div></details>
      <details class="settings-section"><summary><span><b>03</b><strong>Signup access & questions</strong></span><small>Open, code, closed and field visibility</small></summary><div class="settings-section__body"><h3>Volunteer registration</h3><div class="event-editor-grid">${statusChoice("volunteerStatus", "open", "Open", "Anyone can register.", e.volunteerStatus)}${statusChoice("volunteerStatus", "code", "Access code", "Require an invitation code.", e.volunteerStatus)}${statusChoice("volunteerStatus", "closed", "Closed", "Show a closed message.", e.volunteerStatus)}</div><div class="field"><label for="volunteer-access-code">Volunteer invitation code</label><input id="volunteer-access-code" name="volunteerCode" value="${esc(e.volunteerCode)}"></div><h3>Recipient applications</h3><div class="event-editor-grid">${statusChoice("recipientStatus", "open", "Open", "Applications without a code.", e.recipientStatus)}${statusChoice("recipientStatus", "code", "Access code", "Require referral code.", e.recipientStatus)}${statusChoice("recipientStatus", "closed", "Closed", "Stop new applications.", e.recipientStatus)}</div><div class="field"><label for="recipient-access-code">Recipient invitation code</label><input id="recipient-access-code" name="recipientCode" value="${esc(e.recipientCode)}"></div><div class="toggle-grid">${questionToggle("shirtSize", "Volunteer T-shirt size", e.questions.shirtSize)}${questionToggle("volunteerNotes", "Volunteer special notes", e.questions.volunteerNotes)}${questionToggle("preferences", "Child preferences", e.questions.preferences)}${questionToggle("accommodations", "Child accommodations", e.questions.accommodations)}${questionToggle("documents", "Supporting documents", e.questions.documents)}</div></div></details>
      <details class="settings-section" open><summary><span><b>04</b><strong>Shopping rules & budgets</strong></span><small>Current enabled total: <b id="budget-total">$${budgetTotal}</b></small></summary><div class="settings-section__body"><div class="budget-header"><div><label for="budget">Overall per-child maximum</label><input id="budget" name="shoppingBudget" type="number" min="0" value="${esc(e.shoppingBudget)}"></div><p>Enable only what this event offers. Amounts print automatically on every shopping guide.</p></div><div class="budget-grid">${e.budgetItems.map((item) => `<label class="budget-item"><input type="checkbox" name="budget-enabled-${item.id}" ${item.enabled ? "checked" : ""}><span><strong>${esc(item.label)}</strong><small>${esc(item.mode === "relevant" ? "When relevant" : item.mode === "optional" ? "Optional" : "Standard item")}</small></span><b>$</b><input aria-label="${esc(item.label)} budget" name="budget-amount-${item.id}" type="number" min="0" value="${esc(item.amount)}"></label>`).join("")}</div></div></details>
      <div class="sticky-save"><span>Changes remain in this demonstration browser.</span><button class="button button--green" type="submit">Save & update event →</button></div></form>`;
  }

  function questionToggle(id, label, checked) { return `<label class="question-toggle"><input type="checkbox" name="question-${id}" ${checked ? "checked" : ""}><span><strong>${esc(label)}</strong><small>${checked ? "Shown" : "Hidden"} on the public form</small></span></label>`; }

  function statusChoice(name, value, title, copy, current) {
    return `<div class="status-choice"><input id="${name}-${value}" type="radio" name="${name}" value="${value}" ${current === value ? "checked" : ""}><label for="${name}-${value}"><strong>${esc(title)}</strong><span>${esc(copy)}</span></label></div>`;
  }

  function organizerVolunteers(filter = "") {
    const normalized = normalize(filter);
    const rows = state.volunteers.filter((item) => !normalized || normalize(`${item.name} ${item.email} ${item.phone} ${item.role}`).includes(normalized));
    return `${heading("People & participation", "Volunteer directory", "Permanent volunteer profiles with event registrations and reliability history.", `<button class="button button--light" type="button" data-export="volunteers">Download volunteers.csv</button>`)}<div class="view-tabs"><button class="is-active" type="button">All volunteers</button><button type="button" data-demo-action="roster">Current event roster</button></div><div class="table-tools"><label class="search-field"><span class="screen-reader-only">Search volunteers</span><input id="volunteer-search" type="search" value="${esc(filter)}" placeholder="Search name, email, phone, or role"></label><span>${rows.length} volunteer${rows.length === 1 ? "" : "s"}</span></div><div class="directory-list">${rows.map((item) => { const history = item.history || []; const noShows = history.filter((entry) => entry.result === "No-show").length; return `<details class="directory-card"><summary><span><strong>${esc(item.name)}</strong><small>${esc(item.email)} · ${esc(item.phone)}</small></span><span><b>${esc(item.role)}</b><small>${history.length} prior event${history.length === 1 ? "" : "s"}${noShows ? ` · ${noShows} no-show` : ""}</small></span>${item.checkedIn ? statusPill("checked") : statusPill("submitted", "Registered")}</summary><div class="directory-card__body"><div><h3>Current event</h3><p>${esc(state.event.title)} · ${esc(item.role)} · ${esc(item.shift)}</p><p><strong>Organizer note:</strong> ${esc(item.notes || "No notes")}</p></div><div><h3>Event history</h3>${history.length ? history.map((entry) => `<p class="history-row"><span>${esc(entry.event)} · ${esc(entry.role)}</span><b class="${entry.result === "No-show" ? "text-danger" : ""}">${esc(entry.result)}</b></p>`).join("") : `<p>No prior events recorded.</p>`}</div></div></details>`; }).join("")}</div>`;
  }

  function organizerApplications(filter = "") {
    const normalized = normalize(filter);
    let rows = state.applications.filter((item) => !normalized || normalize(`${item.guardian} ${item.email} ${item.phone} ${item.id} ${item.children.map((child) => child.name).join(" ")}`).includes(normalized));
    const compareName = (a, b) => a.guardian.localeCompare(b.guardian);
    if (applicationSort === "name-az") rows.sort(compareName); else if (applicationSort === "name-za") rows.sort((a, b) => compareName(b, a)); else if (applicationSort === "status") rows.sort((a, b) => a.status.localeCompare(b.status)); else if (applicationSort === "flags") rows.sort((a, b) => (b.flags.length + (b.updated ? 1 : 0)) - (a.flags.length + (a.updated ? 1 : 0))); else if (applicationSort === "submitted-oldest") rows.reverse();
    return `${heading("Recipient review", "Applications", "Households stay grouped while every child keeps an individual record.", `<button class="button button--light" type="button" data-export="applications">Download applications.csv</button>`)}<div class="table-tools table-tools--wrap"><label class="search-field"><span class="screen-reader-only">Search applications</span><input id="application-search" type="search" value="${esc(filter)}" placeholder="Search guardian, child, phone, or ID"></label><label class="sort-field">Sort by<select id="application-sort"><option value="submitted-newest" ${applicationSort === "submitted-newest" ? "selected" : ""}>Newest submitted</option><option value="submitted-oldest" ${applicationSort === "submitted-oldest" ? "selected" : ""}>Oldest submitted</option><option value="name-az" ${applicationSort === "name-az" ? "selected" : ""}>Guardian name A–Z</option><option value="name-za" ${applicationSort === "name-za" ? "selected" : ""}>Guardian name Z–A</option><option value="status" ${applicationSort === "status" ? "selected" : ""}>Status</option><option value="flags" ${applicationSort === "flags" ? "selected" : ""}>Most flags</option></select></label><span>${rows.length} households</span></div><div class="application-list">${rows.map((item) => `<article class="application-row"><div><strong>${esc(item.guardian)}</strong><small>${esc(item.id)} · ${esc(item.submitted)} · ${item.children.length} child${item.children.length === 1 ? "" : "ren"}</small></div><div class="child-chip-list">${item.children.map((child) => `<span><b>${esc(child.name)}</b><small>Age ${esc(child.age)} · ${esc(formatStatus(child.attendance || "expected"))}</small></span>`).join("")}</div><div class="flag-list">${item.updated ? `<span class="flag flag--blue">Application updated · review</span>` : ""}${(item.previousAttendance || []).some((entry) => entry.result === "No-show") ? `<span class="flag flag--danger">Previous no-show</span>` : ""}${item.flags.map((flag) => `<span class="flag">${esc(flag)}</span>`).join("")}</div><div>${statusPill(item.status)}<button class="button button--small button--ghost" type="button" data-open-application="${esc(item.id)}">Review household</button></div></article>`).join("")}</div>`;
  }

  function organizerCheckin(filter = "") {
    const records = checkinType === "volunteers" ? state.volunteers : state.applications.filter((item) => item.status === "approved").flatMap((household) => household.children.map((child) => ({ ...child, guardian: household.guardian, householdId: household.id, phone: household.phone })));
    const normalized = normalize(filter);
    const rows = records.filter((item) => !normalized || normalize(checkinType === "volunteers" ? `${item.name} ${item.email} ${item.phone} ${item.role}` : `${item.guardian} ${item.name} ${item.householdId}`).includes(normalized)).sort((a, b) => a.name.localeCompare(b.name));
    const checked = records.filter((item) => checkinType === "volunteers" ? item.checkedIn : item.attendance === "checked").length;
    return `${heading("Event-day tools", "Check-in", "Every arrival requires a review and confirmation before it is recorded.")}
      <div class="checkin-summary"><article class="checkin-card"><strong>${checked}</strong><span>Checked in</span></article><article class="checkin-card"><strong>${Math.max(0, records.length - checked)}</strong><span>Still expected</span></article></div>
      <article class="panel"><div class="table-tools"><div class="segmented"><button type="button" data-checkin-type="recipients" aria-pressed="${checkinType === "recipients"}">Children</button><button type="button" data-checkin-type="volunteers" aria-pressed="${checkinType === "volunteers"}">Volunteers</button></div><label class="search-field"><span class="screen-reader-only">Search check-in list</span><input id="checkin-search" type="search" value="${esc(filter)}" placeholder="Search name, household, role"></label></div><div class="checkin-list">${rows.length ? rows.map((item) => { const isChecked = checkinType === "volunteers" ? item.checkedIn : item.attendance === "checked"; const id = checkinType === "volunteers" ? item.id : `${item.householdId}|${item.id}`; return `<article class="checkin-row"><div><strong>${esc(item.name)}</strong><small>${checkinType === "volunteers" ? `${esc(item.role)} · ${esc(item.shift)}` : `${esc(item.guardian)} household · ${esc(item.householdId)}`}</small></div>${statusPill(isChecked ? "checked" : "submitted", isChecked ? `Checked ${esc(item.checkedAt || "in")}` : esc(formatStatus(item.attendance || "expected")))}<div class="row-actions"><button class="dots-button" type="button" data-checkin-note="${esc(id)}" aria-label="Make note for ${esc(item.name)}">•••</button><button class="button button--small ${isChecked ? "button--ghost" : "button--green"}" type="button" data-confirm-checkin="${esc(id)}">${isChecked ? "Undo" : "Check in"}</button></div></article>`; }).join("") : `<div class="empty-state"><strong>No matching records</strong>Try another search.</div>`}</div></article>`;
  }

  function organizerPackets() {
    const approved = state.applications.filter((item) => item.status === "approved");
    const guides = state.event.budgetItems.filter((item) => item.enabled);
    return `${heading("Volunteer handoff", "Print packets", "Child sheets and current rules print in alternating order.", `<button class="button button--green" type="button" data-print-mode="all">Print all complete packets</button>`)}<article class="panel template-panel"><div><h2>Packet templates</h2><p>Replace the blank child sheet or event rules when your documents change.</p></div><label class="upload-button">Upload child sheet<input type="file" data-template="child" accept=".pdf"></label><span>${esc(state.event.templates.child)}</span><label class="upload-button">Upload rules PDF<input type="file" data-template="rules" accept=".pdf"></label><span>${esc(state.event.templates.rules)}</span></article><div class="packet-list">${approved.flatMap((item) => item.children.map((child) => `<article class="packet-card" data-packet-child="${esc(child.id)}"><div class="packet-card__head"><div><p class="eyebrow">${esc(item.guardian)} household · ${esc(item.id)}</p><h3>${esc(child.name)} · Age ${esc(child.age)}</h3><p>Emergency: ${esc(item.emergencyName)}, ${esc(item.emergencyPhone)}</p></div>${statusPill("approved")}</div><section class="print-child-sheet"><h4>Child information sheet</h4><p><strong>Sizes:</strong> Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodation:</strong> ${esc(child.accommodations)}</p></section><section class="print-rules-sheet"><h4>Event shopping guide</h4><p>Overall maximum: <strong>$${esc(state.event.shoppingBudget)}</strong></p><div class="guide-items">${guides.map((guide) => `<span>${esc(guide.label)} <b>$${esc(guide.amount)}</b></span>`).join("")}</div><p>Follow the uploaded event rules for safety, emergencies, restrooms and approved purchases.</p></section><div class="packet-actions"><button class="button button--small button--ghost" type="button" data-print-mode="child" data-print-child="${esc(child.id)}">Child sheet</button><button class="button button--small button--ghost" type="button" data-print-mode="rules" data-print-child="${esc(child.id)}">Rules only</button><button class="button button--small button--green" type="button" data-print-mode="complete" data-print-child="${esc(child.id)}">Complete packet</button></div></article>`)).join("") || `<div class="empty-state"><strong>No approved children yet</strong>Approve an application to create packets.</div>`}</div>`;
  }

  function organizerEmails() {
    return `${heading("Communications", "Email center", "Automatic confirmations, scheduled reminders and targeted event updates.", `<button class="button button--green" type="button" data-demo-action="new-email">New blast email</button>`)}<div class="email-layout"><section><h2>Automated messages</h2>${state.event.emailTemplates.map((template) => `<article class="email-card"><label class="switch"><input type="checkbox" data-email-toggle="${esc(template.id)}" ${template.enabled ? "checked" : ""}><span></span></label><div><strong>${esc(template.title)}</strong><small>${esc(template.timing)}</small><p>Subject: ${esc(template.subject)}</p></div><button class="button button--small button--ghost" type="button" data-email-edit="${esc(template.id)}">Edit draft</button></article>`).join("")}</section><section class="panel"><h2>Send a blast email</h2><p>Demonstration only—nothing will actually be sent.</p><form id="blast-form"><div class="field"><label for="blast-audience">Audience</label><select id="blast-audience" name="audience"><option>All registered volunteers</option><option>All approved recipient households</option><option>Shoppers only</option><option>Everyone registered for this event</option></select></div><div class="field"><label for="blast-subject">Subject</label><input id="blast-subject" name="subject" value="Important update for ${esc(state.event.title)}" required></div><div class="field"><label for="blast-message">Message</label><textarea id="blast-message" name="message" rows="8" required>Date: ${esc(state.event.date)}&#10;Time: ${esc(state.event.time)}&#10;Location: ${esc(state.event.location)}&#10;&#10;Please arrive a few minutes early so we can begin on time.</textarea></div><div class="form-actions"><button class="button button--light" type="button" data-demo-action="test-email">Send test</button><button class="button button--green" type="submit">Review & queue email →</button></div></form></section></div>`;
  }

  function organizerReports() {
    const latest = state.reports[0];
    return `${heading("Event records", "Reports & history", "Close out an event once, preserve it permanently and compare participation over time.", `<button class="button button--green" type="button" data-demo-action="closeout">Close out current event</button>`)}<div class="metric-grid"><article class="metric-card"><span>Children attendance</span><strong>${latest.childrenAttended}/${latest.childrenRegistered}</strong><small>${Math.round((latest.childrenAttended/latest.childrenRegistered)*100)}% attended</small></article><article class="metric-card"><span>Volunteer attendance</span><strong>${latest.volunteersAttended}/${latest.volunteersRegistered}</strong><small>${latest.volunteerHours} volunteer hours</small></article><article class="metric-card"><span>Total event spending</span><strong>$${latest.totalSpent.toLocaleString()}</strong><small>$${Math.round(latest.totalSpent/latest.childrenAttended)} per attending child</small></article></div><article class="panel"><div class="panel-header"><div><h2>Close-out worksheet</h2><p>Enter final figures after the event. Saving adds a permanent read-only report.</p></div>${statusPill("review", "Draft")}</div><form id="report-form"><div class="form-grid"><div class="field"><label>Children registered<input name="childrenRegistered" type="number" value="100"></label></div><div class="field"><label>Children attended<input name="childrenAttended" type="number" value="92"></label></div><div class="field"><label>Volunteers registered<input name="volunteersRegistered" type="number" value="80"></label></div><div class="field"><label>Volunteers attended<input name="volunteersAttended" type="number" value="74"></label></div><div class="field"><label>Total volunteer hours<input name="volunteerHours" type="number" value="340"></label></div><div class="field"><label>Kids shopping<input name="shopping" type="number" value="13800"></label></div><div class="field"><label>Food<input name="food" type="number" value="700"></label></div><div class="field"><label>Planning & supplies<input name="supplies" type="number" value="900"></label></div><div class="field"><label>Other expenses<input name="other" type="number" value="250"></label></div><div class="field field--span-2"><label>Close-out notes<textarea name="notes" placeholder="Lessons learned, incidents, successes and next-year changes"></textarea></label></div></div><button class="button button--green" type="submit">Save close-out report →</button></form></article><article class="panel"><h2>Event history</h2><div class="report-row"><span><strong>${esc(latest.event)}</strong><small>${esc(latest.status)} · All records retained</small></span><b>${latest.childrenAttended} children · ${latest.volunteerHours} hours · $${latest.totalSpent.toLocaleString()}</b><button class="button button--small button--ghost" type="button" data-demo-action="view-report">View report</button></div></article>`;
  }

  function organizerSettings() {
    return `${heading("Workspace administration", "Settings", "Manage people, permissions, security defaults and demonstration data.", `<button class="button button--green" type="button" data-add-user>+ Add user</button>`)}<article class="panel"><div class="panel-header"><div><h2>Users & permissions</h2><p>Fewer than ten trusted people will have organizer access.</p></div></div><div class="permission-legend"><span><b>Executive Owner</b> Everything</span><span><b>Event Administrator</b> All event operations</span><span><b>Read-Only Coordinator</b> View without editing</span><span><b>Check-In Staff</b> Check-in only; other panels locked</span></div><div class="user-list">${state.users.map((user) => `<div class="user-row"><span><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></span><b>${esc(user.role)}</b>${statusPill(user.status === "Active" ? "approved" : "submitted", user.status)}<button class="dots-button" type="button" data-demo-action="user-menu" aria-label="User options">•••</button></div>`).join("")}</div><div class="inline-note"><strong>Check-In Staff elevation PIN:</strong> 2017 in this prototype. Production should require an administrator login before sensitive panels unlock.</div></article><article class="panel"><div class="panel-header"><div><h2>Security & retention</h2><p>Current planning decisions</p></div></div><div class="detail-grid"><div class="detail-item"><span>Organizer login</span><strong>Google Workspace planned</strong></div><div class="detail-item"><span>Event history</span><strong>Retain all years</strong></div><div class="detail-item"><span>Audit log</span><strong>Decisions, edits, emails and exports</strong></div><div class="detail-item"><span>Search visibility</span><strong>No indexing</strong></div></div></article><article class="panel danger-zone"><div><h2>Danger zone</h2><p>Restore the original fictional event, volunteers and applications.</p></div><button class="button button--danger" type="button" data-reset-demo>Reset demonstration data</button></article>`;
  }

  function bindOrganizer(subroute) {
    if (subroute === "events") {
      document.querySelector("#event-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const data = new FormData(event.currentTarget);
        ["title", "date", "time", "location", "address", "volunteerStatus", "recipientStatus", "volunteerCode", "recipientCode"].forEach((key) => { state.event[key] = String(data.get(key) || "").trim(); });
        ["volunteerCapacity", "recipientCapacity", "shoppingBudget"].forEach((key) => { state.event[key] = Number(data.get(key)); });
        state.event.roles.forEach((role) => {
          role.enabled = data.has(`role-enabled-${role.id}`);
          role.title = String(data.get(`role-title-${role.id}`) || role.title).trim();
          role.shift = String(data.get(`role-shift-${role.id}`) || role.shift).trim();
          role.capacity = Number(data.get(`role-capacity-${role.id}`) || 0);
        });
        Object.keys(state.event.questions).forEach((key) => { state.event.questions[key] = data.has(`question-${key}`); });
        state.event.budgetItems.forEach((item) => {
          item.enabled = data.has(`budget-enabled-${item.id}`);
          item.amount = Number(data.get(`budget-amount-${item.id}`) || 0);
        });
        state.activity.unshift({ text: "Event settings were updated by Organizer.", time: "Just now" });
        saveState();
        toast("Event changes saved across the prototype.");
        renderOrganizer("events");
      });
      document.querySelectorAll('[name^="budget-enabled-"], [name^="budget-amount-"]').forEach((input) => input.addEventListener("input", () => {
        const total = state.event.budgetItems.reduce((sum, item) => {
          const enabled = document.querySelector(`[name="budget-enabled-${item.id}"]`).checked;
          const amount = Number(document.querySelector(`[name="budget-amount-${item.id}"]`).value || 0);
          return sum + (enabled ? amount : 0);
        }, 0);
        document.querySelector("#budget-total").textContent = `$${total}`;
      }));
    }

    const volunteerSearch = document.querySelector("#volunteer-search");
    if (volunteerSearch) volunteerSearch.addEventListener("input", () => { main.innerHTML = organizerShell("volunteers", organizerVolunteers(volunteerSearch.value)); bindOrganizer("volunteers"); const next = document.querySelector("#volunteer-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const applicationSearch = document.querySelector("#application-search");
    if (applicationSearch) applicationSearch.addEventListener("input", () => { main.innerHTML = organizerShell("applications", organizerApplications(applicationSearch.value)); bindOrganizer("applications"); const next = document.querySelector("#application-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const checkinSearch = document.querySelector("#checkin-search");
    if (checkinSearch) checkinSearch.addEventListener("input", () => { main.innerHTML = organizerShell("checkin", organizerCheckin(checkinSearch.value)); bindOrganizer("checkin"); const next = document.querySelector("#checkin-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });

    const sort = document.querySelector("#application-sort");
    if (sort) sort.addEventListener("change", () => { applicationSort = sort.value; renderOrganizer("applications"); });

    document.querySelectorAll("[data-checkin-volunteer]").forEach((button) => button.addEventListener("click", () => { toggleVolunteerCheckin(button.dataset.checkinVolunteer); renderOrganizer("volunteers"); }));
    document.querySelectorAll("[data-open-application]").forEach((button) => button.addEventListener("click", () => openApplication(button.dataset.openApplication)));
    document.querySelectorAll("[data-checkin-type]").forEach((button) => button.addEventListener("click", () => { checkinType = button.dataset.checkinType; renderOrganizer("checkin"); }));
    document.querySelectorAll("[data-confirm-checkin]").forEach((button) => button.addEventListener("click", () => openCheckinConfirmation(button.dataset.confirmCheckin)));
    document.querySelectorAll("[data-checkin-note]").forEach((button) => button.addEventListener("click", () => openCheckinNote(button.dataset.checkinNote)));
    document.querySelectorAll("[data-print-mode]").forEach((button) => button.addEventListener("click", () => {
      document.body.dataset.printMode = button.dataset.printMode;
      document.body.dataset.printChild = button.dataset.printChild || "all";
      document.querySelectorAll(".packet-card").forEach((card) => card.classList.toggle("is-print-target", !button.dataset.printChild || card.dataset.packetChild === button.dataset.printChild));
      window.print();
    }));
    document.querySelectorAll("[data-template]").forEach((input) => input.addEventListener("change", () => {
      if (!input.files.length) return;
      state.event.templates[input.dataset.template] = input.files[0].name;
      saveState(); toast(`${input.files[0].name} selected as the demonstration template.`); renderOrganizer("packets");
    }));
    document.querySelectorAll("[data-email-toggle]").forEach((input) => input.addEventListener("change", () => {
      const template = state.event.emailTemplates.find((item) => item.id === input.dataset.emailToggle);
      if (template) { template.enabled = input.checked; saveState(); toast(`${template.title} ${input.checked ? "enabled" : "disabled"}.`); }
    }));
    document.querySelectorAll("[data-email-edit]").forEach((button) => button.addEventListener("click", () => openEmailDraft(button.dataset.emailEdit)));
    const blast = document.querySelector("#blast-form");
    if (blast) blast.addEventListener("submit", (event) => { event.preventDefault(); state.activity.unshift({ text: `A demonstration blast email was queued for ${new FormData(blast).get("audience")}.`, time: "Just now" }); saveState(); toast("Email reviewed and queued in demo mode—nothing was sent."); });
    const report = document.querySelector("#report-form");
    if (report) report.addEventListener("submit", (event) => {
      event.preventDefault(); const data = new FormData(report); const number = (key) => Number(data.get(key) || 0);
      const saved = { event: state.event.title, status: "Closed out", childrenRegistered: number("childrenRegistered"), childrenAttended: number("childrenAttended"), volunteersRegistered: number("volunteersRegistered"), volunteersAttended: number("volunteersAttended"), volunteerHours: number("volunteerHours"), totalSpent: number("shopping") + number("food") + number("supplies") + number("other"), notes: String(data.get("notes") || "") };
      state.reports.unshift(saved); state.activity.unshift({ text: `${state.event.title} close-out report was saved.`, time: "Just now" }); saveState(); toast("Close-out report saved to permanent event history."); renderOrganizer("reports");
    });
    const addUser = document.querySelector("[data-add-user]");
    if (addUser) addUser.addEventListener("click", openAddUser);
    document.querySelectorAll("[data-demo-action]").forEach((button) => button.addEventListener("click", () => toast("This control is mapped for the secure production build.")));
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

  function getCheckinTarget(id) {
    if (checkinType === "volunteers") {
      const record = state.volunteers.find((item) => item.id === id);
      return record ? { record, label: record.name, detail: `${record.role} · ${record.shift}`, checked: record.checkedIn } : null;
    }
    const [householdId, childId] = id.split("|");
    const household = state.applications.find((item) => item.id === householdId);
    const record = household && household.children.find((child) => child.id === childId);
    return record ? { record, household, label: record.name, detail: `${household.guardian} household · ${householdId}`, checked: record.attendance === "checked" } : null;
  }

  function openCheckinConfirmation(id) {
    const target = getCheckinTarget(id);
    if (!target) return;
    dialogContent.innerHTML = `<div class="dialog-body confirm-dialog"><p class="eyebrow">Confirm attendance</p><h2 id="dialog-title">${esc(target.label)}</h2><p class="dialog-subtitle">${esc(target.detail)}</p><div class="confirmation-box"><strong>${target.checked ? "Undo this check-in?" : "Is this the correct person?"}</strong><p>This second step helps prevent accidentally recording the wrong person.</p></div><div class="dialog-actions"><button class="button button--light" type="button" data-cancel-confirm>Cancel</button><button class="button button--green" type="button" data-final-checkin>${target.checked ? "Yes, undo check-in" : "Yes, check in"} →</button></div></div>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("[data-cancel-confirm]").addEventListener("click", closeDialog);
    dialogContent.querySelector("[data-final-checkin]").addEventListener("click", () => {
      if (checkinType === "volunteers") { target.record.checkedIn = !target.checked; target.record.checkedAt = target.record.checkedIn ? currentTime() : ""; }
      else { target.record.attendance = target.checked ? "expected" : "checked"; target.record.checkedAt = target.record.attendance === "checked" ? currentTime() : ""; }
      state.activity.unshift({ text: `${target.label} was ${target.checked ? "returned to expected" : "checked in"} by Event Staff.`, time: "Just now" });
      saveState(); closeDialog(); toast(`${target.label} ${target.checked ? "check-in undone" : "checked in"}.`); renderOrganizer("checkin");
    });
  }

  function openCheckinNote(id) {
    const target = getCheckinTarget(id);
    if (!target) return;
    const note = target.record.attendanceNote || target.record.notes || "";
    dialogContent.innerHTML = `<form class="dialog-body" id="checkin-note-form"><p class="eyebrow">Event-day note</p><h2 id="dialog-title">${esc(target.label)}</h2><p class="dialog-subtitle">${esc(target.detail)}</p><div class="field"><label for="attendance-status">Attendance result</label><select id="attendance-status" name="status"><option value="expected">Still expected</option><option value="excused">Excused absence</option><option value="no-show">No-show</option></select></div><div class="field"><label for="attendance-note">Private organizer note</label><textarea id="attendance-note" name="note" rows="5" placeholder="Example: Unable to attend because they were sick.">${esc(note)}</textarea></div><div class="dialog-actions"><button class="button button--green" type="submit">Save note →</button></div></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("#checkin-note-form").addEventListener("submit", (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const status = String(data.get("status"));
      if (checkinType === "volunteers") { target.record.notes = String(data.get("note") || ""); target.record.attendanceStatus = status; }
      else { target.record.attendanceNote = String(data.get("note") || ""); target.record.attendance = status; }
      state.activity.unshift({ text: `An attendance note was added for ${target.label}.`, time: "Just now" }); saveState(); closeDialog(); toast("Attendance note saved."); renderOrganizer("checkin");
    });
  }

  function openEmailDraft(id) {
    const template = state.event.emailTemplates.find((item) => item.id === id);
    if (!template) return;
    dialogContent.innerHTML = `<form class="dialog-body" id="email-draft-form"><p class="eyebrow">Automatic email draft</p><h2 id="dialog-title">${esc(template.title)}</h2><div class="field"><label>Subject<input name="subject" value="${esc(template.subject)}" required></label></div><div class="field"><label>Message<textarea name="body" rows="10" required>${esc(template.body || `Hello {{first_name}},\n\nYour submission for ${state.event.title} was received.\n\nDate: ${state.event.date}\nTime: ${state.event.time}\nLocation: ${state.event.location}\n\nPlease arrive a few minutes early so we can begin on time.`)}</textarea></label></div><p class="field-help">Placeholders such as {{first_name}} will be filled automatically in production.</p><button class="button button--green" type="submit">Save draft →</button></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("#email-draft-form").addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); template.subject = String(data.get("subject")); template.body = String(data.get("body")); saveState(); closeDialog(); toast("Email draft saved."); renderOrganizer("emails"); });
  }

  function openAddUser() {
    dialogContent.innerHTML = `<form class="dialog-body" id="add-user-form"><p class="eyebrow">Workspace access</p><h2 id="dialog-title">Add a user</h2><div class="form-grid"><div class="field"><label>Name<input name="name" required></label></div><div class="field"><label>Email<input name="email" type="email" required></label></div><div class="field field--span-2"><label>Permission level<select name="role"><option>Event Administrator</option><option>Read-Only Coordinator</option><option>Check-In Staff</option><option>Executive Owner</option></select></label></div></div><p class="inline-note">Production invitations will use their Campbell's Crew Google account. No shared password will be emailed.</p><button class="button button--green" type="submit">Add user →</button></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("#add-user-form").addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); state.users.push({ id: `user-${Date.now()}`, name: String(data.get("name")), email: String(data.get("email")), role: String(data.get("role")), status: "Invited" }); saveState(); closeDialog(); toast("User added to the demonstration workspace."); renderOrganizer("settings"); });
  }

  function openApplication(id) {
    const item = state.applications.find((record) => record.id === id);
    if (!item) return;
    dialogContent.innerHTML = `<div class="dialog-body"><p class="eyebrow">Recipient application ${esc(item.id)}</p><h2 id="dialog-title">${esc(item.guardian)}</h2><p class="dialog-subtitle">Submitted ${esc(item.submitted)} · ${statusPill(item.status)}</p>
      ${(item.flags.length || item.updated || (item.previousAttendance || []).length) ? `<div class="dialog-section"><h3>Review history & flags</h3><div class="flag-list">${item.updated ? `<span class="flag flag--blue">Application updated · possible review</span>` : ""}${(item.previousAttendance || []).map((entry) => `<span class="flag ${entry.result === "No-show" ? "flag--danger" : ""}">${esc(entry.event)} · ${esc(entry.result)}</span>`).join("")}${item.flags.map((flag) => `<span class="flag">${esc(flag)}</span>`).join("")}</div><p class="field-help">Flags organize human review. They never automatically reject a family.</p></div>` : ""}
      <div class="dialog-section"><h3>Household</h3><div class="detail-grid"><div class="detail-item"><span>Email</span><strong>${esc(item.email)}</strong></div><div class="detail-item"><span>Phone</span><strong>${esc(item.phone)}</strong></div><div class="detail-item"><span>Address</span><strong>${esc(item.address)}, ${esc(item.city)}, AZ ${esc(item.zip)}</strong></div><div class="detail-item"><span>Referral</span><strong>${esc(item.referral)}</strong></div><div class="detail-item"><span>Emergency contact</span><strong>${esc(item.emergencyName)}</strong></div><div class="detail-item"><span>Emergency phone</span><strong>${esc(item.emergencyPhone)}</strong></div></div></div>
      <div class="dialog-section"><h3>Participating children</h3>${item.children.map((child) => `<div class="child-card"><div class="child-card__heading"><strong>${esc(child.name)} · Age ${esc(child.age)} · ${esc(child.gender)}</strong>${statusPill(child.attendance || "expected")}</div><p>Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodations:</strong> ${esc(child.accommodations)}</p>${child.attendanceNote ? `<p><strong>Attendance note:</strong> ${esc(child.attendanceNote)}</p>` : ""}</div>`).join("")}</div>
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
    item.updated = false;
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
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `campbells-crew-${type}-demo.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  window.addEventListener("afterprint", () => { delete document.body.dataset.printMode; delete document.body.dataset.printChild; document.querySelectorAll(".packet-card").forEach((card) => card.classList.remove("is-print-target")); });

  setUnlocked(SERVER_AUTH || sessionStorage.getItem(SESSION_KEY) === "yes");
})();

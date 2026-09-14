(function () {
  "use strict";

  const TEST_PIN = "2017";
  const SERVER_AUTH = document.documentElement.dataset.serverAuth === "true";
  const SESSION_KEY = "ccc-test-site-unlocked";
  const STATE_KEY = "ccc-signup-prototype-state-v7";
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

  const foodBagRoutineItems = [
    "Peanut butter crackers", "Cheese crackers", "Granola bar", "Meat stick", "Fruit snacks", "Cookies", "Applesauce pouch", "Yogurt pouch", "Hydration packet", "Bottled water", "Chips", "Rice crispy treat", "Fruit leather", "Gummy snack pack", "Juice drink"
  ];

  function makeBagItem(label, index = 0) { return { id: `bag-${Date.now()}-${index}`, label, quantity: 1 }; }
  function routineBagItems() { return foodBagRoutineItems.map((label, index) => makeBagItem(label, index)); }

  const acknowledgments = [
    { id: "arrival", title: "Arrival and check-in", text: "Our family will arrive at the designated Walmart Garden Center meeting location at the assigned time." },
    { id: "shopping", title: "Volunteer-led shopping", text: "Each child shops with an assigned Campbell's Crew Cares volunteer. Responsible Parties remain in the designated waiting area and allow the volunteer to guide the experience." },
    { id: "safety", title: "Safety and accommodations", text: "A Responsible Party may intervene during an emergency or when directed by Campbell's Crew Cares. Share disability, medical, communication, sensory, mobility, or behavioral accommodations in advance so our team can plan respectfully. We will contact you if an accommodation affects how volunteer-led shopping should work." },
    { id: "essentials", title: "Essential items only", text: "Campbell's Crew Cares is a bare-necessities charity. Event funds are for approved clothing, shoes, and personal necessities—not toys or other non-essential merchandise unless the event rules specifically allow them." },
    { id: "review", title: "Application review", text: "Submitting an application does not guarantee acceptance. Campbell's Crew Cares may approve, waitlist, request more information, or decline an application after review." },
    { id: "photos", title: "Required photography release", text: "Photography and video occur throughout this large volunteer-run event. I authorize my participating children to be photographed and authorize Campbell's Crew Cares to use selected images in its charitable communications." },
    { id: "accuracy", title: "Accurate Information and Child-Specific Sizing", text: "I confirm that the contact and family information I provide is accurate and that every clothing size reflects the actual needs of the specific child registered. I will not provide false sizing information to obtain clothing for anyone else." }
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
        { name: "Campbell Faulkner", email: "Campbell@Campbellscrew.com", role: "Executive Owner", status: "Active" },
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

  // Live organizer sessions begin empty and are hydrated from the Worker. They
  // must never inherit a browser's old sample records.
  function createLiveState() {
    return { events: [], activeEventId: "", volunteers: [], applications: [], users: [], reports: [], activity: [], publicStats: { families: 0, children: 0, volunteers: 0, years: 0 } };
  }

  function expandDemoData(target) {
    const extraVolunteers = [
      ["Alyssa Grant","Shopper","Attended"],["Benjamin Ortiz","Cart Checker","Attended"],["Chloe Williams","Checkout Assistant","Attended"],["Derek Johnson","Floater","No-show"],["Emily Nguyen","Shopper","Attended"],["Franklin Reed","Greeter / Sign-In","Attended"],["Grace Kim","Photographer","Attended"],["Henry Davis","Shopper","Excused absence"],["Isabella Torres","Floater","Attended"],["Jack Wilson","Shopper","Attended"],["Keira Thompson","Checkout Assistant","No-show"],["Liam Martinez","Cart Checker","Attended"],["Natalie Scott","Shopper","Attended"]
    ];
    extraVolunteers.forEach((entry,index) => target.volunteers.push({ id:`VOL-${26006+index}`, name:entry[0], email:`${entry[0].toLowerCase().replace(/\s+/g,".")}@example.org`, phone:`480-555-${String(120+index).padStart(4,"0")}`, role:entry[1], shift:entry[1] === "Shopper" ? "6:00 AM – 10:00 AM" : "7:00 AM – 10:00 AM", currentEvent:index < 7 ? target.event.title : "", status:index < 7 ? "confirmed" : "past", checkedIn:false, checkedAt:"", notes:entry[2] === "No-show" ? "Prior no-show; review reliability before assigning a critical role." : "", history:[{event:index % 2 ? "Christmas Shopping 2025" : "Back-to-School 2025",role:entry[1],result:entry[2]}] }));
    const families = [
      ["Priya Shah","Maya","Shah","approved",false],["Robert Green","Ethan","Green","review",false],["Jasmine Carter","Olivia","Carter","info",false],["Miguel Hernandez","Diego","Hernandez","declined",false],["Sarah Collins","Emma","Collins","approved",false],["Tanya Lewis","Mason","Lewis","waitlisted",false],["Andre Walker","Amari","Walker","approved",true],["Nicole Baker","Harper","Baker","approved",true],["Kevin Adams","Logan","Adams","declined",true],["Rachel Young","Ella","Young","approved",true],["Omar Rahman","Samir","Rahman","info",true],["Heather Moore","Caleb","Moore","approved",true]
    ];
    families.forEach((entry,index) => { const [guardian,first,last,decision,archived]=entry; const householdStatus = decision === "review" ? "review" : decision; target.applications.push({ id:`CCC-${26050+index}`, guardian, email:`${guardian.toLowerCase().replace(/\s+/g,".")}@example.org`, phone:`602-555-${String(200+index).padStart(4,"0")}`, address:`${410+index*17} E Sample Ave`, city:index%2?"Mesa":"Phoenix", zip:index%2?"85201":"85004", referral:index%2?"School counselor":"Community partner", emergencyName:`Emergency contact ${index+1}`, emergencyPhone:`602-555-${String(400+index).padStart(4,"0")}`, emergencyRelation:"Relative", submitted:`Aug ${1+index}, 2026`, status:householdStatus, flags:decision === "review" ? ["Address resembles prior record"] : decision === "info" ? ["Supporting information incomplete"] : [], previousAttendance:archived?[{event:"Christmas Shopping 2025",result:decision === "declined" ? "No-show" : "Attended"}]:[], updated:false, archived, eventName:archived ? (index%2?"Christmas Shopping 2025":"Back-to-School 2025") : target.event.title, children:[{id:`CH-${260500+index}`,name:`${first} ${last}`,firstName:first,lastName:last,birthdate:`201${5+index%5}-0${1+index%8}-12`,age:7+index%5,gender:index%2?"Boy":"Girl",shirt:"10/12",pants:"10",shoes:String(3+index%4),underwear:"10/12",coat:"12",preferences:index%2?"Blue, sports, comfortable clothing":"Purple, art, soft fabrics",accommodations:"None",attendance:archived?"attended":"expected",attendanceNote:"",decision}] }); });
  }

  function prepareEventCollection(target) {
    const legacyEvent = target.event;
    if (!Array.isArray(target.events)) target.events = legacyEvent ? [legacyEvent] : [];
    target.events.forEach((event, index) => {
      if (!event.id) event.id = `event-${index + 1}`;
      if (event.volunteerEnabled === undefined) event.volunteerEnabled = true;
      if (event.recipientEnabled === undefined) event.recipientEnabled = true;
      if (!event.type) event.type = "shopping";
      if (!Number.isFinite(event.bagGoal)) event.bagGoal = 100;
      if (!Array.isArray(event.bagItems)) event.bagItems = routineBagItems();
    });
    if (!target.activeEventId || !target.events.some((event) => event.id === target.activeEventId)) target.activeEventId = target.events.find((event) => !event.closed)?.id || target.events[0]?.id || "";
    delete target.event;
    Object.defineProperty(target, "event", { configurable: true, enumerable: false, get() { return target.events.find((event) => event.id === target.activeEventId) || target.events[0]; }, set(value) { const index = target.events.findIndex((event) => event.id === target.activeEventId); if (index >= 0) target.events[index] = value; else target.events.push(value); target.activeEventId = value.id; } });
    return target;
  }

  function activeEvents() { return state.events.filter((event) => !event.closed); }
  function activeEventOptions() { return activeEvents().map((event) => `<option value="${esc(event.id)}" ${event.id === state.activeEventId ? "selected" : ""}>${esc(event.title)}</option>`).join(""); }

  let state = prepareEventCollection(SERVER_AUTH ? createLiveState() : loadState());
  if (!SERVER_AUTH) {
    if (state.volunteers.length < 15 || state.applications.length < 15) expandDemoData(state);
    state.volunteers.forEach((volunteer,index) => { if (volunteer.currentEvent === undefined) volunteer.currentEvent = index < 5 ? state.event.title : ""; });
    state.applications.forEach((household) => household.children.forEach((child) => { if (!child.decision) child.decision = household.status === "approved" ? "approved" : household.status === "info" ? "info" : "review"; }));
    state.applications.forEach((household) => { if (household.archived === undefined) household.archived = false; if (!household.eventName) household.eventName = state.event.title; household.children.forEach((child) => { const parts=String(child.name||"").trim().split(/\s+/); if(!child.firstName) child.firstName=parts[0]||""; if(!child.lastName) child.lastName=parts.slice(1).join(" ") || household.guardian.trim().split(/\s+/).slice(-1)[0]; child.name=`${child.firstName} ${child.lastName}`.trim(); }); });
  }
  let selectedVolunteerRole = "shopper";
  let volunteerStep = 0;
  let volunteerConfirmation = null;
  let recipientStep = 0;
  let recipientMaxStep = 0;
  let recipientConfirmation = null;
  let recipientDraft = createRecipientDraft();
  let checkinType = "recipients";
  let applicationSort = "submitted-newest";
  let volunteerSort = "name-az";
  let checkinSort = "name-az";
  let packetSort = "child-az";
  let volunteerView = "all";
  let applicationView = "current";
  let publicVolunteerEventId = sessionStorage.getItem("ccc-public-volunteer-event") || "";
  let publicRecipientEventId = sessionStorage.getItem("ccc-public-recipient-event") || "";
  // The live organizer route has already been authenticated by the Worker.
  // It must never fall through to the old in-browser demonstration login.
  let portalUser = SERVER_AUTH ? "Executive Owner" : (sessionStorage.getItem("ccc-portal-user") || "");
  let previewRole = sessionStorage.getItem("ccc-preview-role") || "";

  function createRecipientDraft() {
    return {
      acknowledgments: {}, agreementSignature: "", finalSignature: "", guardian: "", email: "", phone: "", address: "", city: "", zip: "", referral: "", preferredContact: "Email", notes: "",
      children: [{ name: "", firstName: "", lastName: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", socks: "", underwear: "", coat: "", preferences: "", accommodations: "" }],
      emergencyName: "", emergencyPhone: "", emergencyRelation: "", recipientCode: "", documents: []
    };
  }

  function saveState() {
    if (!SERVER_AUTH) localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function databaseStatus(event) {
    if (event.closed) return "closed";
    return event.volunteerStatus === "open" || event.recipientStatus === "open" ? "open" : "draft";
  }

  async function saveLiveEvent(event) {
    if (!SERVER_AUTH || !event?.id) return;
    const response = await fetch(`/portal-api/events/${encodeURIComponent(event.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: event.title, eventDate: event.date || null, status: databaseStatus(event), settings: event }) });
    if (!response.ok) throw new Error("The event could not be saved.");
  }

  async function loadLiveEvents() {
    if (!SERVER_AUTH) return;
    const response = await fetch("/portal-api/events", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("The live event records could not be loaded.");
    const payload = await response.json();
    const events = (payload.events || []).map((record) => {
      const settings = record.settings && typeof record.settings === "object" ? record.settings : {};
      return { ...settings, id: record.id, title: record.title, date: record.event_date || settings.date || "", type: record.event_type === "food_bag" ? "food-bag" : "shopping", closed: record.status === "closed", volunteerStatus: settings.volunteerStatus || (record.status === "open" ? "open" : "closed"), recipientStatus: settings.recipientStatus || "closed", roles: Array.isArray(settings.roles) ? settings.roles : [], questions: settings.questions || {}, budgetItems: Array.isArray(settings.budgetItems) ? settings.budgetItems : [], bagItems: Array.isArray(settings.bagItems) ? settings.bagItems : [], activity: undefined };
    });
    state = prepareEventCollection({ ...createLiveState(), events, activeEventId: events.find((event) => !event.closed)?.id || events[0]?.id || "" });
  }

  async function loadLiveVolunteers() {
    if (!SERVER_AUTH) return;
    const response = await fetch("/portal-api/organizer/volunteers", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("The live volunteer records could not be loaded.");
    const payload = await response.json();
    state.volunteers = (payload.volunteers || []).map((record) => ({
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      role: record.role,
      currentEvent: record.event_title || "",
      eventId: record.event_id,
      status: record.status || "confirmed",
      notes: record.notes || "",
      checkedIn: record.status === "checked_in",
      checkedAt: "",
      history: []
    }));
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
    const labels = { open: "Open", code: "Access code", closed: "Closed", submitted: "Submitted", review: "Under review", approved: "Approved", info: "Needs information", waitlisted: "Waitlisted", declined: "Declined", mixed: "Mixed decisions", checked: "Checked in" };
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
    clearPrintState();
    const [route, subroute = "dashboard"] = routeParts();
    updateNav(route);
    if (route === "volunteer") renderVolunteer();
    else if (route === "recipient") renderRecipient();
    else if (route === "organizer") renderOrganizer(subroute);
    else renderHome();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateOrganizer(subroute) {
    const target = `#organizer/${subroute}`;
    if (window.location.hash === target) renderOrganizer(subroute);
    else window.location.hash = target;
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

  function renderPublicEventChooser(kind, events) {
    const title = kind === "volunteer" ? "Choose a volunteer opportunity" : "Choose an event to apply for";
    main.innerHTML = `<div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><section class="content-card"><p class="eyebrow">Campbell's Crew Cares</p><h1>${title}</h1><p>More than one event is accepting signups right now. Pick the one that fits you.</p><div class="event-choice-list">${events.map((event) => `<button type="button" class="event-choice" data-public-event="${esc(event.id)}"><span><strong>${esc(event.title)}</strong><small>${esc(event.date)} · ${esc(event.time)}</small><small>${esc(event.location)}</small></span><b>Choose →</b></button>`).join("")}</div></section></div>`;
    main.querySelectorAll("[data-public-event]").forEach((button) => button.addEventListener("click", () => {
      state.activeEventId = button.dataset.publicEvent;
      if (kind === "volunteer") { publicVolunteerEventId = button.dataset.publicEvent; sessionStorage.setItem("ccc-public-volunteer-event", publicVolunteerEventId); }
      else { publicRecipientEventId = button.dataset.publicEvent; sessionStorage.setItem("ccc-public-recipient-event", publicRecipientEventId); }
      saveState(); volunteerStep = 0; recipientStep = 0; recipientMaxStep = 0; kind === "volunteer" ? renderVolunteer() : renderRecipient();
    }));
  }

  function renderVolunteer() {
    if (volunteerConfirmation) {
      main.innerHTML = `<div class="page-content"><div class="confirmation"><div class="confirmation-mark">✓</div><p class="eyebrow">You're on the list</p><h1>Thank you, ${esc(volunteerConfirmation.name)}.</h1><p>We've saved your demonstration registration for <strong>${esc(volunteerConfirmation.role)}</strong>. In the finished system, a confirmation and instruction sheet would be emailed immediately.</p><div class="confirmation-number"><span>Volunteer confirmation</span><strong>${esc(volunteerConfirmation.id)}</strong></div><button class="button button--green" type="button" id="another-volunteer">Register another volunteer <span>→</span></button></div></div>`;
      document.querySelector("#another-volunteer").addEventListener("click", () => { volunteerConfirmation = null; renderVolunteer(); });
      return;
    }

    const volunteerEvents = activeEvents().filter((event) => event.volunteerEnabled && event.volunteerStatus !== "closed");
    const selectedEvent = volunteerEvents.find((event) => event.id === publicVolunteerEventId) || (volunteerEvents.length === 1 ? volunteerEvents[0] : null);
    if (volunteerEvents.length > 1 && !selectedEvent) { renderPublicEventChooser("volunteer", volunteerEvents); return; }
    if (!selectedEvent) { main.innerHTML = `<div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="content-card"><h1>Volunteer registration is currently closed.</h1><p>Please check back when Campbell's Crew opens another opportunity.</p></div></div>`; return; }
    state.activeEventId = selectedEvent.id;
    const event = selectedEvent;
    if (!event.volunteerEnabled) { main.innerHTML = `<div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="content-card"><h1>Volunteer signups are not part of this event.</h1><p>Please return to see other Campbell's Crew opportunities.</p></div></div>`; return; }
    const roles = event.roles.filter((role) => role.enabled);
    const role = roles.find((item) => item.id === selectedVolunteerRole) || roles[0];
    if (role) selectedVolunteerRole = role.id;
    const isClosed = event.volunteerStatus === "closed";
    const roleMarkup = roles.map((item) => {
      const registered = state.volunteers.filter((volunteer) => volunteer.currentEvent === event.title && volunteer.role === item.title).length;
      return `<button class="compact-role" type="button" data-role="${esc(item.id)}" aria-pressed="${selectedVolunteerRole === item.id}"><span class="compact-role__radio"></span><span><strong>${esc(item.title)}</strong><b>${esc(item.shift)} · ${Math.max(0, item.capacity - registered)} spots</b><small>${esc(item.description)}</small></span></button>`;
    }).join("");
    main.innerHTML = `<div class="volunteer-simple"><a class="back-link" href="#home">← Back to signup home</a>
      ${(volunteerStep === 0 || isClosed) ? `<section class="volunteer-event-card"><div class="volunteer-event-card__top"><span><i></i> Registration ${isClosed ? "closed" : "open"}</span><b>${Math.max(0, event.volunteerCapacity - state.volunteers.filter((volunteer) => volunteer.currentEvent === event.title).length)} spots left</b></div><div class="volunteer-event-card__body"><div class="volunteer-date"><small>DEC</small><strong>05</strong></div><div><p class="eyebrow">Featured event</p><h1>${esc(event.title)}</h1><p><strong>${esc(event.date)} · ${esc(event.time)}</strong></p><p>${esc(event.location)}</p>
      ${isClosed ? `<div class="closed-message"><strong>Volunteer registration is closed.</strong><span>Please check back for another opportunity.</span></div>` : `<div class="volunteer-card-actions"><button class="button button--dark" type="button" data-vol-step="1">Choose a role →</button><button class="button button--text" type="button" data-event-details>Event details</button></div>`}</div></div></section>` : ""}
      ${!isClosed && volunteerStep === 1 ? `<section class="volunteer-focus-card"><div class="focus-card-head"><p class="eyebrow">Step 1 of 2</p><button type="button" class="dialog-close-inline" data-vol-step="0" aria-label="Close">×</button></div><h2>How would you<br>like to help?</h2><div class="compact-role-list">${roleMarkup}</div><button class="button button--dark button--wide" type="button" data-vol-step="2">Continue with ${esc(role?.title || "selected role")} →</button></section>` : ""}
      ${!isClosed && volunteerStep === 2 ? `<section class="volunteer-focus-card"><div class="focus-card-head"><p class="eyebrow">Step 2 of 2</p><button type="button" class="dialog-close-inline" data-vol-step="1" aria-label="Back">←</button></div><h2>A few details,<br>and you're in.</h2><div class="selected-role"><span>Selected role</span><strong>${esc(role?.title || "Volunteer")}</strong><small>${esc(role?.shift || event.time)}</small></div><form id="volunteer-form"><div class="form-grid"><div class="field"><label for="vol-first">First name</label><input id="vol-first" name="firstName" autocomplete="given-name" required></div><div class="field"><label for="vol-last">Last name</label><input id="vol-last" name="lastName" autocomplete="family-name" required></div><div class="field field--span-2"><label for="vol-email">Email address</label><input id="vol-email" name="email" type="email" autocomplete="email" required></div><div class="field field--span-2"><label for="vol-phone">Mobile phone</label><input id="vol-phone" name="phone" type="tel" autocomplete="tel" required></div>${event.questions.shirtSize ? `<div class="field"><label for="vol-shirt">T-shirt size</label><select id="vol-shirt" name="shirt"><option value="">Choose size</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></div>` : ""}${event.questions.volunteerNotes ? `<div class="field field--span-2"><label for="vol-notes">Special notes <span>(optional)</span></label><textarea id="vol-notes" name="notes" placeholder="Anything organizers should know?"></textarea></div>` : ""}${event.volunteerStatus === "code" ? `<div class="field field--span-2"><label for="vol-code">Invitation code</label><input id="vol-code" name="volunteerCode" required></div>` : ""}</div><input type="hidden" name="role" value="${esc(selectedVolunteerRole)}"><input type="hidden" name="shift" value="${esc(role?.shift || event.time)}"><label class="checkbox-row"><input type="checkbox" name="agreement" required><span>I agree to follow Campbell's Crew event and child-safety instructions.</span></label><button class="button button--dark button--wide" type="submit">Complete signup →</button></form></section>` : ""}</div>`;

    main.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => { selectedVolunteerRole = button.dataset.role; renderVolunteer(); }));
    main.querySelectorAll("[data-vol-step]").forEach((button) => button.addEventListener("click", () => { volunteerStep = Number(button.dataset.volStep); renderVolunteer(); }));
    const details = main.querySelector("[data-event-details]");
    if (details) details.addEventListener("click", openEventDetails);
    const form = document.querySelector("#volunteer-form");
    if (form) form.addEventListener("submit", submitVolunteer);
  }

  function openEventDetails() {
    dialogContent.innerHTML = `<div class="dialog-body"><p class="eyebrow">Event details</p><h2 id="dialog-title">${esc(state.event.title)}</h2><div class="detail-grid"><div class="detail-item"><span>Date</span><strong>${esc(state.event.date)}</strong></div><div class="detail-item"><span>Time</span><strong>${esc(state.event.time)}</strong></div><div class="detail-item"><span>Location</span><strong>${esc(state.event.location)}</strong></div><div class="detail-item"><span>Address</span><strong>${esc(state.event.address)}</strong></div></div><button class="button button--green" type="button" data-close-dialog-inner>Continue to signup →</button></div>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("[data-close-dialog-inner]").addEventListener("click", () => { closeDialog(); volunteerStep = 1; renderVolunteer(); });
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
      id: makeId("VOL", state.volunteers), name: `${data.get("firstName")} ${data.get("lastName")}`.trim(), email: data.get("email"), phone: data.get("phone"), role: role ? role.title : "Volunteer", shift: data.get("shift"), currentEvent: state.event.title, shirt: data.get("shirt") || "", notes: data.get("notes") || "", history: [], status: "confirmed", checkedIn: false, checkedAt: ""
    };
    state.volunteers.push(record);
    state.activity.unshift({ text: `${record.name} registered as ${record.role}.`, time: "Just now" });
    saveState();
    volunteerConfirmation = record;
    renderVolunteer();
  }

  function recipientStepsHtml() {
    const labels = ["Before you apply", "Household", "Children", "Emergency & files", "Review"];
    return `<aside class="application-steps" aria-label="Application progress">${labels.map((label, index) => `<button type="button" data-recipient-step="${index}" ${index > recipientMaxStep ? "disabled" : ""} class="application-step ${recipientStep === index ? "is-current" : ""} ${recipientMaxStep > index ? "is-complete" : ""}"><span>${recipientMaxStep > index ? "✓" : index + 1}</span>${esc(label)}</button>`).join("")}</aside>`;
  }

  function renderRecipient() {
    if (recipientConfirmation) {
      main.innerHTML = `<div class="page-content"><div class="confirmation"><div class="confirmation-mark">✓</div><p class="eyebrow">Application received</p><h1>Thank you, ${esc(recipientConfirmation.guardian)}.</h1><p>Your demonstration application has been added to the organizer review queue. Submission does not guarantee acceptance; Campbell's Crew will contact you after review.</p><div class="confirmation-number"><span>Application number</span><strong>${esc(recipientConfirmation.id)}</strong></div>${recipientConfirmation.flags.length ? `<div class="inline-note"><strong>Prototype note:</strong> The duplicate-checking demonstration added ${recipientConfirmation.flags.length} review flag${recipientConfirmation.flags.length === 1 ? "" : "s"}. Flags require human review and do not automatically reject an application.</div>` : ""}<button class="button button--green" type="button" id="new-application">Start another test application <span>→</span></button></div></div>`;
      document.querySelector("#new-application").addEventListener("click", () => { recipientDraft = createRecipientDraft(); recipientStep = 0; recipientMaxStep = 0; recipientConfirmation = null; renderRecipient(); });
      return;
    }

    const recipientEvents = activeEvents().filter((event) => event.recipientEnabled && event.recipientStatus !== "closed");
    const selectedEvent = recipientEvents.find((event) => event.id === publicRecipientEventId) || (recipientEvents.length === 1 ? recipientEvents[0] : null);
    if (recipientEvents.length > 1 && !selectedEvent) { renderPublicEventChooser("recipient", recipientEvents); return; }
    if (!selectedEvent) {
      main.innerHTML = `<section class="page-hero page-hero--ink"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Recipient application</p><h1>Applications are <span>closed.</span></h1></div><p>Campbell's Crew will reopen applications when a qualifying event is ready.</p></div></section><div class="page-content"><a class="back-link" href="#home">← Back to signup home</a></div>`;
      return;
    }
    state.activeEventId = selectedEvent.id;
    if (!selectedEvent.recipientEnabled) {
      main.innerHTML = `<div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="content-card"><h1>Recipient applications are not part of this event.</h1><p>This event is volunteer-only. Please return to see available assistance opportunities.</p></div></div>`;
      return;
    }
    if (selectedEvent.recipientStatus === "closed") {
      main.innerHTML = `<section class="page-hero page-hero--ink"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Recipient application</p><h1>Applications are <span>closed.</span></h1></div><p>Campbell's Crew can reopen this event from the organizer workspace when it is ready to accept applications.</p></div></section><div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="content-card"><h2>${esc(state.event.title)}</h2><p>New recipient applications are not being accepted right now.</p></div></div>`;
      return;
    }

    main.innerHTML = `
      <section class="page-hero page-hero--ink"><div class="page-hero__grid"><div><p class="eyebrow eyebrow--light">Recipient application</p><h1>Before you <span>apply.</span></h1></div><p>This guided application explains how the event works, collects each child's essential sizes and preferences, and gives Campbell's Crew what it needs for a careful review.</p></div></section>
      <div class="page-content"><a class="back-link" href="#home">← Back to signup home</a><div class="application-layout">${recipientStepsHtml()}<section class="application-panel" id="recipient-panel"></section></div></div>`;
    const panel = document.querySelector("#recipient-panel");
    document.querySelectorAll("[data-recipient-step]").forEach((button) => button.addEventListener("click", () => { if (!button.disabled) { recipientStep = Number(button.dataset.recipientStep); renderRecipient(); } }));
    if (recipientStep === 0) renderOrientation(panel);
    else if (recipientStep === 1) renderHousehold(panel);
    else if (recipientStep === 2) renderChildren(panel);
    else if (recipientStep === 3) renderEmergency(panel);
    else renderReview(panel);
  }

  function renderOrientation(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 1 of 5</p><h2>How the event works.</h2><p>Please review each section carefully and check every item. One signature at the bottom confirms all agreements.</p>
      <div class="video-card"><img src="../assets/images/campbell-story-video-thumbnail.jpg" alt="Campbell speaking in a video"><div class="video-card__content"><strong>Event orientation video</strong><span>Video placeholder · Written instructions are provided below</span></div></div>
      <div class="inline-note"><strong>Why both video and text?</strong> The eventual video will have captions and a transcript. The written explanation will always remain available.</div>
      <form id="orientation-form"><div class="ack-list">${acknowledgments.map((item) => { const saved = recipientDraft.acknowledgments[item.id] || {}; return `<label class="ack-item"><input type="checkbox" name="ack-${item.id}" ${saved.checked ? "checked" : ""} required><p><strong>${esc(item.title)}.</strong> ${esc(item.text)}</p></label>`; }).join("")}</div><div class="signature-block field"><label for="agreement-signature">Responsible Party full name / electronic signature</label><input id="agreement-signature" name="agreementSignature" value="${esc(recipientDraft.agreementSignature)}" autocomplete="name" required><small>Typing your full name confirms all checked agreements above.</small></div><div class="form-actions"><a class="button button--ghost" href="#home">Cancel</a><button class="button button--green" type="submit">Continue to household <span>→</span></button></div></form>`;
    document.querySelector("#orientation-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      acknowledgments.forEach((item) => { recipientDraft.acknowledgments[item.id] = { checked: data.get(`ack-${item.id}`) === "on" }; });
      recipientDraft.agreementSignature = String(data.get("agreementSignature") || "").trim();
      recipientStep = 1; recipientMaxStep = Math.max(recipientMaxStep, 1);
      renderRecipient();
    });
  }

  function renderHousehold(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 2 of 5</p><h2>Household information.</h2><p>Tell us how to contact the Responsible Party completing this application.</p>
      <form id="household-form"><div class="form-grid">
        <div class="field field--span-2"><label for="guardian">Responsible Party's full name</label><input id="guardian" name="guardian" autocomplete="name" value="${esc(recipientDraft.guardian)}" required></div>
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
      recipientStep = 2; recipientMaxStep = Math.max(recipientMaxStep, 2);
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
      recipientDraft.children.push({ name: "", firstName: "", lastName: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", socks: "", underwear: "", coat: "", preferences: "", accommodations: "" });
      renderRecipient();
    });
    document.querySelectorAll("[data-remove-child]").forEach((button) => button.addEventListener("click", () => {
      syncChildren();
      recipientDraft.children.splice(Number(button.dataset.removeChild), 1);
      if (!recipientDraft.children.length) recipientDraft.children.push({ name: "", firstName: "", lastName: "", birthdate: "", gender: "", shirt: "", pants: "", shoes: "", socks: "", underwear: "", coat: "", preferences: "", accommodations: "" });
      renderRecipient();
    }));
    document.querySelector("[data-recipient-back]").addEventListener("click", () => { syncChildren(); recipientStep = 1; renderRecipient(); });
    document.querySelector("#children-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      syncChildren();
      recipientStep = 3; recipientMaxStep = Math.max(recipientMaxStep, 3);
      renderRecipient();
    });
  }

  function childFormHtml(child, index) {
    return `<section class="child-card"><div class="child-card__header"><h3>Child ${index + 1}</h3>${recipientDraft.children.length > 1 ? `<button class="link-button" type="button" data-remove-child="${index}">Remove</button>` : ""}</div><div class="form-grid">
      <div class="field"><label for="child-${index}-firstName">Child's first name</label><input id="child-${index}-firstName" name="child-${index}-firstName" value="${esc(child.firstName || "")}" required></div><div class="field"><label for="child-${index}-lastName">Child's last name</label><input id="child-${index}-lastName" name="child-${index}-lastName" value="${esc(child.lastName || "")}" required></div>
      <div class="field"><label for="child-${index}-birthdate">Date of birth</label><input id="child-${index}-birthdate" name="child-${index}-birthdate" type="date" value="${esc(child.birthdate)}" required></div>
      <div class="field"><label for="child-${index}-gender">Sizing category</label><select id="child-${index}-gender" name="child-${index}-gender" required><option value="">Choose one</option>${["Infant / Baby","Toddler","Girls","Boys","Women","Men","Other / manual sizing"].map((value)=>`<option ${child.gender === value ? "selected" : ""}>${value}</option>`).join("")}</select><small>This helps the organizers understand the child’s typical sizing.</small></div>
      <div class="field field--span-2 size-guidance"><strong>Clothing sizes</strong><small>Spell out letter sizes—for example: <b>Small</b>, <b>Medium</b>, or <b>Large</b>. You can also be more specific for pants if you know the size, such as <b>30/32</b>. For socks and shoes, please use numbers. If you are unsure, you can always go a little bigger so we can make sure the clothes will fit.</small></div>
      ${sizeField(index,"shirt","Shirt",child.shirt)}${sizeField(index,"pants","Pants",child.pants)}${sizeField(index,"shoes","Shoes",child.shoes)}${sizeField(index,"socks","Socks",child.socks)}${sizeField(index,"underwear","Underwear",child.underwear)}${sizeField(index,"coat","Coat",child.coat)}
      <div class="field field--span-2"><label for="child-${index}-photo">Recent photo of this child</label><input id="child-${index}-photo" name="child-${index}-photo" type="file" accept="image/jpeg,image/png"><small>We kindly ask you to share a photo of the child so we can pre-make a badge for them to wear on the day of the event. The badge will also be attached to their clothing bag at the end of the event to help ensure it stays with them. Thank you! JPG or PNG only. ${child.photoName ? `Selected: ${esc(child.photoName)}` : ""}</small></div>
      <div class="field field--span-2"><label for="child-${index}-preferences">Colors, styles, interests, likes, or dislikes</label><textarea id="child-${index}-preferences" name="child-${index}-preferences" required>${esc(child.preferences)}</textarea></div>
      <div class="field field--span-2"><label for="child-${index}-accommodations">Medical, sensory, communication, mobility, or behavioral accommodations</label><textarea id="child-${index}-accommodations" name="child-${index}-accommodations" required>${esc(child.accommodations)}</textarea><small>Enter “None” if no accommodation is needed.</small></div>
    </div></section>`;
  }

  function sizeField(index, key, label, value) {
    const inputId = `child-${index}-${key}`;
    return `<div class="field size-field"><label for="${inputId}">${label} size</label><input id="${inputId}" name="${inputId}" value="${esc(value || "")}" placeholder="Enter size" required></div>`;
  }

  function syncChildren() {
    const form = document.querySelector("#children-form");
    if (!form) return;
    const data = new FormData(form);
    recipientDraft.children = recipientDraft.children.map((child, index) => {
      const next = {};
      ["firstName", "lastName", "birthdate", "gender", "preferences", "accommodations", "shirt", "pants", "shoes", "socks", "underwear", "coat"].forEach((key) => { next[key] = String(data.get(`child-${index}-${key}`) || child[key] || "").trim(); }); const photo = form.querySelector(`[name="child-${index}-photo"]`); next.photoName = photo && photo.files[0] ? photo.files[0].name : (child.photoName || ""); next.name = `${next.firstName} ${next.lastName}`.trim();
      return next;
    });
  }

  function renderEmergency(panel) {
    const codeRequired = state.event.recipientStatus === "code";
    panel.innerHTML = `
      <p class="eyebrow">Step 4 of 5</p><h2>Emergency contact.</h2><p>We only need a name and phone number so authorized event staff can quickly reach someone if the Responsible Party cannot be reached during an emergency.</p>
      <form id="emergency-form"><div class="form-grid">
        <div class="field"><label for="emergency-name">Emergency contact name</label><input id="emergency-name" name="emergencyName" value="${esc(recipientDraft.emergencyName)}" required></div>
        <div class="field"><label for="emergency-phone">Emergency contact phone</label><input id="emergency-phone" name="emergencyPhone" type="tel" value="${esc(recipientDraft.emergencyPhone)}" required></div>
        ${codeRequired ? `<div class="field"><label for="recipient-code">Invitation code</label><input id="recipient-code" name="recipientCode" value="${esc(recipientDraft.recipientCode)}" required><small>Prototype testing code: HOPE26</small></div>` : ""}
      </div><div id="code-error" class="validation-summary" hidden>The invitation code does not match this event.</div><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Review application <span>→</span></button></div></form>`;
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
      recipientStep = 4; recipientMaxStep = Math.max(recipientMaxStep, 4);
      renderRecipient();
    });
  }

  function saveEmergency(data) {
    ["emergencyName", "emergencyPhone", "recipientCode"].forEach((key) => { recipientDraft[key] = String(data.get(key) || recipientDraft[key] || "").trim(); });
  }

  function renderReview(panel) {
    panel.innerHTML = `
      <p class="eyebrow">Step 5 of 5</p><h2>Review and sign.</h2><p>Confirm the key information below. You can return to any previous section if something needs to change.</p>
      <div class="review-list">
        <div class="review-row"><span>Responsible Party</span><strong>${esc(recipientDraft.guardian)}</strong></div>
        <div class="review-row"><span>Contact</span><strong>${esc(recipientDraft.email)} · ${esc(recipientDraft.phone)}</strong></div>
        <div class="review-row"><span>Address</span><strong>${esc(recipientDraft.address)}, ${esc(recipientDraft.city)}, AZ ${esc(recipientDraft.zip)}</strong></div>
        <div class="review-row"><span>Referral</span><strong>${esc(recipientDraft.referral)}</strong></div>
        <div class="review-row"><span>Children</span><strong>${recipientDraft.children.map((child) => esc(child.name)).join(", ")}</strong></div>
        <div class="review-row"><span>Emergency contact</span><strong>${esc(recipientDraft.emergencyName)} · ${esc(recipientDraft.emergencyPhone)}</strong></div>
      </div>
      <form id="signature-form"><div class="signature-box"><div class="field signature-confirmation"><label for="final-signature">Type your full name again to sign this application</label><input id="final-signature" class="virtual-signature" name="finalSignature" value="${esc(recipientDraft.finalSignature)}" autocomplete="name" placeholder="Your full name" required><small>Your typed signature must match the Responsible Party name above.</small></div><label class="checkbox-row"><input type="checkbox" name="authority" required><span>I am the Responsible Party, or I have authority to submit this application for the participating children.</span></label><label class="checkbox-row"><input type="checkbox" name="accuracy" required><span>I certify that this application is complete and accurate and confirm the agreements I checked and signed at the beginning.</span></label></div><div class="form-actions"><button class="button button--ghost" type="button" data-recipient-back>← Previous</button><button class="button button--green" type="submit">Submit application <span>→</span></button></div></form>`;
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
    recipientDraft.finalSignature = String(new FormData(form).get("finalSignature") || "").trim();
    if (normalize(recipientDraft.agreementSignature) !== normalize(recipientDraft.guardian)) {
      toast("The agreement signature must match the Responsible Party name.");
      return;
    }
    if (normalize(recipientDraft.finalSignature) !== normalize(recipientDraft.guardian)) {
      toast("Please type the Responsible Party’s full name again to sign the application.");
      return;
    }
    const flags = findApplicationFlags(recipientDraft);
    const record = {
      id: makeId("CCC", state.applications), guardian: recipientDraft.guardian, email: recipientDraft.email, phone: recipientDraft.phone, address: recipientDraft.address, city: recipientDraft.city, zip: recipientDraft.zip, referral: recipientDraft.referral, emergencyName: recipientDraft.emergencyName, emergencyPhone: recipientDraft.emergencyPhone, emergencyRelation: recipientDraft.emergencyRelation, signedBy: recipientDraft.finalSignature, submitted: "Just now", status: flags.length ? "review" : "submitted", flags, checkedIn: false, archived: false, eventName: state.event.title,
      children: recipientDraft.children.map((child, index) => ({ ...child, id: `child-${Date.now()}-${index}`, decision: "review", attendance: "expected", attendanceNote: "", age: child.birthdate ? Math.max(0, new Date().getFullYear() - Number(child.birthdate.slice(0, 4))) : "" }))
    };
    state.applications.unshift(record);
    state.activity.unshift({ text: `${record.guardian} submitted recipient application ${record.id}.`, time: "Just now" });
    saveState();
    recipientConfirmation = record;
    renderRecipient();
  }

  function organizerShell(subroute, content) {
    const role = previewRole || portalUser;
    const reviewCount = state.applications.filter((item) => !item.archived && ["submitted", "review", "info"].includes(item.status)).length;
    const preview = previewRole ? `<div class="role-preview-banner"><strong>Previewing as ${esc(role)}</strong><span>You are seeing exactly what this role can access.</span><button type="button" data-return-owner>Return to Executive Owner</button></div>` : "";
    const routes = roleRoutes(role);
    const eventLinks = [["dashboard", "Overview"], ["events", "Event Management"], ["volunteer-signups", "Volunteer Signups"], ["applications", "Current Applications", reviewCount], ["checkin", "Check-in"], ["packets", "Print Packets"], ["badges", "Print Badges"], ["emails", "Email Center"]];
    const recordLinks = [["volunteers", "Volunteer Directory"], ["recipient-history", "Past Recipients"], ["reports", "Reports & History"]];
    const linksFor = (items) => items.filter(([route]) => routes.includes(route)).map(([route, label, count]) => organizerLink(route, label, subroute, count)).join("");
    const eventMenu = linksFor(eventLinks);
    const recordMenu = linksFor(recordLinks);
    const managementMenu = routes.includes("settings") ? organizerLink("settings", "Settings & Users", subroute) : "";
    return `${preview}<div class="organizer-shell ${role === "Read-Only Coordinator" ? "is-read-only" : ""}"><aside class="organizer-sidebar"><div class="organizer-sidebar__title"><span>Private workspace</span><strong>Organizer tools</strong></div><nav class="organizer-menu" aria-label="Organizer sections">
      ${eventMenu ? `<div class="organizer-menu__group"><span>Event operations</span>${eventMenu}</div>` : ""}
      ${recordMenu ? `<div class="organizer-menu__group"><span>Records & logs</span>${recordMenu}</div>` : ""}
      ${managementMenu ? `<div class="organizer-menu__group"><span>Management</span>${managementMenu}</div>` : ""}
      </nav><p class="organizer-sidebar__footer">Signed in as ${esc(role)} · <button type="button" data-portal-logout>Sign out</button></p></aside><section class="organizer-main">${content}</section></div>`;
  }

  function roleRoutes(role) {
    const all = ["dashboard", "events", "volunteer-signups", "applications", "checkin", "packets", "badges", "emails", "volunteers", "recipient-history", "reports", "settings"];
    let routes = role === "Executive Owner" ? all : role === "Event Administrator" ? all.filter((route) => route !== "settings") : role === "Read-Only Coordinator" ? ["dashboard", "events", "volunteer-signups", "applications", "volunteers", "recipient-history", "reports"] : role === "Check-In Staff" ? ["checkin"] : [];
    if (state.event?.type === "food-bag") routes = routes.filter((route) => !["applications", "recipient-history", "packets"].includes(route));
    return routes;
  }

  function organizerLink(route, label, current, count) {
    return `<a href="#organizer/${route}" ${route === current ? `aria-current="page"` : ""}>${esc(label)}${count ? `<em>${count}</em>` : ""}</a>`;
  }

  function renderOrganizer(subroute) {
    if (!portalUser) { renderOrganizerLogin(); return; }
    const role = previewRole || portalUser;
    const allowed = roleRoutes(role).includes(subroute);
    if (!allowed) {
      main.innerHTML = organizerShell(subroute, `<section class="locked-panel"><span>🔒</span><p class="eyebrow">Restricted for ${esc(role)}</p><h1>This area is not part of your access.</h1><p>Your workspace navigation only shows the tools assigned to your role.</p></section>`); bindOrganizer(subroute); return;
    }
    let content;
    if (subroute === "events") content = organizerEventsV8();
    else if (subroute === "volunteer-signups") { volunteerView = "current"; content = organizerVolunteersV8(); }
    else if (subroute === "volunteers") { volunteerView = "all"; content = organizerVolunteersV8(); }
    else if (subroute === "recipient-history") { applicationView = "log"; content = organizerApplicationsV8(); }
    else if (subroute === "applications") { applicationView = "current"; content = organizerApplicationsV8(); }
    else if (subroute === "checkin") content = organizerCheckin();
    else if (subroute === "packets") content = organizerPacketsV5();
    else if (subroute === "badges") content = organizerBadgesV9();
    else if (subroute === "emails") content = organizerEmailsV8();
    else if (subroute === "reports") content = organizerReportsV8();
    else if (subroute === "settings") content = organizerSettingsV5();
    else content = organizerDashboardV8();
    main.innerHTML = organizerShell(subroute, content);
    bindOrganizer(subroute);
  }

  function renderOrganizerLogin() {
    if (SERVER_AUTH) {
      portalUser = "Executive Owner";
      renderOrganizer("dashboard");
      return;
    }
    main.innerHTML = `<section class="portal-login"><div class="portal-login__intro"><p class="eyebrow">Organizer portal</p><h1>Welcome,<br>crew.</h1><p>Sign in with a demonstration account to preview its access. The finished system will use Campbell's Crew Google Workspace accounts.</p></div><form class="portal-login__card" id="portal-login-form"><h2>Organizer sign in</h2><div class="field"><label>Email address<input name="email" type="email" value="Campbell@Campbellscrew.com" required></label></div><div class="field"><label>Demonstration PIN<input name="pin" type="password" inputmode="numeric" maxlength="4" value="2017" required></label></div><button class="button button--green button--wide" type="submit">Sign in →</button><div class="demo-accounts"><span>Quick demonstration accounts</span><button type="button" data-login-role="Executive Owner">Executive Owner</button><button type="button" data-login-role="Event Administrator">Event Admin</button><button type="button" data-login-role="Read-Only Coordinator">Read-Only Coordinator</button><button type="button" data-login-role="Check-In Staff">Check-In Staff</button></div></form></section>`;
    const login = (role) => { portalUser = role; previewRole = ""; sessionStorage.setItem("ccc-portal-user", role); sessionStorage.removeItem("ccc-preview-role"); window.location.hash = role === "Check-In Staff" ? "organizer/checkin" : "organizer/dashboard"; renderRoute(); };
    document.querySelector("#portal-login-form").addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (String(data.get("pin")) !== TEST_PIN) { toast("That demonstration PIN is incorrect."); return; } login("Executive Owner"); });
    document.querySelectorAll("[data-login-role]").forEach((button) => button.addEventListener("click", () => login(button.dataset.loginRole)));
  }

  function heading(kicker, title, description, action) {
    const contextualTabs = "";
    return `<header class="organizer-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p>${contextualTabs}</div>${action || ""}</header>`;
  }

  function organizerDashboard() {
    const currentApplications = state.applications.filter((item)=>!item.archived && item.eventName === state.event.title);
    const applicants = currentApplications.reduce((total, item) => total + item.children.length, 0);
    const approved = currentApplications.reduce((total,item)=>total+item.children.filter((child)=>child.decision==="approved").length,0);
    const review = currentApplications.filter((item) => ["submitted", "review", "info"].includes(item.status)).length;
    const volunteerPercent = Math.min(100, Math.round((state.volunteers.length / state.event.volunteerCapacity) * 100));
    const recipientPercent = Math.min(100, Math.round((applicants / state.event.recipientCapacity) * 100));
    return `<div class="event-context"><label>Working event<select aria-label="Working event"><option>${esc(state.event.title)}</option><option>Christmas Shopping 2025 (closed)</option></select></label><div><button class="button button--light" type="button" data-demo-action="duplicate">Duplicate event</button><button class="button button--green" type="button" data-demo-action="create">Create event</button></div></div>${heading("Organizer overview", state.event.title, "Current event operations and items needing attention.", `<a class="button button--green" href="#organizer/checkin">Open check-in →</a>`)}
      <div class="metric-grid"><article class="metric-card"><span>Volunteers registered</span><strong>${state.volunteers.length}</strong><small>${state.event.volunteerCapacity - state.volunteers.length} spots remaining</small></article><article class="metric-card"><span>Children requested</span><strong>${applicants}</strong><small>Across ${state.applications.length} households</small></article><article class="metric-card"><span>Awaiting review</span><strong>${review}</strong><small>Needs organizer attention</small></article><article class="metric-card"><span>Children approved</span><strong>${approved}</strong><small>Ready for event packets</small></article></div>
      <div class="dashboard-grid"><article class="panel"><div class="panel-header"><div><h2>${esc(state.event.title)}</h2><p>${esc(state.event.date)} · ${esc(state.event.location)}</p></div>${statusPill(state.event.volunteerStatus, "Volunteer signup " + formatStatus(state.event.volunteerStatus))}</div><div class="progress-block"><div class="progress-block__label"><span>Volunteer capacity</span><strong>${state.volunteers.length} / ${state.event.volunteerCapacity}</strong></div><div class="progress-track"><span style="width:${volunteerPercent}%"></span></div></div><div class="progress-block"><div class="progress-block__label"><span>Recipient capacity</span><strong>${applicants} / ${state.event.recipientCapacity}</strong></div><div class="progress-track"><span style="width:${recipientPercent}%"></span></div></div><div class="quick-actions" style="margin-top:28px"><a class="quick-action" href="#organizer/events"><strong>Edit event</strong><span>→</span></a><a class="quick-action" href="#organizer/applications"><strong>Review applications</strong><span>→</span></a><a class="quick-action" href="#organizer/volunteers"><strong>View volunteers</strong><span>→</span></a><a class="quick-action" href="#organizer/packets"><strong>Prepare packets</strong><span>→</span></a></div></article><article class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p>Changes made in this prototype</p></div></div><div class="activity-list">${state.activity.slice(0, 6).map((item) => `<div class="activity-item"><span class="activity-dot"></span><p>${esc(item.text)}</p><time>${esc(item.time)}</time></div>`).join("")}</div></article></div>`;
  }

  function organizerEvents() {
    const e = state.event;
    if (e.type === "food-bag") return organizerFoodBagEvent(e);
    const budgetTotal = e.budgetItems.filter((item) => item.enabled).reduce((sum, item) => sum + Number(item.amount), 0);
    return `${heading("Event management", "Event setup", "Configure the public forms, event-day rules, budgets and access in one place.", `<a class="button button--light" href="#volunteer">Preview volunteer page</a>`)}
      <form id="event-form"><details class="settings-section" open><summary><span><b>01</b><strong>Event basics</strong></span><small>Date, place and overall capacity</small></summary><div class="settings-section__body"><div class="form-grid"><div class="field field--span-2"><label for="event-title">Event name</label><input id="event-title" name="title" value="${esc(e.title)}" required></div><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" value="${esc(e.date)}" required></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" value="${esc(e.time)}" required></div><div class="field"><label for="event-location">Meeting location</label><input id="event-location" name="location" value="${esc(e.location)}" required></div><div class="field"><label for="event-address">Address</label><input id="event-address" name="address" value="${esc(e.address)}" required></div><div class="field"><label for="vol-capacity">Overall volunteer capacity</label><input id="vol-capacity" name="volunteerCapacity" type="number" min="1" value="${esc(e.volunteerCapacity)}"></div><div class="field"><label for="rec-capacity">Recipient child capacity</label><input id="rec-capacity" name="recipientCapacity" type="number" min="1" value="${esc(e.recipientCapacity)}"></div></div></div></details>
      <details class="settings-section" open><summary><span><b>02</b><strong>Volunteer roles & spots</strong></span><small>Names, shifts and limits</small></summary><div class="settings-section__body"><div class="editor-table"><div class="editor-row editor-row--head"><span>Open</span><span>Role</span><span>Shift</span><span>Spots</span></div>${e.roles.map((role) => `<div class="editor-row"><label class="switch"><input type="checkbox" name="role-enabled-${role.id}" ${role.enabled ? "checked" : ""}><span></span></label><input aria-label="${esc(role.title)} role name" name="role-title-${role.id}" value="${esc(role.title)}"><input aria-label="${esc(role.title)} shift" name="role-shift-${role.id}" value="${esc(role.shift)}"><input aria-label="${esc(role.title)} spots" name="role-capacity-${role.id}" type="number" min="0" value="${esc(role.capacity)}"></div>`).join("")}</div><button class="button button--light" type="button" data-add-role>+ Add another role</button></div></details>
      <details class="settings-section"><summary><span><b>03</b><strong>Signup access & questions</strong></span><small>Open, code, closed and field visibility</small></summary><div class="settings-section__body"><h3>Volunteer registration</h3><div class="event-editor-grid">${statusChoice("volunteerStatus", "open", "Open", "Anyone can register.", e.volunteerStatus)}${statusChoice("volunteerStatus", "code", "Access code", "Require an invitation code.", e.volunteerStatus)}${statusChoice("volunteerStatus", "closed", "Closed", "Show a closed message.", e.volunteerStatus)}</div><div class="field"><label for="volunteer-access-code">Volunteer invitation code</label><input id="volunteer-access-code" name="volunteerCode" value="${esc(e.volunteerCode)}"></div><h3>Recipient applications</h3><div class="event-editor-grid">${statusChoice("recipientStatus", "open", "Open", "Applications without a code.", e.recipientStatus)}${statusChoice("recipientStatus", "code", "Access code", "Require referral code.", e.recipientStatus)}${statusChoice("recipientStatus", "closed", "Closed", "Stop new applications.", e.recipientStatus)}</div><div class="field"><label for="recipient-access-code">Recipient invitation code</label><input id="recipient-access-code" name="recipientCode" value="${esc(e.recipientCode)}"></div><div class="toggle-grid">${questionToggle("shirtSize", "Volunteer T-shirt size", e.questions.shirtSize)}${questionToggle("volunteerNotes", "Volunteer special notes", e.questions.volunteerNotes)}${questionToggle("preferences", "Child preferences", e.questions.preferences)}${questionToggle("accommodations", "Child accommodations", e.questions.accommodations)}${questionToggle("documents", "Supporting documents", e.questions.documents)}</div></div></details>
      <details class="settings-section" open><summary><span><b>04</b><strong>Shopping rules & budgets</strong></span><small>Current enabled total: <b id="budget-total">$${budgetTotal}</b></small></summary><div class="settings-section__body"><div class="budget-header"><div><label for="budget">Overall per-child maximum</label><input id="budget" name="shoppingBudget" type="number" min="0" value="${esc(e.shoppingBudget)}"></div><p>Enable only what this event offers. Amounts print automatically on every shopping guide.</p></div><div class="budget-grid">${e.budgetItems.map((item) => `<label class="budget-item"><input type="checkbox" name="budget-enabled-${item.id}" ${item.enabled ? "checked" : ""}><span class="switch-control" aria-hidden="true"></span><span><strong>${esc(item.label)}</strong><small>${esc(item.mode === "relevant" ? "When relevant" : item.mode === "optional" ? "Optional" : "Standard item")}</small></span><b>$</b><input aria-label="${esc(item.label)} budget" name="budget-amount-${item.id}" type="number" min="0" value="${esc(item.amount)}"></label>`).join("")}</div></div></details>
      <div class="sticky-save"><span>All changes are saved.</span><button class="button button--green" type="submit">Save & update event →</button></div></form>`;
  }

  function organizerFoodBagEvent(e) {
    const itemTotal = (item) => Number(item.quantity || 0) * Number(e.bagGoal || 0);
    return `${heading("Event management", "Food Bag Event setup", "Configure volunteer signups and the plan for every food bag.", `<a class="button button--light" href="#volunteer">Preview volunteer page</a>`)}
      <form id="event-form"><details class="settings-section" open><summary><span><b>01</b><strong>Event basics</strong></span><small>Date, place and overall capacity</small></summary><div class="settings-section__body"><div class="form-grid"><div class="field field--span-2"><label for="event-title">Event name</label><input id="event-title" name="title" value="${esc(e.title)}" required></div><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" value="${esc(e.date)}" required></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" value="${esc(e.time)}" required></div><div class="field"><label for="event-location">Meeting location</label><input id="event-location" name="location" value="${esc(e.location)}" required></div><div class="field"><label for="event-address">Address</label><input id="event-address" name="address" value="${esc(e.address)}" required></div><div class="field"><label for="vol-capacity">Overall volunteer capacity</label><input id="vol-capacity" name="volunteerCapacity" type="number" min="1" value="${esc(e.volunteerCapacity)}"></div></div></div></details>
      <details class="settings-section" open><summary><span><b>02</b><strong>Volunteer roles & spots</strong></span><small>Names, shifts and limits</small></summary><div class="settings-section__body"><div class="editor-table"><div class="editor-row editor-row--head"><span>Open</span><span>Role</span><span>Shift</span><span>Spots</span></div>${e.roles.map((role) => `<div class="editor-row"><label class="switch"><input type="checkbox" name="role-enabled-${role.id}" ${role.enabled ? "checked" : ""}><span></span></label><input aria-label="${esc(role.title)} role name" name="role-title-${role.id}" value="${esc(role.title)}"><input aria-label="${esc(role.title)} shift" name="role-shift-${role.id}" value="${esc(role.shift)}"><input aria-label="${esc(role.title)} spots" name="role-capacity-${role.id}" type="number" min="0" value="${esc(role.capacity)}"></div>`).join("")}</div><button class="button button--light" type="button" data-add-role>+ Add another role</button></div></details>
      <details class="settings-section"><summary><span><b>03</b><strong>Volunteer signup access</strong></span><small>Open, code or closed</small></summary><div class="settings-section__body"><div class="configuration-heading"><span>Volunteer configuration</span><small>Control public access and the optional volunteer questions.</small></div><div class="event-editor-grid">${statusChoice("volunteerStatus", "open", "Open", "Anyone can register.", e.volunteerStatus)}${statusChoice("volunteerStatus", "code", "Access code", "Require an invitation code.", e.volunteerStatus)}${statusChoice("volunteerStatus", "closed", "Closed", "Show a closed message.", e.volunteerStatus)}</div><div class="field"><label for="volunteer-access-code">Volunteer invitation code</label><input id="volunteer-access-code" name="volunteerCode" value="${esc(e.volunteerCode)}"></div><div class="toggle-grid">${questionToggle("shirtSize", "Volunteer T-shirt size", e.questions.shirtSize)}${questionToggle("volunteerNotes", "Volunteer special notes", e.questions.volunteerNotes)}</div></div></details>
      <details class="settings-section" open><summary><span><b>04</b><strong>Bag plan & order totals</strong></span><small>${esc(e.bagGoal)} bags planned</small></summary><div class="settings-section__body"><div class="bag-plan-intro"><div class="field"><label for="bag-goal">Goal number of bags</label><input id="bag-goal" name="bagGoal" type="number" min="1" value="${esc(e.bagGoal)}"></div><p>Enter what goes in one bag. The total needed updates automatically for the goal number of bags.</p></div><div class="bag-quick-add"><label for="routine-bag-item">Quick add a routine item<select id="routine-bag-item"><option value="">Choose a standard item</option>${foodBagRoutineItems.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label><button class="button button--dark" type="button" data-add-routine-item>Add selected item</button><button class="button button--light" type="button" data-add-routine-set>Add all routine items</button><button class="button button--light" type="button" data-add-bag-item>+ Add blank item</button></div><div class="bag-plan-table"><div class="bag-plan-row bag-plan-row--head"><span>Item for each bag</span><span>Quantity per bag</span><span>Total to order</span><span></span></div>${e.bagItems.map((item) => `<div class="bag-plan-row"><input name="bag-item-label-${item.id}" value="${esc(item.label)}" aria-label="Bag item"><input name="bag-item-quantity-${item.id}" type="number" min="0" value="${esc(item.quantity)}" aria-label="Quantity per bag"><strong data-bag-total="${item.id}">${itemTotal(item)}</strong><button class="bag-remove" type="button" data-remove-bag-item="${esc(item.id)}" aria-label="Remove ${esc(item.label)}">Remove</button></div>`).join("")}</div><div class="bag-plan-actions"><button class="button button--light" type="button" data-export="bag-plan">Download order spreadsheet</button><button class="button button--green" type="button" data-print-bag-guide>Print packing guide</button></div><article class="bag-packing-guide"><img src="../assets/images/ccc-logo.png" alt="Campbell's Crew Cares logo"><p class="eyebrow">Volunteer packing guide</p><h2>${esc(e.title)}</h2><p>Pack <strong>each bag</strong> with the following items.</p><div class="bag-guide-list">${e.bagItems.map((item) => `<p><b>${esc(item.quantity)}</b><span>${esc(item.label)}</span></p>`).join("")}</div><footer>Goal: ${esc(e.bagGoal)} bags · Campbell's Crew Cares</footer></article></div></details>
      <div class="sticky-save"><span>All changes are saved.</span><button class="button button--green" type="submit">Save & update event →</button></div></form>`;
  }

  function questionToggle(id, label, checked) { if (id === "documents") return ""; return `<label class="question-toggle"><input type="checkbox" name="question-${id}" ${checked ? "checked" : ""}><span class="switch-control" aria-hidden="true"></span><span><strong>${esc(label)}</strong><small>${checked ? "Shown" : "Hidden"} on the public form</small></span></label>`; }

  function statusChoice(name, value, title, copy, current) {
    return `<div class="status-choice"><input id="${name}-${value}" type="radio" name="${name}" value="${value}" ${current === value ? "checked" : ""}><label for="${name}-${value}"><strong>${esc(title)}</strong><span>${esc(copy)}</span></label></div>`;
  }

  function sortBar(group, active, options) {
    return `<div class="sort-bar" aria-label="Sort options"><strong>Sort by</strong>${options.map(([value, label]) => `<button type="button" data-sort-group="${esc(group)}" data-sort-value="${esc(value)}" aria-pressed="${active === value}">${esc(label)}</button>`).join("")}</div>`;
  }

  function organizerVolunteers(filter = "") {
    return organizerVolunteersV8(filter);
    /* Legacy layout retained below for reference during prototype iteration. */
    const normalized = normalize(filter);
    const rows = state.volunteers.filter((item) => (volunteerView === "all" || item.currentEvent) && (!normalized || normalize(`${item.name} ${item.email} ${item.phone} ${item.role} ${item.currentEvent}`).includes(normalized)));
    const lastName = (item) => item.name.trim().split(/\s+/).slice(-1)[0];
    if (volunteerSort === "name-az") rows.sort((a,b) => a.name.localeCompare(b.name)); else if (volunteerSort === "last-az") rows.sort((a,b) => lastName(a).localeCompare(lastName(b))); else if (volunteerSort === "role") rows.sort((a,b) => a.role.localeCompare(b.role)); else if (volunteerSort === "attendance") rows.sort((a,b) => Number(b.checkedIn)-Number(a.checkedIn)); else if (volunteerSort === "no-shows") rows.sort((a,b) => (b.history||[]).filter(x=>x.result==="No-show").length-(a.history||[]).filter(x=>x.result==="No-show").length);
    return `${heading("People & participation", "Volunteer directory", "Permanent volunteer profiles with event registrations and reliability history.", `<button class="button button--light" type="button" data-export="volunteers">Download volunteers.csv</button>`)}<div class="table-tools"><label class="search-field"><span class="screen-reader-only">Search volunteers</span><input id="volunteer-search" type="search" value="${esc(filter)}" placeholder="Search name, email, phone, or role"></label><span>${rows.length} volunteers</span></div>${sortBar("volunteers", volunteerSort, [["name-az","First name"],["last-az","Last name"],["role","Role"],["attendance","Attendance"],["no-shows","No-shows"]])}<div class="directory-list">${rows.map((item) => { const history = item.history || []; const noShows = history.filter((entry) => entry.result === "No-show").length; return `<details class="directory-card"><summary><span><strong>${esc(item.name)}</strong><small>${esc(item.email)} · ${esc(item.phone)}</small></span><span><b>${esc(item.role)}</b><small>${history.length} prior event${history.length === 1 ? "" : "s"}${noShows ? ` · ${noShows} no-show` : ""}</small></span>${item.checkedIn ? statusPill("checked") : statusPill("submitted", "Registered")}</summary><div class="directory-card__body"><div><h3>Current event</h3><p>${esc(state.event.title)} · ${esc(item.role)} · ${esc(item.shift)}</p><p><strong>Organizer note:</strong> ${esc(item.notes || "No notes")}</p></div><div><h3>Event history</h3>${history.length ? history.map((entry) => `<p class="history-row"><span>${esc(entry.event)} · ${esc(entry.role)}</span><b class="${entry.result === "No-show" ? "text-danger" : ""}">${esc(entry.result)}</b></p>`).join("") : `<p>No prior events recorded.</p>`}</div></div></details>`; }).join("")}</div>`;
  }

  function organizerVolunteersV6(filter = "") {
    const normalized = normalize(filter);
    const rows = state.volunteers.filter((item)=>(volunteerView === "all" || item.currentEvent === state.event.title) && (!normalized || normalize(`${item.name} ${item.email} ${item.phone} ${item.role} ${item.currentEvent}`).includes(normalized)));
    const lastName = (item)=>item.name.trim().split(/\s+/).slice(-1)[0];
    if(volunteerSort==="name-az")rows.sort((a,b)=>a.name.localeCompare(b.name)); else if(volunteerSort==="last-az")rows.sort((a,b)=>lastName(a).localeCompare(lastName(b))); else if(volunteerSort==="role")rows.sort((a,b)=>a.role.localeCompare(b.role)); else if(volunteerSort==="no-shows")rows.sort((a,b)=>(b.history||[]).filter(x=>x.result==="No-show").length-(a.history||[]).filter(x=>x.result==="No-show").length);
    return `${heading("People & participation", "Volunteer directory", volunteerView === "all" ? "Every current and past volunteer remains searchable here." : `People currently registered for ${state.event.title}.`, `<button class="button button--light" type="button" data-export="volunteers">Download volunteers.csv</button>`)}<div class="table-tools"><label class="search-field"><span class="screen-reader-only">Search volunteers</span><input id="volunteer-search" type="search" value="${esc(filter)}" placeholder="Search name, email, phone, role, or event"></label><span>${rows.length} volunteers</span></div>${sortBar("volunteers",volunteerSort,[["name-az","First name"],["last-az","Last name"],["role","Role"],["no-shows","No-shows"]])}<div class="directory-list">${rows.map((item)=>{const history=item.history||[];const noShows=history.filter(x=>x.result==="No-show").length;return `<details class="directory-card"><summary><span><strong>${esc(item.name)}</strong><small>${esc(item.email)} · ${esc(item.phone)}</small></span><span><b>${esc(item.role)}</b><small>${history.length} prior event${history.length===1?"":"s"}${noShows?` · ${noShows} no-show`:""}</small></span>${item.currentEvent?statusPill("approved","Currently registered"):statusPill("closed","Past volunteer")}</summary><div class="directory-card__body"><div><h3>Current registration</h3><p>${item.currentEvent?`${esc(item.currentEvent)} · ${esc(item.role)} · ${esc(item.shift)}`:"Not registered for a current event."}</p><p><strong>Organizer note:</strong> ${esc(item.notes||"No notes")}</p></div><div><h3>Event history</h3>${history.length?history.map((entry)=>`<p class="history-row"><span>${esc(entry.event)} · ${esc(entry.role)}</span><b class="${entry.result==="No-show"?"text-danger":""}">${esc(entry.result)}</b></p>`).join(""):`<p>No prior events recorded.</p>`}</div></div></details>`;}).join("")}</div>`;
  }

  function organizerVolunteersV8(filter = "") {
    let html = organizerVolunteersV6(filter).replace('<div class="table-tools">', '<div class="directory-actions"><button class="button button--green" type="button" data-add-volunteer>+ Add volunteer</button></div><div class="table-tools">');
    if (volunteerView === "current") html = html.replace("VOLUNTEER DIRECTORY", "CURRENT VOLUNTEER SIGNUPS").replace("Volunteer directory", "Current volunteer signups");
    return html;
  }

  function organizerApplications(filter = "") {
    return organizerApplicationsV8(filter);
    /* Legacy layout retained below for reference during prototype iteration. */
    const normalized = normalize(filter);
    let rows = state.applications.filter((item) => !normalized || normalize(`${item.guardian} ${item.email} ${item.phone} ${item.id} ${item.children.map((child) => child.name).join(" ")}`).includes(normalized));
    const compareName = (a, b) => a.guardian.localeCompare(b.guardian);
    if (applicationSort === "name-az") rows.sort(compareName); else if (applicationSort === "name-za") rows.sort((a, b) => compareName(b, a)); else if (applicationSort === "status") rows.sort((a, b) => a.status.localeCompare(b.status)); else if (applicationSort === "flags") rows.sort((a, b) => (b.flags.length + (b.updated ? 1 : 0)) - (a.flags.length + (a.updated ? 1 : 0))); else if (applicationSort === "submitted-oldest") rows.reverse();
    return `${heading("Recipient review", "Applications", "Households stay grouped while each child receives an independent decision.", `<button class="button button--light" type="button" data-export="applications">Download applications.csv</button>`)}<div class="table-tools table-tools--wrap"><label class="search-field"><span class="screen-reader-only">Search applications</span><input id="application-search" type="search" value="${esc(filter)}" placeholder="Search guardian, child, phone, or ID"></label><span>${rows.length} households</span></div>${sortBar("applications", applicationSort, [["submitted-newest","Newest"],["submitted-oldest","Oldest"],["name-az","Guardian A–Z"],["status","Child status"],["flags","Most flags"]])}<div class="application-list">${rows.map((item) => { const counts = item.children.reduce((out, child) => { out[child.decision]=(out[child.decision]||0)+1; return out; },{}); return `<article class="application-row"><div><strong>${esc(item.guardian)}</strong><small>${esc(item.id)} · ${esc(item.submitted)}</small></div><div class="child-chip-list">${item.children.map((child) => `<span><b>${esc(child.name)}</b><small>Age ${esc(child.age)} · ${esc(formatStatus(child.decision))}</small></span>`).join("")}</div><div class="household-summary">${Object.entries(counts).map(([key,value])=>`<span>${value} ${esc(formatStatus(key))}</span>`).join("")}</div><div>${statusPill(item.status)}<button class="button button--small button--ghost" type="button" data-open-application="${esc(item.id)}">Review children</button></div></article>`; }).join("")}</div>`;
  }

  function organizerApplicationsV6(filter = "") {
    const normalized=normalize(filter);
    let rows=state.applications.filter((item)=>(applicationView === "log" ? item.archived : !item.archived) && (!normalized || normalize(`${item.guardian} ${item.email} ${item.phone} ${item.id} ${item.children.map((child)=>child.name).join(" ")} ${item.eventName}`).includes(normalized)));
    const childFirst=(item)=>item.children[0]?.firstName||""; const childLast=(item)=>item.children[0]?.lastName||"";
    if(applicationSort==="name-az")rows.sort((a,b)=>a.guardian.localeCompare(b.guardian)); else if(applicationSort==="child-az")rows.sort((a,b)=>childFirst(a).localeCompare(childFirst(b))); else if(applicationSort==="child-last")rows.sort((a,b)=>childLast(a).localeCompare(childLast(b))); else if(applicationSort==="status")rows.sort((a,b)=>a.status.localeCompare(b.status)); else if(applicationSort==="flags")rows.sort((a,b)=>b.flags.length-a.flags.length); else if(applicationSort==="submitted-oldest")rows.reverse();
    const title=applicationView === "log" ? "Application Log" : "Applications";
    return `${heading("Recipient review", "Applications", applicationView === "log" ? "Permanent records from closed-out events remain searchable here." : "Current households stay grouped while every child has an unmistakable decision.", `<button class="button button--light" type="button" data-export="applications">Download applications.csv</button>`)}<div class="table-tools table-tools--wrap"><label class="search-field"><span class="screen-reader-only">Search ${esc(title)}</span><input id="application-search" type="search" value="${esc(filter)}" placeholder="Search guardian, child, phone, ID, or event"></label><span>${rows.length} households</span></div>${sortBar("applications",applicationSort,[["submitted-newest","Newest"],["submitted-oldest","Oldest"],["name-az","Guardian A–Z"],["child-az","Child A–Z"],["child-last","Child last name"],["status","Status"],["flags","Flags"]])}<div class="application-list">${rows.map((item)=>{const counts=item.children.reduce((out,child)=>{out[child.decision]=(out[child.decision]||0)+1;return out;},{});return `<article class="application-row application-row--${esc(item.status)}"><div><strong>${esc(item.guardian)}</strong><small>${esc(item.id)} · ${esc(item.eventName)} · ${esc(item.submitted)}</small></div><div class="child-chip-list">${item.children.map((child)=>`<span class="child-status child-status--${esc(child.decision)}"><b>${esc(child.firstName)} ${esc(child.lastName)}</b><small>Age ${esc(child.age)} · ${esc(formatStatus(child.decision))}</small></span>`).join("")}</div><div class="household-summary">${Object.entries(counts).map(([key,value])=>`<span class="summary-status summary-status--${esc(key)}">${value} ${esc(formatStatus(key))}</span>`).join("")}</div><div>${statusPill(item.status)}<button class="button button--small button--ghost" type="button" data-open-application="${esc(item.id)}">${applicationView==="log"?"View record":"Review children"}</button></div></article>`;}).join("")||`<div class="empty-state"><strong>No applications in this view</strong>Try the other tab or clear your search.</div>`}</div>`;
  }

  function applicationFlagsHtml(item) {
    const flags = [...(item.flags || [])];
    if (item.updated) flags.unshift("Application updated · review");
    if ((item.previousAttendance || []).some((entry)=>entry.result === "No-show")) flags.unshift("Previous no-show");
    return flags.length ? `<div class="application-flags">${flags.map((flag)=>`<span class="${flag === "Previous no-show" ? "is-danger" : flag.startsWith("Application updated") ? "is-info" : ""}">${esc(flag)}</span>`).join("")}</div>` : `<div class="application-flags application-flags--clear"><span>No review flags</span></div>`;
  }

  function organizerApplicationsV7(filter = "") {
    const normalized = normalize(filter);
    let rows = state.applications.filter((item)=>(applicationView === "log" ? item.archived : !item.archived && item.eventName === state.event.title) && (!normalized || normalize(`${item.guardian} ${item.email} ${item.phone} ${item.id} ${item.children.map((child)=>child.name).join(" ")} ${item.eventName}`).includes(normalized)));
    const childFirst=(item)=>item.children[0]?.firstName||""; const childLast=(item)=>item.children[0]?.lastName||"";
    if(applicationSort==="name-az")rows.sort((a,b)=>a.guardian.localeCompare(b.guardian)); else if(applicationSort==="child-az")rows.sort((a,b)=>childFirst(a).localeCompare(childFirst(b))); else if(applicationSort==="child-last")rows.sort((a,b)=>childLast(a).localeCompare(childLast(b))); else if(applicationSort==="status")rows.sort((a,b)=>a.status.localeCompare(b.status)); else if(applicationSort==="flags")rows.sort((a,b)=>(b.flags.length+(b.updated?1:0))-(a.flags.length+(a.updated?1:0))); else if(applicationSort==="submitted-oldest")rows.reverse();
    const title=applicationView === "log" ? "Application Log" : "Applications";
    const cards = rows.map((item)=>`<article class="application-row application-row--${esc(item.status)}"><div><strong>${esc(item.guardian)}</strong><small>${esc(item.id)} · ${esc(item.eventName)} · ${esc(item.submitted)}</small></div><div class="child-chip-list">${item.children.map((child)=>`<span class="child-status child-status--${esc(child.decision)}"><b>${esc(child.firstName)} ${esc(child.lastName)}</b><small>Age ${esc(child.age)} · ${esc(formatStatus(child.decision))}</small></span>`).join("")}</div>${applicationFlagsHtml(item)}<div>${statusPill(item.status)}<button class="button button--small button--ghost" type="button" data-open-application="${esc(item.id)}">${applicationView==="log"?"View record":"Review children"}</button></div></article>`).join("");
    return `${heading("Recipient review", "Applications", applicationView === "log" ? "Permanent records from closed-out events remain searchable here." : "Current households stay grouped while every child has an unmistakable decision.", `<button class="button button--light" type="button" data-export="applications">Download applications.csv</button>`)}<div class="table-tools table-tools--wrap"><label class="search-field"><span class="screen-reader-only">Search ${esc(title)}</span><input id="application-search" type="search" value="${esc(filter)}" placeholder="Search guardian, child, phone, ID, or event"></label><span>${rows.length} households</span></div>${sortBar("applications",applicationSort,[["submitted-newest","Newest"],["submitted-oldest","Oldest"],["name-az","Guardian A–Z"],["child-az","Child A–Z"],["child-last","Child last name"],["status","Status"],["flags","Flags"]])}<div class="application-list">${cards || `<div class="empty-state"><strong>No applications in this view</strong>Try the other tab or clear your search.</div>`}</div>`;
  }

  function organizerApplicationsV8(filter = "") {
    return organizerApplicationsV7(filter).replace("<h1>Applications</h1>", applicationView === "log" ? "<h1>Past Recipients</h1>" : "<h1>Current Applications</h1>");
  }

  function organizerCheckin(filter = "") {
    // Food Bag Events only have volunteers. Keep the check-in screen from
    // retaining the child tab when an organizer switches between event types.
    const isFoodBag = state.event.type === "food-bag";
    const activeType = isFoodBag ? "volunteers" : checkinType;
    const records = activeType === "volunteers" ? state.volunteers.filter((item)=>item.currentEvent === state.event.title) : state.applications.filter((household)=>!household.archived && household.eventName === state.event.title).flatMap((household) => household.children.filter((child) => child.decision === "approved").map((child) => ({ ...child, guardian: household.guardian, householdId: household.id, phone: household.phone })));
    const normalized = normalize(filter);
    const rows = records.filter((item) => !normalized || normalize(activeType === "volunteers" ? `${item.name} ${item.email} ${item.phone} ${item.role}` : `${item.guardian} ${item.name} ${item.householdId}`).includes(normalized));
    const checkinLastName = (item) => item.name.trim().split(/\s+/).slice(-1)[0];
    if (checkinSort === "name-az") rows.sort((a,b)=>a.name.localeCompare(b.name)); else if (checkinSort === "last-az") rows.sort((a,b)=>checkinLastName(a).localeCompare(checkinLastName(b))); else if (checkinSort === "role") rows.sort((a,b)=>String(a.role||a.guardian).localeCompare(String(b.role||b.guardian))); else if (checkinSort === "status") rows.sort((a,b)=>Number(Boolean(b.checkedIn || b.attendance==="checked"))-Number(Boolean(a.checkedIn || a.attendance==="checked")));
    const checked = records.filter((item) => activeType === "volunteers" ? item.checkedIn : item.attendance === "checked").length;
    return (`${heading("Event-day tools", "Check-in", "Every arrival requires a review and confirmation before it is recorded.")}
      <div class="checkin-summary"><article class="checkin-card"><strong>${checked}</strong><span>Checked in</span></article><article class="checkin-card"><strong>${Math.max(0, records.length - checked)}</strong><span>Still expected</span></article></div>
      <article class="panel"><div class="table-tools">${isFoodBag ? `<strong class="checkin-scope">Volunteer check-in</strong>` : `<div class="segmented"><button type="button" data-checkin-type="recipients" aria-pressed="${activeType === "recipients"}">Children</button><button type="button" data-checkin-type="volunteers" aria-pressed="${activeType === "volunteers"}">Volunteers</button></div>`}<label class="search-field"><span class="screen-reader-only">Search check-in list</span><input id="checkin-search" type="search" value="${esc(filter)}" placeholder="Search name, household, role"></label></div><div class="checkin-list">${rows.length ? rows.map((item) => { const isChecked = activeType === "volunteers" ? item.checkedIn : item.attendance === "checked"; const id = activeType === "volunteers" ? item.id : `${item.householdId}|${item.id}`; return `<article class="checkin-row"><div><strong>${esc(item.name)}</strong><small>${activeType === "volunteers" ? `${esc(item.role)} · ${esc(item.shift)}` : `${esc(item.guardian)} household · ${esc(item.householdId)}`}</small></div>${statusPill(isChecked ? "checked" : "submitted", isChecked ? `Checked ${esc(item.checkedAt || "in")}` : esc(formatStatus(item.attendance || "expected")))}<div class="row-actions"><button class="dots-button" type="button" data-checkin-note="${esc(id)}" aria-label="Make note for ${esc(item.name)}">•••</button><button class="button button--small ${isChecked ? "button--ghost" : "button--green"}" type="button" data-confirm-checkin="${esc(id)}">${isChecked ? "Undo" : "Check in"}</button></div></article>`; }).join("") : `<div class="empty-state"><strong>No matching records</strong>Try another search.</div>`}</div></article>`).replace('<div class="checkin-list">', `${sortBar("checkin", checkinSort, [["name-az","First name"],["last-az","Last name"],["role",activeType === "volunteers" ? "Role" : "Household"],["status","Attendance"]])}<div class="checkin-list">`);
  }

  function organizerPackets() {
    const approved = state.applications.filter((item) => item.status === "approved");
    const guides = state.event.budgetItems.filter((item) => item.enabled);
    return `${heading("Volunteer handoff", "Print packets", "Child sheets and current rules print in alternating order.", `<button class="button button--green" type="button" data-print-mode="all">Print all complete packets</button>`)}<article class="panel template-panel"><div><h2>Packet templates</h2><p>Replace the blank child sheet or event rules when your documents change.</p></div><label class="upload-button">Upload child sheet<input type="file" data-template="child" accept=".pdf"></label><span>${esc(state.event.templates.child)}</span><label class="upload-button">Upload rules PDF<input type="file" data-template="rules" accept=".pdf"></label><span>${esc(state.event.templates.rules)}</span></article><div class="packet-list">${approved.flatMap((item) => item.children.map((child) => `<article class="packet-card" data-packet-child="${esc(child.id)}"><div class="packet-card__head"><div><p class="eyebrow">${esc(item.guardian)} household · ${esc(item.id)}</p><h3>${esc(child.name)} · Age ${esc(child.age)}</h3><p>Emergency: ${esc(item.emergencyName)}, ${esc(item.emergencyPhone)}</p></div>${statusPill("approved")}</div><section class="print-child-sheet"><h4>Child information sheet</h4><p><strong>Sizes:</strong> Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodation:</strong> ${esc(child.accommodations)}</p></section><section class="print-rules-sheet"><h4>Event shopping guide</h4><p>Overall maximum: <strong>$${esc(state.event.shoppingBudget)}</strong></p><div class="guide-items">${guides.map((guide) => `<span>${esc(guide.label)} <b>$${esc(guide.amount)}</b></span>`).join("")}</div><p>Follow the uploaded event rules for safety, emergencies, restrooms and approved purchases.</p></section><div class="packet-actions"><button class="button button--small button--ghost" type="button" data-print-mode="child" data-print-child="${esc(child.id)}">Child sheet</button><button class="button button--small button--ghost" type="button" data-print-mode="rules" data-print-child="${esc(child.id)}">Rules only</button><button class="button button--small button--green" type="button" data-print-mode="complete" data-print-child="${esc(child.id)}">Complete packet</button></div></article>`)).join("") || `<div class="empty-state"><strong>No approved children yet</strong>Approve an application to create packets.</div>`}</div>`;
  }

  function organizerPacketsV5() {
    let packets = state.applications.filter((household)=>!household.archived && household.eventName === state.event.title).flatMap((household) => household.children.filter((child) => child.decision === "approved").map((child) => ({ child, household })));
    const childLast = (name) => name.trim().split(/\s+/).slice(-1)[0];
    if (packetSort === "child-az") packets.sort((a,b)=>a.child.name.localeCompare(b.child.name)); else if (packetSort === "last-az") packets.sort((a,b)=>childLast(a.child.name).localeCompare(childLast(b.child.name))); else if (packetSort === "household") packets.sort((a,b)=>a.household.guardian.localeCompare(b.household.guardian)); else if (packetSort === "id") packets.sort((a,b)=>a.household.id.localeCompare(b.household.id)); else if (packetSort === "age") packets.sort((a,b)=>a.child.age-b.child.age);
    return `${heading("Volunteer handoff", "Print packets", "A compact printing queue built to handle more than 100 children.", `<button class="button button--green" type="button" data-print-mode="all">Print all complete packets</button>`)}<article class="panel template-panel"><div><h2>Packet templates</h2><p>The current rules sheet is paired automatically when you print both.</p></div><label class="upload-button">Upload child sheet<input type="file" data-template="child" accept=".pdf"></label><span>${esc(state.event.templates.child)}</span><label class="upload-button">Upload rules PDF<input type="file" data-template="rules" accept=".pdf"></label><span>${esc(state.event.templates.rules)}</span></article>${sortBar("packets", packetSort, [["child-az","First name"],["last-az","Last name"],["household","Household"],["id","Application ID"],["age","Age"]])}<div class="packet-list packet-list--compact">${packets.map(({child,household}) => `<article class="packet-row packet-card" data-packet-child="${esc(child.id)}"><div><strong>${esc(child.name)}</strong><small>Age ${esc(child.age)} · ${esc(household.guardian)} household · ${esc(household.id)}</small></div>${statusPill("approved","Ready")}<div class="packet-actions"><button class="button button--small button--ghost" type="button" data-print-mode="child" data-print-child="${esc(child.id)}">Child sheet</button><button class="button button--small button--ghost" type="button" data-print-mode="rules" data-print-child="${esc(child.id)}">Rules only</button><button class="button button--small button--green" type="button" data-print-mode="complete" data-print-child="${esc(child.id)}">Both</button></div><div class="packet-print-content"><section class="print-child-sheet"><h2>${esc(child.name)}</h2><p><strong>Household:</strong> ${esc(household.guardian)} · ${esc(household.id)}</p><p><strong>Emergency:</strong> ${esc(household.emergencyName)} · ${esc(household.emergencyPhone)}</p><p><strong>Sizes:</strong> Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p></section><section class="print-rules-sheet"><h2>${esc(state.event.title)} rules</h2><p>Current rules template: ${esc(state.event.templates.rules)}</p></section></div></article>`).join("") || `<div class="empty-state"><strong>No approved children yet</strong>Approve an individual child to create a packet.</div>`}</div>`;
  }

  function organizerEmails() {
    const isFoodBag = state.event.type === "food-bag";
    const templates = isFoodBag ? state.event.emailTemplates.filter((template) => !/recipient|application/i.test(template.title)) : state.event.emailTemplates;
    const audienceOptions = isFoodBag ? `<option>All registered volunteers</option><option>Everyone registered for this event</option>` : `<option>All registered volunteers</option><option>All approved recipient households</option><option>Shoppers only</option><option>Everyone registered for this event</option>`;
    return `${heading("Communications", "Email center", "Automatic confirmations, scheduled reminders and targeted event updates.", `<button class="button button--green" type="button" data-demo-action="new-email">New blast email</button>`)}<div class="email-layout"><section><h2>Automated messages</h2>${templates.map((template) => `<article class="email-card"><label class="switch"><input type="checkbox" data-email-toggle="${esc(template.id)}" ${template.enabled ? "checked" : ""}><span></span></label><div><strong>${esc(template.title)}</strong><small>${esc(template.timing)}</small><p>Subject: ${esc(template.subject)}</p></div><button class="button button--small button--ghost" type="button" data-email-edit="${esc(template.id)}">Edit draft</button></article>`).join("")}</section><section class="panel"><h2>Send a blast email</h2><p>Demonstration only—nothing will actually be sent.</p><form id="blast-form"><div class="field"><label for="blast-audience">Audience</label><select id="blast-audience" name="audience">${audienceOptions}</select></div><div class="field"><label for="blast-subject">Subject</label><input id="blast-subject" name="subject" value="Important update for ${esc(state.event.title)}" required></div><div class="field"><label for="blast-message">Message</label><textarea id="blast-message" name="message" rows="8" required>Date: ${esc(state.event.date)}&#10;Time: ${esc(state.event.time)}&#10;Location: ${esc(state.event.location)}&#10;&#10;Please arrive a few minutes early so we can begin on time.</textarea></div><div class="form-actions"><button class="button button--light" type="button" data-demo-action="test-email">Send test</button><button class="button button--green" type="submit">Review & queue email →</button></div></form></section></div>`;
  }

  function organizerReports() {
    const latest = state.reports[0];
    return `${heading("Event records", "Reports & history", "Close out an event once, preserve it permanently and compare participation over time.", `<button class="button button--green" type="button" data-demo-action="closeout">Close out current event</button>`)}<div class="metric-grid"><article class="metric-card"><span>Children attendance</span><strong>${latest.childrenAttended}/${latest.childrenRegistered}</strong><small>${Math.round((latest.childrenAttended/latest.childrenRegistered)*100)}% attended</small></article><article class="metric-card"><span>Volunteer attendance</span><strong>${latest.volunteersAttended}/${latest.volunteersRegistered}</strong><small>${latest.volunteerHours} volunteer hours</small></article><article class="metric-card"><span>Total event spending</span><strong>$${latest.totalSpent.toLocaleString()}</strong><small>$${Math.round(latest.totalSpent/latest.childrenAttended)} per attending child</small></article></div><article class="panel"><div class="panel-header"><div><h2>Close-out worksheet</h2><p>Enter final figures after the event. Saving adds a permanent read-only report.</p></div>${statusPill("review", "Draft")}</div><form id="report-form"><div class="form-grid"><div class="field"><label>Children registered<input name="childrenRegistered" type="number" value="100"></label></div><div class="field"><label>Children attended<input name="childrenAttended" type="number" value="92"></label></div><div class="field"><label>Volunteers registered<input name="volunteersRegistered" type="number" value="80"></label></div><div class="field"><label>Volunteers attended<input name="volunteersAttended" type="number" value="74"></label></div><div class="field"><label>Total volunteer hours<input name="volunteerHours" type="number" value="340"></label></div><div class="field"><label>Kids shopping<input name="shopping" type="number" value="13800"></label></div><div class="field"><label>Food<input name="food" type="number" value="700"></label></div><div class="field"><label>Planning & supplies<input name="supplies" type="number" value="900"></label></div><div class="field"><label>Other expenses<input name="other" type="number" value="250"></label></div><div class="field field--span-2"><label>Close-out notes<textarea name="notes" placeholder="Lessons learned, incidents, successes and next-year changes"></textarea></label></div></div><button class="button button--green" type="submit">Save close-out report →</button></form></article><article class="panel"><h2>Event history</h2><div class="report-row"><span><strong>${esc(latest.event)}</strong><small>${esc(latest.status)} · All records retained</small></span><b>${latest.childrenAttended} children · ${latest.volunteerHours} hours · $${latest.totalSpent.toLocaleString()}</b><button class="button button--small button--ghost" type="button" data-demo-action="view-report">View report</button></div></article>`;
  }

  function organizerSettings() {
    return `${heading("Workspace administration", "Settings", "Manage people, permissions, security defaults and demonstration data.", `<button class="button button--green" type="button" data-add-user>+ Add user</button>`)}<article class="panel"><div class="panel-header"><div><h2>Users & permissions</h2><p>Fewer than ten trusted people will have organizer access.</p></div></div><div class="permission-legend"><span><b>Executive Owner</b> Everything</span><span><b>Event Administrator</b> All event operations</span><span><b>Read-Only Coordinator</b> View without editing</span><span><b>Check-In Staff</b> Check-in only; other panels locked</span></div><div class="user-list">${state.users.map((user) => `<div class="user-row"><span><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></span><b>${esc(user.role)}</b>${statusPill(user.status === "Active" ? "approved" : "submitted", user.status)}<button class="dots-button" type="button" data-demo-action="user-menu" aria-label="User options">•••</button></div>`).join("")}</div><div class="inline-note"><strong>Check-In Staff elevation PIN:</strong> 2017 in this prototype. Production should require an administrator login before sensitive panels unlock.</div></article><article class="panel"><div class="panel-header"><div><h2>Security & retention</h2><p>Current planning decisions</p></div></div><div class="detail-grid"><div class="detail-item"><span>Organizer login</span><strong>Google Workspace planned</strong></div><div class="detail-item"><span>Event history</span><strong>Retain all years</strong></div><div class="detail-item"><span>Audit log</span><strong>Decisions, edits, emails and exports</strong></div><div class="detail-item"><span>Search visibility</span><strong>No indexing</strong></div></div></article><article class="panel danger-zone"><div><h2>Danger zone</h2><p>Restore the original fictional event, volunteers and applications.</p></div><button class="button button--danger" type="button" data-reset-demo>Reset demonstration data</button></article>`;
  }

  function organizerSettingsV5() {
    const previewPanel = `<article class="panel role-viewer"><div><p class="eyebrow">Permission preview</p><h2>View portal as…</h2><p>Temporarily experience exactly what another person can see.</p></div><div class="role-viewer__options"><button type="button" data-preview-role="Signed out visitor">Nobody / signed out</button><button type="button" data-preview-role="Check-In Staff">Check-In Staff</button><button type="button" data-preview-role="Read-Only Coordinator">Read-Only Coordinator</button><button type="button" data-preview-role="Event Administrator">Event Administrator</button><button type="button" data-preview-role="Executive Owner">Executive Owner</button></div></article>`;
    return organizerSettings().replace('<article class="panel">', `${previewPanel}<article class="panel">`);
  }

  function organizerDashboardV8() {
    if (!state.event) return `${heading("Organizer overview", "No event scheduled", "Create an event when you are ready. Nothing is publicly open until you choose to open that event.", `<button class="button button--green" type="button" data-create-event>Create event</button>`)}<article class="panel no-active-event"><p class="eyebrow">Start here</p><h2>Create your first event</h2><p>Choose either a Kids Shopping Event or a Food Bag Event. Its settings will be saved to the private Campbell's Crew workspace.</p><button class="button button--green" type="button" data-create-event>Create event</button></article>`;
    const children = state.applications.filter((item)=>!item.archived && item.eventName === state.event.title).reduce((sum,item)=>sum+item.children.length,0);
    const volunteers = state.volunteers.filter((item)=>item.currentEvent === state.event.title).length;
    const isFoodBag = state.event.type === "food-bag";
    const reviewCount = state.applications.filter((item)=>!item.archived && item.eventName === state.event.title && ["submitted","review","info"].includes(item.status)).length;
    const approvedCount = state.applications.filter((item)=>!item.archived && item.eventName === state.event.title).reduce((sum,item)=>sum+item.children.filter((child)=>child.decision==="approved").length,0);
    const eventStatus = `<span>${statusPill(state.event.volunteerStatus,"Volunteer signup "+formatStatus(state.event.volunteerStatus))}</span>${isFoodBag ? "" : `<span>${statusPill(state.event.recipientStatus,"Recipient signup "+formatStatus(state.event.recipientStatus))}</span>`}`;
    const metrics = isFoodBag ? `<article class="metric-card"><span>Current volunteers</span><strong>${volunteers}</strong><small>${Math.max(0,state.event.volunteerCapacity-volunteers)} spots remaining</small></article><article class="metric-card"><span>Food bags planned</span><strong>${state.event.bagGoal || 0}</strong><small>${(state.event.bagItems || []).length} items in each bag</small></article><article class="metric-card"><span>Open volunteer roles</span><strong>${state.event.roles.filter((role)=>role.enabled).length}</strong><small>Ready for signup</small></article>` : `<article class="metric-card"><span>Current volunteers</span><strong>${volunteers}</strong><small>${Math.max(0,state.event.volunteerCapacity-volunteers)} spots remaining</small></article><article class="metric-card"><span>Children requested</span><strong>${children}</strong><small>Current applications</small></article><article class="metric-card"><span>Applications needing review</span><strong>${reviewCount}</strong><small>Organizer attention</small></article><article class="metric-card"><span>Approved children</span><strong>${approvedCount}</strong><small>Ready for event</small></article>`;
    return `${heading("Organizer overview", "Upcoming event", "The information your team needs first, without extra setup shortcuts.")}<article class="panel upcoming-event"><div><p class="eyebrow">Next scheduled event</p><h2>${esc(state.event.title)}</h2><p>${esc(state.event.date)} · ${esc(state.event.time)}</p><p>${esc(state.event.location)}<br>${esc(state.event.address)}</p></div><div class="upcoming-status">${eventStatus}<a class="button button--green" href="#organizer/checkin">Open event check-in →</a></div></article><div class="metric-grid">${metrics}</div><article class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p>Latest organizer and signup changes</p></div></div><div class="activity-list">${state.activity.slice(0,8).map((item)=>`<div class="activity-item"><span class="activity-dot"></span><p>${esc(item.text)}</p><time>${esc(item.time)}</time></div>`).join("")}</div></article>`;
  }

  function organizerEventsV8() {
    if (!state.event) {
      return `${heading("Event management", "No active event", "Create an event to begin configuring volunteers, recipients, and event details.", `<button class="button button--green" type="button" data-create-event>Create event</button>`)}<article class="panel no-active-event"><p class="eyebrow">Ready when you are</p><h2>Create an event</h2><p>Your event will begin as a private draft. Public volunteer and recipient pages remain closed until you deliberately open them.</p><button class="button button--green" type="button" data-create-event>Create event</button></article>`;
    }
    const eventClosed = state.event.closed === true || (state.event.closed === undefined && state.event.volunteerStatus === "closed" && state.event.recipientStatus === "closed");
    if (eventClosed) {
      return `${heading("Event management", "No active event", "The finished event is safely stored in Reports & History and is no longer editable.", `<button class="button button--green" type="button" data-create-event>Create New Event</button>`)}<article class="panel no-active-event"><p class="eyebrow">Ready for what’s next</p><h2>Create your next event</h2><p>Start a fresh event workspace with new dates, signup settings, volunteer roles, budgets, applications, and check-in lists. Closed events remain read-only in historical records.</p><button class="button button--green" type="button" data-create-event>Create New Event</button></article>`;
    }
    const remembered = JSON.parse(sessionStorage.getItem("ccc-event-sections") || "null");
    let html = organizerEvents().replace('Event setup', 'Event Management').replace('<form id="event-form">', `<div class="event-context event-context--simple"><label>Event being edited<select><option>${esc(state.event.title)}</option><option>Christmas Shopping 2025 (closed record)</option></select></label></div><form id="event-form">`);
    const activeEventControl = activeEvents().length > 1 ? `<select aria-label="Active event being edited" data-active-event>${activeEventOptions()}</select>` : `<div class="event-context--single" aria-label="Active event being edited">${esc(state.event.title)}</div>`;
    html = html.replace(`<div class="event-context event-context--simple"><label>Event being edited<select><option>${esc(state.event.title)}</option><option>Christmas Shopping 2025 (closed record)</option></select></label></div>`, `<div class="event-context event-context--simple"><label>Active event being edited${activeEventControl}</label><button class="button button--green" type="button" data-create-event>+ Add Event</button></div>`);
    html = html.replace('<details class="settings-section" open>', '<details class="settings-section">');
    html = html.replace('<h3>Volunteer registration</h3>', '<div class="configuration-heading"><span>Volunteer configuration</span><small>Access, public questions, roles, and capacity</small></div><h3>Volunteer registration</h3>');
    html = html.replace('<h3>Recipient applications</h3>', '<div class="configuration-heading"><span>Recipient configuration</span><small>Access and application questions are managed separately</small></div><h3>Recipient applications</h3>');
    html += `<article class="finish-event-panel"><div><p class="eyebrow">End-of-event action</p><h2>Finished with this event?</h2><p>Close-out records are preserved in reports, the volunteer directory, and Past Recipients / History.</p></div><button class="button button--danger" type="button" data-finish-event>Finish Event</button></article>`;
    setTimeout(()=>{ document.querySelectorAll(".settings-section").forEach((section,index)=>{ if (remembered) section.open=Boolean(remembered[index]); section.addEventListener("toggle",()=>sessionStorage.setItem("ccc-event-sections",JSON.stringify([...document.querySelectorAll(".settings-section")].map((item)=>item.open)))); }); },0);
    return html;
  }

  function organizerBadges() {
    const volunteerBadges = state.volunteers.filter((item)=>item.currentEvent);
    const childBadges = state.applications.filter((item)=>!item.archived).flatMap((household)=>household.children.filter((child)=>child.decision==="approved").map((child)=>({child,household})));
    return `${heading("Event-day printing", "Print badges", "Horizontal adhesive volunteer badges and vertical photo badges for participating children.", `<button class="button button--green" type="button" data-print-badges="all">Print all badges</button>`)}
      <div class="badge-settings panel"><div class="field"><label for="volunteer-badge-stock">Volunteer sticker sheet<select id="volunteer-badge-stock" data-badge-setting="volunteer"><option value="avery-8395">Avery 8395 · 3⅜ × 2⅓ in · 8 per sheet</option><option value="horizontal-35">Generic horizontal · 3½ × 2¼ in</option></select></label></div><div class="field"><label for="child-badge-size">Child badge holder insert<select id="child-badge-size" data-badge-setting="child"><option value="vertical-3x4">Vertical · 3 × 4 in · recommended</option><option value="vertical-225x35">Vertical · 2¼ × 3½ in</option></select></label></div><p>The preview proportions below change with your selection. Your browser's print dialog should remain at 100% / Actual Size.</p></div>
      <div class="badge-section-heading"><div><h2 class="section-title">Volunteer badges</h2><p>Horizontal removable stickers with volunteer name, role, and Campbell's Crew Cares logo.</p></div><button class="button button--light" type="button" data-print-badges="volunteers">Print all volunteer badges</button></div><div class="badge-grid badge-grid--volunteers">${volunteerBadges.map((person)=>`<article class="badge-card badge-card--volunteer" data-badge-id="${esc(person.id)}" data-badge-kind="volunteer"><img src="../assets/images/ccc-logo.png" alt=""><div><span>Campbell's Crew Cares</span><strong>${esc(person.name)}</strong><b>${esc(person.role)}</b></div><button class="button button--small button--ghost" type="button" data-print-badge="${esc(person.id)}">Print this badge</button></article>`).join("")}</div>
      <div class="badge-section-heading"><div><h2 class="section-title">Child badges</h2><p>Vertical cardstock inserts for a clear badge holder, with a photo and full name.</p></div><button class="button button--light" type="button" data-print-badges="children">Print all child badges</button></div><div class="badge-grid badge-grid--children">${childBadges.map(({child,household})=>`<article class="badge-card badge-card--recipient" data-badge-id="${esc(child.id)}" data-badge-kind="child"><div class="badge-photo">${child.photoName?"Child photo":"Photo"}</div><img class="badge-logo" src="../assets/images/ccc-logo.png" alt=""><span>Campbell's Crew Cares</span><strong>${esc(child.name)}</strong><b>${esc(household.id)}</b><div><button class="button button--small button--ghost" type="button" data-print-badge="${esc(child.id)}">One badge</button><button class="button button--small button--green" type="button" data-print-badge="${esc(child.id)}-bag">Badge + bag copy</button></div></article>`).join("")}</div>
      <article class="badge-size-note"><h2>Current badge sizes</h2><p><strong>Volunteers:</strong> <span id="volunteer-size-summary">Avery 8395-compatible removable adhesive badges, 3⅜ × 2⅓ inches, horizontal, 8 per letter-size sheet.</span></p><p><strong>Children:</strong> <span id="child-size-summary">3 × 4 inch vertical cardstock inserts for clear badge holders.</span> “Badge + bag copy” prints two identical copies for that child.</p><p>Always print at <strong>100% / Actual Size</strong>; disable “Fit to page” so label alignment remains accurate.</p></article>`;
  }

  function organizerBadgesV9() {
    const volunteerBadges = state.volunteers.filter((item) => item.currentEvent === state.event.title);
    const childBadges = state.applications.filter((item) => !item.archived && item.eventName === state.event.title).flatMap((household) => household.children.filter((child) => child.decision === "approved").map((child) => ({ child, household })));
    const isFoodBag = state.event.type === "food-bag";
    const actions = `<div class="heading-actions"><button class="button button--green" type="button" data-print-badges="volunteers">Download volunteer badges</button>${isFoodBag ? "" : `<button class="button button--light" type="button" data-print-badges="children">Download child badges</button>`}</div>`;
    const childControls = isFoodBag ? "" : `<div class="field"><label for="child-badge-size">Child badge holder insert<select id="child-badge-size" data-badge-setting="child"><option value="vertical-3x4">Vertical · 3 × 4 in · 4 per page</option><option value="vertical-225x35">Vertical · 2¼ × 3½ in · up to 9 per page</option></select></label></div>`;
    const childBadgesSection = isFoodBag ? "" : `<div class="badge-section-heading"><div><h2 class="section-title">Child badges</h2><p>${childBadges.length} vertical cardstock inserts, arranged several to a page whenever space permits.</p></div></div><div class="badge-grid badge-grid--children">${childBadges.map(({ child, household }) => `<article class="badge-card badge-card--recipient" data-badge-id="${esc(child.id)}" data-badge-kind="children"><div class="badge-photo">${child.photoName ? "Child photo" : "Photo"}</div><img class="badge-logo" src="../assets/images/ccc-logo.png" alt=""><span>Campbell's Crew Cares</span><strong>${esc(child.name)}</strong><b>${esc(household.id)}</b></article>`).join("")}</div>`;
    const sizeNote = isFoodBag ? `<article class="badge-size-note"><h2>Current badge size</h2><p><strong>Volunteers:</strong> <span id="volunteer-size-summary">Avery 8395-compatible removable adhesive badges, 3⅜ × 2⅓ inches, horizontal, 8 per letter-size sheet.</span></p><p>Always print at <strong>100% / Actual Size</strong>; disable “Fit to page” so label alignment remains accurate.</p></article>` : `<article class="badge-size-note"><h2>Current badge sizes</h2><p><strong>Volunteers:</strong> <span id="volunteer-size-summary">Avery 8395-compatible removable adhesive badges, 3⅜ × 2⅓ inches, horizontal, 8 per letter-size sheet.</span></p><p><strong>Children:</strong> <span id="child-size-summary">3 × 4 inch vertical cardstock inserts, arranged 4 per letter-size page.</span></p><p>Always print at <strong>100% / Actual Size</strong>; disable “Fit to page” so badge measurements remain accurate.</p></article>`;
    return `${heading("Event-day printing", "Print badges", isFoodBag ? "Create volunteer badge sheets for this food bag event." : "Create one volunteer badge file or one child badge file. Child badges are grouped efficiently on each page.", actions)}
      <div class="badge-settings panel"><div class="field"><label for="volunteer-badge-stock">Volunteer sticker sheet<select id="volunteer-badge-stock" data-badge-setting="volunteer"><option value="avery-8395">Avery 8395 · 3⅜ × 2⅓ in · 8 per sheet</option><option value="horizontal-35">Generic horizontal · 3½ × 2¼ in</option></select></label></div>${childControls}<p>Each download button opens the browser's print screen. Choose <strong>Save as PDF</strong> to download the badge file, or select a printer to print immediately.</p></div>
      <div class="badge-section-heading"><div><h2 class="section-title">Volunteer badges</h2><p>${volunteerBadges.length} horizontal adhesive badges with volunteer name, role, and Campbell's Crew Cares logo.</p></div></div><div class="badge-grid badge-grid--volunteers">${volunteerBadges.map((person) => `<article class="badge-card badge-card--volunteer" data-badge-id="${esc(person.id)}" data-badge-kind="volunteers"><img src="../assets/images/ccc-logo.png" alt=""><div><span>Campbell's Crew Cares</span><strong>${esc(person.name)}</strong><b>${esc(person.role)}</b></div></article>`).join("")}</div>
      ${childBadgesSection}${sizeNote}`;
  }

  function organizerEmailsV8() {
    return organizerEmails().replace('<div class="email-layout">', `<article class="panel email-sender"><div><p class="eyebrow">Authorized sender</p><h2>Submission@Campbellscrew.com</h2><p>Signup confirmations, reminders, application notices, and organizer alerts will use this address once secure delivery is connected.</p></div><div><strong>Organizer notifications</strong><p>Campbell@Campbellscrew.com</p></div></article><div class="email-layout">`);
  }

  function organizerReportsV8() {
    const latest = state.reports[0];
    const stats = state.publicStats || { families: 640, children: 1280, volunteers: 910, years: 9 };
    const activityLabel = (report) => report.eventType === "food-bag" ? `${report.bagsMade}/${report.bagsPlanned} bags made` : `${report.childrenAttended}/${report.childrenRegistered} children`;
    const latestMetric = latest?.eventType === "food-bag" ? `<article class="metric-card"><span>Latest bags made</span><strong>${latest.bagsMade}/${latest.bagsPlanned}</strong></article>` : `<article class="metric-card"><span>Latest child attendance</span><strong>${latest?.childrenAttended}/${latest?.childrenRegistered}</strong></article>`;
    return `${heading("Event records", "Reports & history", "Permanent completed-event records and editable public impact totals.")}<article class="panel"><div class="panel-header"><div><h2>Public impact statistics</h2><p>Edit the totals shown on the public Campbell's Crew Cares website.</p></div></div><form id="impact-form" class="form-grid"><div class="field"><label>Families served<input name="families" type="number" value="${stats.families}"></label></div><div class="field"><label>Children served<input name="children" type="number" value="${stats.children}"></label></div><div class="field"><label>Volunteers engaged<input name="volunteers" type="number" value="${stats.volunteers}"></label></div><div class="field"><label>Years serving<input name="years" type="number" value="${stats.years}"></label></div><button class="button button--green" type="submit">Save public totals</button></form></article><article class="panel"><h2>Completed event records</h2>${state.reports.map((report)=>`<div class="report-row"><span><strong>${esc(report.event)}</strong><small>${esc(report.status)} · Permanent record</small></span><b>${activityLabel(report)} · ${report.volunteerHours} hours · $${Number(report.totalSpent).toLocaleString()}</b><button class="button button--small button--ghost" type="button" data-demo-action="view-report">View details</button></div>`).join("")}</article>${latest?`<div class="metric-grid">${latestMetric}<article class="metric-card"><span>Latest volunteer hours</span><strong>${latest.volunteerHours}</strong></article><article class="metric-card"><span>Latest spending</span><strong>$${Number(latest.totalSpent).toLocaleString()}</strong></article></div>`:""}`;
  }

  function bindOrganizer(subroute) {
    if (subroute === "events") {
      const eventForm = document.querySelector("#event-form");
      const saveBar = document.querySelector(".sticky-save");
      const markEventDirty = () => {
        if (!saveBar) return;
        saveBar.classList.add("is-dirty");
        const message = saveBar.querySelector("span"); const button = saveBar.querySelector("button");
        if (message) message.textContent = "You have unsaved changes.";
        if (button) button.textContent = "Save changes →";
      };
      eventForm?.addEventListener("input", markEventDirty);
      eventForm?.addEventListener("change", markEventDirty);
      if (eventForm) eventForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const openSections = [...document.querySelectorAll(".settings-section")].map((section) => section.open);
        const data = new FormData(event.currentTarget);
        ["title", "date", "time", "location", "address", "volunteerStatus", "volunteerCode"].forEach((key) => { state.event[key] = String(data.get(key) || "").trim(); });
        if (state.event.type !== "food-bag") ["recipientStatus", "recipientCode"].forEach((key) => { state.event[key] = String(data.get(key) || "").trim(); });
        ["volunteerCapacity"].forEach((key) => { state.event[key] = Number(data.get(key)); });
        if (state.event.type !== "food-bag") ["recipientCapacity", "shoppingBudget"].forEach((key) => { state.event[key] = Number(data.get(key)); });
        state.event.roles.forEach((role) => {
          role.enabled = data.has(`role-enabled-${role.id}`);
          role.title = String(data.get(`role-title-${role.id}`) || role.title).trim();
          role.shift = String(data.get(`role-shift-${role.id}`) || role.shift).trim();
          role.capacity = Number(data.get(`role-capacity-${role.id}`) || 0);
        });
        Object.keys(state.event.questions).forEach((key) => { state.event.questions[key] = data.has(`question-${key}`); });
        if (state.event.type === "food-bag") {
          state.event.bagGoal = Number(data.get("bagGoal") || 0);
          state.event.bagItems.forEach((item) => { item.label = String(data.get(`bag-item-label-${item.id}`) || "").trim(); item.quantity = Number(data.get(`bag-item-quantity-${item.id}`) || 0); });
        } else state.event.budgetItems.forEach((item) => {
          item.enabled = data.has(`budget-enabled-${item.id}`);
          item.amount = Number(data.get(`budget-amount-${item.id}`) || 0);
        });
        state.activity.unshift({ text: "Event settings were updated by Organizer.", time: "Just now" });
        try {
          await saveLiveEvent(state.event);
        } catch (error) {
          toast(error.message || "The event could not be saved.");
          return;
        }
        saveState();
        toast("Event changes saved.");
        renderOrganizer("events");
        document.querySelectorAll(".settings-section").forEach((section, index) => { section.open = openSections[index]; });
      });
      document.querySelectorAll('[name^="budget-enabled-"], [name^="budget-amount-"]').forEach((input) => input.addEventListener("input", () => {
        const total = state.event.budgetItems.reduce((sum, item) => {
          const enabled = document.querySelector(`[name="budget-enabled-${item.id}"]`).checked;
          const amount = Number(document.querySelector(`[name="budget-amount-${item.id}"]`).value || 0);
          return sum + (enabled ? amount : 0);
        }, 0);
        document.querySelector("#budget-total").textContent = `$${total}`;
      }));
      const refreshBagTotals = () => {
        const goal = Number(document.querySelector("#bag-goal")?.value || 0);
        (state.event.bagItems || []).forEach((item) => { const total = document.querySelector(`[data-bag-total="${item.id}"]`); const quantity = Number(document.querySelector(`[name="bag-item-quantity-${item.id}"]`)?.value || 0); if (total) total.textContent = String(goal * quantity); });
      };
      document.querySelectorAll("#bag-goal, [name^=\"bag-item-quantity-\"]").forEach((input) => input.addEventListener("input", refreshBagTotals));
      const addBagItem = document.querySelector("[data-add-bag-item]");
      if (addBagItem) addBagItem.addEventListener("click", () => { state.event.bagItems.push(makeBagItem("")); saveState(); renderOrganizer("events"); });
      const addRole = document.querySelector("[data-add-role]");
      if (addRole) addRole.addEventListener("click", () => {
        const newRole = { id: `role-${Date.now()}`, title: "", shift: "", capacity: 0, enabled: true, description: "" };
        state.event.roles.push(newRole);
        saveState();
        renderOrganizer("events");
        document.querySelector(`[name="role-title-${newRole.id}"]`)?.focus();
      });
      const addRoutineItem = document.querySelector("[data-add-routine-item]");
      if (addRoutineItem) addRoutineItem.addEventListener("click", () => { const picker = document.querySelector("#routine-bag-item"); const label = String(picker?.value || ""); if (!label) { toast("Choose a routine item first."); return; } if (state.event.bagItems.some((item) => item.label.toLowerCase() === label.toLowerCase())) { toast(`${label} is already in this bag plan.`); return; } state.event.bagItems.push(makeBagItem(label)); saveState(); renderOrganizer("events"); });
      const addRoutineSet = document.querySelector("[data-add-routine-set]");
      if (addRoutineSet) addRoutineSet.addEventListener("click", () => { const existing = new Set(state.event.bagItems.map((item) => item.label.toLowerCase())); const additions = foodBagRoutineItems.filter((item) => !existing.has(item.toLowerCase())).map((item, index) => makeBagItem(item, index)); if (!additions.length) { toast("Every routine item is already in this bag plan."); return; } state.event.bagItems.push(...additions); saveState(); toast(`${additions.length} routine items added.`); renderOrganizer("events"); });
      document.querySelectorAll("[data-remove-bag-item]").forEach((button) => button.addEventListener("click", () => { if (state.event.bagItems.length === 1) { toast("Keep at least one item in the bag plan."); return; } state.event.bagItems = state.event.bagItems.filter((item) => item.id !== button.dataset.removeBagItem); saveState(); renderOrganizer("events"); }));
      const printBagGuide = document.querySelector("[data-print-bag-guide]");
      if (printBagGuide) printBagGuide.addEventListener("click", () => { document.body.dataset.printBagGuide = "true"; window.print(); });
    }

    const volunteerSearch = document.querySelector("#volunteer-search");
    if (volunteerSearch) volunteerSearch.addEventListener("input", () => { const route = volunteerView === "current" ? "volunteer-signups" : "volunteers"; main.innerHTML = organizerShell(route, organizerVolunteers(volunteerSearch.value)); bindOrganizer(route); const next = document.querySelector("#volunteer-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const applicationSearch = document.querySelector("#application-search");
    if (applicationSearch) applicationSearch.addEventListener("input", () => { const route = applicationView === "log" ? "recipient-history" : "applications"; main.innerHTML = organizerShell(route, organizerApplications(applicationSearch.value)); bindOrganizer(route); const next = document.querySelector("#application-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });
    const checkinSearch = document.querySelector("#checkin-search");
    if (checkinSearch) checkinSearch.addEventListener("input", () => { main.innerHTML = organizerShell("checkin", organizerCheckin(checkinSearch.value)); bindOrganizer("checkin"); const next = document.querySelector("#checkin-search"); next.focus(); next.setSelectionRange(next.value.length, next.value.length); });

    const sort = document.querySelector("#application-sort");
    if (sort) sort.addEventListener("change", () => { applicationSort = sort.value; renderOrganizer("applications"); });
    document.querySelectorAll("[data-sort-group]").forEach((button) => button.addEventListener("click", () => {
      const group = button.dataset.sortGroup; const value = button.dataset.sortValue;
      if (group === "volunteers") volunteerSort = value; else if (group === "applications") applicationSort = value; else if (group === "checkin") checkinSort = value; else if (group === "packets") packetSort = value;
      const route = group === "volunteers" && volunteerView === "current" ? "volunteer-signups" : group === "applications" && applicationView === "log" ? "recipient-history" : group;
      renderOrganizer(group === "packets" ? "packets" : group === "checkin" ? "checkin" : route);
    }));
    document.querySelectorAll("[data-volunteer-view]").forEach((button)=>button.addEventListener("click",()=>{volunteerView=button.dataset.volunteerView;renderOrganizer("volunteers");}));
    document.querySelectorAll("[data-application-view]").forEach((button)=>button.addEventListener("click",()=>{applicationView=button.dataset.applicationView;renderOrganizer("applications");}));

    document.querySelectorAll("[data-checkin-volunteer]").forEach((button) => button.addEventListener("click", () => { toggleVolunteerCheckin(button.dataset.checkinVolunteer); renderOrganizer("volunteers"); }));
    document.querySelectorAll("[data-open-application]").forEach((button) => button.addEventListener("click", () => openApplication(button.dataset.openApplication)));
    document.querySelectorAll("[data-checkin-type]").forEach((button) => button.addEventListener("click", () => { checkinType = button.dataset.checkinType; renderOrganizer("checkin"); }));
    document.querySelectorAll("[data-confirm-checkin]").forEach((button) => button.addEventListener("click", () => openCheckinConfirmation(button.dataset.confirmCheckin)));
    document.querySelectorAll("[data-checkin-note]").forEach((button) => button.addEventListener("click", () => openCheckinNote(button.dataset.checkinNote)));
    document.querySelectorAll("[data-print-mode]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      if (window.location.hash !== "#organizer/packets") return;
      clearPrintState();
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
      state.reports.unshift(saved); state.applications.filter((item)=>!item.archived).forEach((item)=>{item.archived=true;item.eventName=state.event.title;}); state.activity.unshift({ text: `${state.event.title} was closed out and its applications moved to the Application Log.`, time: "Just now" }); saveState(); toast("Close-out saved; current applications moved to the permanent Application Log."); navigateOrganizer("reports");
    });
    const addUser = document.querySelector("[data-add-user]");
    if (addUser) addUser.addEventListener("click", openAddUser);
    const finishEvent = document.querySelector("[data-finish-event]");
    if (finishEvent) finishEvent.addEventListener("click", openFinishEvent);
    document.querySelectorAll("[data-create-event]").forEach((button) => button.addEventListener("click", openCreateEvent));
    document.querySelectorAll("[data-active-event]").forEach((select) => select.addEventListener("change", () => { state.activeEventId = select.value; saveState(); renderOrganizer(subroute); }));
    const impactForm = document.querySelector("#impact-form");
    if (impactForm) impactForm.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); state.publicStats = Object.fromEntries(["families","children","volunteers","years"].map((key)=>[key,Number(data.get(key)||0)])); saveState(); toast("Public impact totals saved in this demonstration browser."); });
    const addVolunteer = document.querySelector("[data-add-volunteer]");
    if (addVolunteer) addVolunteer.addEventListener("click", openAddVolunteer);
    configureBadgeFormats();
    document.querySelectorAll("[data-badge-setting]").forEach((select) => select.addEventListener("change", () => applyBadgeFormat(select.dataset.badgeSetting, select.value)));
    document.querySelectorAll("[data-print-badge], [data-print-badges]").forEach((button)=>button.addEventListener("click",(event)=>{
      event.preventDefault(); event.stopPropagation();
      if (window.location.hash !== "#organizer/badges") return;
      clearPrintState();
      const requested = button.dataset.printBadge || "";
      document.body.dataset.printBadge = requested.replace(/-bag$/, "") || "all";
      document.body.dataset.printBadgeGroup = button.dataset.printBadges || "single";
      document.querySelectorAll(".badge-card").forEach((card)=>card.classList.toggle("is-badge-print-target", button.dataset.printBadges === "all" || card.dataset.badgeKind === button.dataset.printBadges || card.dataset.badgeId === requested.replace(/-bag$/, "")));
      if (requested.endsWith("-bag")) { const source=document.querySelector(`[data-badge-id="${requested.replace(/-bag$/,"")}"]`); if(source){const copy=source.cloneNode(true);copy.classList.add("badge-print-copy");copy.querySelectorAll("button").forEach((item)=>item.remove());source.after(copy);} }
      window.print();
    }));
    document.querySelectorAll("[data-demo-action]").forEach((button) => button.addEventListener("click", () => {
      const messages = { duplicate: "A copied event draft would open here; permanent event creation needs the secure database.", create: "The event builder is ready for the secure database phase.", "add-role": "Additional custom roles will save once the secure database is connected.", "new-email": "Use the blast-email composer already shown on this page.", "test-email": "No email was sent; delivery remains disabled in this fictional-data prototype.", closeout: "Complete the close-out worksheet below to save a demonstration report.", "view-report": "The full historical-report view is planned for the next reporting pass.", "user-menu": "User editing will activate with real Google Workspace accounts." }; toast(messages[button.dataset.demoAction] || "This demonstration action is not connected yet.");
    }));
    document.querySelectorAll("[data-preview-role]").forEach((button) => button.addEventListener("click", () => { const role = button.dataset.previewRole; if (role === "Signed out visitor") { portalUser = ""; previewRole = ""; sessionStorage.removeItem("ccc-portal-user"); sessionStorage.removeItem("ccc-preview-role"); renderOrganizer("dashboard"); return; } previewRole = role === "Executive Owner" ? "" : role; if (previewRole) sessionStorage.setItem("ccc-preview-role", previewRole); else sessionStorage.removeItem("ccc-preview-role"); const target = role === "Check-In Staff" ? "organizer/checkin" : "organizer/dashboard"; if (window.location.hash === `#${target}`) renderRoute(); else window.location.hash = target; }));
    const returnOwner = document.querySelector("[data-return-owner]"); if (returnOwner) returnOwner.addEventListener("click", () => { previewRole = ""; sessionStorage.removeItem("ccc-preview-role"); renderOrganizer("dashboard"); });
    const logout = document.querySelector("[data-portal-logout]"); if (logout) logout.addEventListener("click", () => { if (SERVER_AUTH) { window.location.assign("/logout"); return; } portalUser = ""; previewRole = ""; sessionStorage.removeItem("ccc-portal-user"); sessionStorage.removeItem("ccc-preview-role"); renderOrganizer("dashboard"); window.scrollTo(0, 0); });
    const elevate = document.querySelector("[data-elevate]"); if (elevate) elevate.addEventListener("click", () => { const pin = window.prompt("Enter the organizer elevation PIN"); if (pin === TEST_PIN) { previewRole = "Event Administrator"; sessionStorage.setItem("ccc-preview-role", previewRole); renderOrganizer(subroute); } else if (pin !== null) toast("That organizer PIN is incorrect."); });
    document.querySelectorAll("[data-export]").forEach((button) => {
      button.textContent = "Download Excel workbook";
      button.addEventListener("click", () => exportWorkbook(button.dataset.export));
    });
    const reset = document.querySelector("[data-reset-demo]");
    if (reset) reset.addEventListener("click", () => {
      if (!window.confirm("Reset every fictional signup and organizer change in this prototype?")) return;
      state = prepareEventCollection(createDefaultState());
      expandDemoData(state);
      state.volunteers.forEach((volunteer,index)=>{if(volunteer.currentEvent===undefined)volunteer.currentEvent=index<5?state.event.title:"";});
      state.applications.forEach((household)=>{if(household.archived===undefined)household.archived=false;if(!household.eventName)household.eventName=state.event.title;household.children.forEach((child)=>{const parts=String(child.name||"").trim().split(/\s+/);child.firstName=child.firstName||parts[0]||"";child.lastName=child.lastName||parts.slice(1).join(" ")||household.guardian.trim().split(/\s+/).slice(-1)[0];child.name=`${child.firstName} ${child.lastName}`.trim();if(!child.decision)child.decision=household.status==="approved"?"approved":household.status==="info"?"info":"review";});});
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

  function openAddVolunteer() {
    dialogContent.innerHTML = `<form class="dialog-body" id="add-volunteer-form"><p class="eyebrow">Volunteer directory</p><h2 id="dialog-title">Add a volunteer</h2><p>Add someone to the permanent directory and optionally register them for the current event.</p><div class="form-grid"><div class="field"><label>First name<input name="firstName" required></label></div><div class="field"><label>Last name<input name="lastName" required></label></div><div class="field"><label>Email<input name="email" type="email" required></label></div><div class="field"><label>Phone<input name="phone" type="tel" required></label></div><div class="field"><label>Role<select name="role">${state.event.roles.filter((role)=>role.enabled).map((role)=>`<option>${esc(role.title)}</option>`).join("")}</select></label></div><label class="question-toggle"><input type="checkbox" name="currentEvent" checked><span class="switch-control" aria-hidden="true"></span><span><strong>Register for current event</strong><small>${esc(state.event.title)}</small></span></label><div class="field field--span-2"><label>Organizer note<textarea name="notes"></textarea></label></div></div><button class="button button--green" type="submit">Add volunteer →</button></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("#add-volunteer-form").addEventListener("submit",(event)=>{ event.preventDefault(); const data=new FormData(event.currentTarget); const role=String(data.get("role")); const roleRecord=state.event.roles.find((item)=>item.title===role); state.volunteers.push({id:makeId("VOL",state.volunteers),name:`${data.get("firstName")} ${data.get("lastName")}`,email:String(data.get("email")),phone:String(data.get("phone")),role,shift:roleRecord?.shift||"",currentEvent:data.has("currentEvent")?state.event.title:"",notes:String(data.get("notes")||""),history:[],status:"confirmed",checkedIn:false,checkedAt:""}); saveState(); closeDialog(); toast("Volunteer added to the directory."); renderOrganizer("volunteers"); });
  }

  function openFinishEvent() {
    if (state.event.type === "food-bag") { openFinishFoodBagEvent(); return; }
    const currentChildren=state.applications.filter((item)=>!item.archived && item.eventName === state.event.title).reduce((sum,item)=>sum+item.children.length,0);
    const currentVolunteers=state.volunteers.filter((item)=>item.currentEvent === state.event.title).length;
    const checkedChildren = state.applications.filter((item)=>!item.archived && item.eventName === state.event.title).flatMap((item)=>item.children).filter((child)=>child.attendance==="checked").length;
    const checkedVolunteers = state.volunteers.filter((item)=>item.currentEvent === state.event.title && item.checkedIn).length;
    dialogContent.innerHTML=`<form class="dialog-body finish-dialog" id="finish-event-form"><p class="eyebrow">Permanent event close-out</p><h2 id="dialog-title">Finish ${esc(state.event.title)}?</h2><p>Enter final totals. Finishing moves recipient applications to Past Recipients / History and converts current volunteer signups into event history.</p><div class="form-grid"><div class="field"><label>Children registered<input name="childrenRegistered" type="number" value="${currentChildren}" required></label></div><div class="field"><label>Children attended<input name="childrenAttended" type="number" value="${checkedChildren}" required></label></div><div class="field"><label>Volunteers registered<input name="volunteersRegistered" type="number" value="${currentVolunteers}" required></label></div><div class="field"><label>Volunteers attended<input name="volunteersAttended" type="number" value="${checkedVolunteers}" required></label></div><div class="field"><label>Volunteer hours<input name="volunteerHours" type="number" value="0" required></label></div><div class="field"><label>Total event spending<input name="totalSpent" type="number" value="0" required></label></div><div class="field field--span-2"><label>Close-out notes<textarea name="notes"></textarea></label></div></div><div class="finish-confirm"><strong>Slide all the way right to confirm</strong><input id="finish-slider" type="range" min="0" max="100" value="0"><small id="finish-slider-copy">Event is not yet finished.</small></div><button class="button button--danger button--wide" id="finish-submit" type="submit" disabled>Finish Event permanently</button></form>`;
    appDialog.showModal();document.body.classList.add("dialog-open"); const slider=dialogContent.querySelector("#finish-slider");const submit=dialogContent.querySelector("#finish-submit");slider.addEventListener("input",()=>{submit.disabled=Number(slider.value)<100;dialogContent.querySelector("#finish-slider-copy").textContent=submit.disabled?"Keep sliding to confirm.":"Confirmed. You may now finish the event.";});dialogContent.querySelector("#finish-event-form").addEventListener("submit",(event)=>{event.preventDefault();if(Number(slider.value)<100)return;const data=new FormData(event.currentTarget);const num=(key)=>Number(data.get(key)||0);const finishedTitle=state.event.title;state.reports.unshift({event:finishedTitle,status:"Closed out",childrenRegistered:num("childrenRegistered"),childrenAttended:num("childrenAttended"),volunteersRegistered:num("volunteersRegistered"),volunteersAttended:num("volunteersAttended"),volunteerHours:num("volunteerHours"),totalSpent:num("totalSpent"),notes:String(data.get("notes")||"")});state.applications.filter((item)=>!item.archived&&item.eventName===finishedTitle).forEach((item)=>{item.archived=true;});state.volunteers.filter((item)=>item.currentEvent===finishedTitle).forEach((item)=>{item.history=item.history||[];item.history.unshift({event:finishedTitle,role:item.role,result:item.checkedIn?"Attended":(item.attendanceStatus==="excused"?"Excused absence":"No-show")});item.currentEvent="";});state.event.volunteerStatus="closed";state.event.recipientStatus="closed";state.event.closed=true;const next=activeEvents()[0];if(next)state.activeEventId=next.id;state.activity.unshift({text:`${finishedTitle} was finished and moved to permanent history.`,time:"Just now"});saveState();closeDialog();toast("Event finished. Records are now in permanent history.");navigateOrganizer("reports");});
  }

  function openFinishFoodBagEvent() {
    const currentVolunteers = state.volunteers.filter((item) => item.currentEvent === state.event.title).length;
    const checkedIn = state.volunteers.filter((item) => item.currentEvent === state.event.title && item.checkedIn).length;
    dialogContent.innerHTML = `<form class="dialog-body finish-dialog" id="finish-food-bag-form"><p class="eyebrow">Permanent Food Bag Event close-out</p><h2 id="dialog-title">Finish ${esc(state.event.title)}?</h2><p>Enter the final bag and volunteer totals. Finishing keeps the completed event in Reports & History and moves volunteer registrations into their permanent event history.</p><div class="form-grid"><div class="field"><label>Food bags planned<input name="bagsPlanned" type="number" min="0" value="${esc(state.event.bagGoal || 0)}" required></label></div><div class="field"><label>Food bags made<input name="bagsMade" type="number" min="0" value="0" required></label></div><div class="field"><label>Volunteers registered<input name="volunteersRegistered" type="number" min="0" value="${currentVolunteers}" required></label></div><div class="field"><label>Volunteers attended<input name="volunteersAttended" type="number" min="0" value="${checkedIn}" required></label></div><div class="field"><label>Volunteer hours<input name="volunteerHours" type="number" min="0" value="0" required></label></div><div class="field"><label>Total food & supply spending<input name="totalSpent" type="number" min="0" value="0" required></label></div><div class="field field--span-2"><label>Close-out notes<textarea name="notes"></textarea></label></div></div><div class="finish-confirm"><strong>Slide all the way right to confirm</strong><input id="finish-food-slider" type="range" min="0" max="100" value="0"><small id="finish-food-slider-copy">Event is not yet finished.</small></div><button class="button button--danger button--wide" id="finish-food-submit" type="submit" disabled>Finish Food Bag Event permanently</button></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    const slider = dialogContent.querySelector("#finish-food-slider"); const submit = dialogContent.querySelector("#finish-food-submit");
    slider.addEventListener("input", () => { submit.disabled = Number(slider.value) < 100; dialogContent.querySelector("#finish-food-slider-copy").textContent = submit.disabled ? "Keep sliding to confirm." : "Confirmed. You may now finish the event."; });
    dialogContent.querySelector("#finish-food-bag-form").addEventListener("submit", (event) => {
      event.preventDefault(); if (Number(slider.value) < 100) return;
      const data = new FormData(event.currentTarget); const num = (key) => Number(data.get(key) || 0); const finishedTitle = state.event.title;
      state.reports.unshift({ event: finishedTitle, eventType: "food-bag", status: "Closed out", bagsPlanned: num("bagsPlanned"), bagsMade: num("bagsMade"), volunteersRegistered: num("volunteersRegistered"), volunteersAttended: num("volunteersAttended"), volunteerHours: num("volunteerHours"), totalSpent: num("totalSpent"), notes: String(data.get("notes") || "") });
      state.volunteers.filter((item) => item.currentEvent === finishedTitle).forEach((item) => { item.history = item.history || []; item.history.unshift({ event: finishedTitle, role: item.role, result: item.checkedIn ? "Attended" : (item.attendanceStatus === "excused" ? "Excused absence" : "No-show") }); item.currentEvent = ""; });
      state.event.volunteerStatus = "closed"; state.event.recipientStatus = "closed"; state.event.closed = true;
      const next = activeEvents()[0]; if (next) state.activeEventId = next.id;
      state.activity.unshift({ text: `${finishedTitle} was finished and moved to permanent history.`, time: "Just now" }); saveState(); closeDialog(); toast("Food Bag Event finished. Its record is now in Reports & History."); navigateOrganizer("reports");
    });
  }

  function openCreateEvent() {
    dialogContent.innerHTML = `<form class="dialog-body" id="create-event-form"><p class="eyebrow">New event workspace</p><h2 id="dialog-title">Create a new event</h2><p>Choose the event type first. Its management tools are set up specifically for that kind of event.</p><div class="form-grid"><div class="field field--span-2"><label>Event type<select name="eventType" required><option value="shopping">Kids Shopping Event</option><option value="food-bag">Food Bag Event</option></select></label><small>Shopping events include recipient applications and clothing packets. Food Bag Events use a bag plan and order totals instead.</small></div><div class="field field--span-2"><label>Event name<input name="title" placeholder="2027 Winter Clothing for Kids" required></label></div><div class="field"><label>Date<input name="date" type="date" required></label></div><div class="field"><label>Time<input name="time" placeholder="6:00 AM – 10:00 AM" required></label></div><div class="field field--span-2"><label>Location name<input name="location" placeholder="Queen Creek Walmart · Garden Center" required></label></div><div class="field field--span-2"><label>Street address<input name="address" placeholder="21055 E Rittenhouse Rd, Queen Creek, AZ"></label></div><label class="question-toggle"><input type="checkbox" name="volunteerEnabled" checked><span class="switch-control" aria-hidden="true"></span><span><strong>Volunteer signup</strong><small>Use roles, capacity, confirmations, and check-in.</small></span></label><label class="question-toggle" id="recipient-create-option"><input type="checkbox" name="recipientEnabled" checked><span class="switch-control" aria-hidden="true"></span><span><strong>Recipient applications</strong><small>For Kids Shopping Events only.</small></span></label></div><button class="button button--green button--wide" type="submit">Create Event Draft</button></form>`;
    appDialog.showModal(); document.body.classList.add("dialog-open");
    dialogContent.querySelector("#create-event-form").addEventListener("submit", async (event) => {
      event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
      const data = new FormData(event.currentTarget); const fresh = createDefaultState().event; const dateValue = String(data.get("date") || "");
      fresh.title = String(data.get("title") || "").trim();
      fresh.date = dateValue ? new Intl.DateTimeFormat("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric", timeZone:"UTC" }).format(new Date(`${dateValue}T00:00:00Z`)) : "";
      fresh.time = String(data.get("time") || "").trim(); fresh.location = String(data.get("location") || "").trim(); fresh.address = String(data.get("address") || "").trim();
      fresh.id = `event-${Date.now()}`; fresh.type = String(data.get("eventType") || "shopping"); fresh.volunteerEnabled = data.has("volunteerEnabled"); fresh.recipientEnabled = fresh.type === "shopping" && data.has("recipientEnabled");
      fresh.bagGoal = 100; fresh.bagItems = routineBagItems();
      if (fresh.type === "food-bag") fresh.roles = [
        { id: "bag-packer", title: "Bag Packer", description: "Pack planned food items into completed bags.", shift: fresh.time, capacity: 40, enabled: true },
        { id: "inventory", title: "Inventory Checker", description: "Keep item counts organized and restock packing stations.", shift: fresh.time, capacity: 8, enabled: true },
        { id: "supply-runner", title: "Supply Runner", description: "Bring food and packing supplies where they are needed.", shift: fresh.time, capacity: 8, enabled: true },
        { id: "greeter", title: "Greeter / Sign-In", description: "Welcome volunteers and direct them to their station.", shift: fresh.time, capacity: 4, enabled: true },
        { id: "floater", title: "Floater", description: "Go wherever the packing team needs an extra hand.", shift: fresh.time, capacity: 10, enabled: true }
      ];
      fresh.volunteerStatus = "closed"; fresh.recipientStatus = "closed"; fresh.closed = false;
      if (SERVER_AUTH) {
        try {
          const response = await fetch("/portal-api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: fresh.title, eventType: fresh.type === "food-bag" ? "food_bag" : "shopping", eventDate: fresh.date || null, status: "draft", settings: fresh }) });
          if (!response.ok) throw new Error("The event could not be created.");
          fresh.id = (await response.json()).id;
        } catch (error) {
          toast(error.message || "The event could not be created.");
          return;
        }
      }
      state.events.push(fresh); state.activeEventId = fresh.id; publicVolunteerEventId = ""; publicRecipientEventId = ""; sessionStorage.removeItem("ccc-public-volunteer-event"); sessionStorage.removeItem("ccc-public-recipient-event"); state.activity.unshift({ text:`${fresh.title} was created as a new event draft.`, time:"Just now" }); saveState(); closeDialog(); toast("New event draft created. Signups remain closed until you open them."); renderOrganizer("events");
    });
    const typeSelect = dialogContent.querySelector('[name="eventType"]'); const recipientOption = dialogContent.querySelector("#recipient-create-option");
    typeSelect.addEventListener("change", () => { const foodBag = typeSelect.value === "food-bag"; recipientOption.hidden = foodBag; recipientOption.querySelector("input").disabled = foodBag; });
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
      <div class="dialog-section"><h3>Independent child decisions</h3><p class="field-help">Choose a separate outcome for every child in this household.</p>${item.children.map((child) => `<div class="child-card"><div class="child-card__heading"><strong>${esc(child.name)} · Age ${esc(child.age)} · ${esc(child.gender)}</strong>${statusPill(child.decision || "review")}</div><p>Shirt ${esc(child.shirt)} · Pants ${esc(child.pants)} · Shoes ${esc(child.shoes)} · Underwear ${esc(child.underwear)} · Coat ${esc(child.coat)}</p><p><strong>Preferences:</strong> ${esc(child.preferences)}</p><p><strong>Accommodations:</strong> ${esc(child.accommodations)}</p><div class="child-decision-actions"><button type="button" data-child-decision="approved" data-child-id="${esc(child.id)}">Approve</button><button type="button" data-child-decision="info" data-child-id="${esc(child.id)}">Needs information</button><button type="button" data-child-decision="waitlisted" data-child-id="${esc(child.id)}">Waitlist</button><button type="button" data-child-decision="declined" data-child-id="${esc(child.id)}">Decline</button></div></div>`).join("")}</div></div>`;
    appDialog.showModal();
    document.body.classList.add("dialog-open");
    dialogContent.querySelectorAll("[data-child-decision]").forEach((button) => button.addEventListener("click", () => {
      if (item.archived) { toast("Closed-out application records are read-only."); return; }
      const child = item.children.find((record) => record.id === button.dataset.childId); if (!child) return;
      child.decision = button.dataset.childDecision;
      const decisions = item.children.map((record) => record.decision);
      item.status = decisions.every((status) => status === decisions[0]) ? decisions[0] : "mixed";
      item.updated = false; state.activity.unshift({ text: `${child.name} in ${item.id} was marked ${formatStatus(child.decision)}.`, time: "Just now" }); saveState(); toast(`${child.name} marked ${formatStatus(child.decision)}.`); closeDialog(); renderOrganizer("applications");
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

  function clearPrintState() {
    delete document.body.dataset.printMode;
    delete document.body.dataset.printChild;
    delete document.body.dataset.printBadge;
    delete document.body.dataset.printBadgeGroup;
    delete document.body.dataset.printBagGuide;
    document.querySelectorAll(".badge-print-copy").forEach((copy)=>copy.remove());
    document.querySelectorAll(".badge-card").forEach((card)=>card.classList.remove("is-badge-print-target"));
    document.querySelectorAll(".packet-card").forEach((card)=>card.classList.remove("is-print-target"));
  }

  const badgeFormats = {
    "avery-8395": { label:"Avery 8395 name badge", width:3.375, height:2.333, columns:2, perPage:8, orientation:"horizontal", description:"Avery 8395 name badge · 3⅜ × 2⅓ in · horizontal · 8 per letter page" },
    "name-tag-35x225": { label:"Standard name tag", width:3.5, height:2.25, columns:2, perPage:8, orientation:"horizontal", description:"Standard name tag · 3½ × 2¼ in · horizontal · 8 per letter page" },
    "business-card": { label:"Business card", width:3.5, height:2, columns:2, perPage:10, orientation:"horizontal", description:"Business card · 3½ × 2 in · horizontal · 10 per letter page" },
    "large-horizontal": { label:"Large event badge", width:4, height:3, columns:2, perPage:6, orientation:"horizontal", description:"Large event badge · 4 × 3 in · horizontal · 6 per letter page" },
    "vertical-3x4": { label:"Standard holder insert", width:3, height:4, columns:2, perPage:4, orientation:"vertical", description:"Standard holder insert · 3 × 4 in · vertical · 4 per letter page" },
    "vertical-225x35": { label:"Compact holder insert", width:2.25, height:3.5, columns:3, perPage:9, orientation:"vertical", description:"Compact holder insert · 2¼ × 3½ in · vertical · 9 per letter page" },
    "standard-id": { label:"Standard ID badge", width:2.125, height:3.375, columns:3, perPage:9, orientation:"vertical", description:"Standard ID badge · 2⅛ × 3⅜ in · vertical · 9 per letter page" },
    "photo-card": { label:"Large photo card", width:4, height:6, columns:2, perPage:2, orientation:"vertical", description:"Large photo card · 4 × 6 in · vertical · 2 per letter page" }
  };

  function applyBadgeFormat(kind, value) {
    const format = badgeFormats[value] || badgeFormats[kind === "volunteer" ? "avery-8395" : "vertical-3x4"];
    const prefix = `--${kind}-badge-`;
    document.body.dataset[`${kind}BadgeSize`] = value;
    document.body.dataset[`${kind}BadgeOrientation`] = format.orientation;
    document.body.style.setProperty(`${prefix}width`, `${format.width}in`);
    document.body.style.setProperty(`${prefix}height`, `${format.height}in`);
    document.body.style.setProperty(`${prefix}columns`, String(format.columns));
    document.body.style.setProperty(`${prefix}ratio`, `${format.width} / ${format.height}`);
    const summary = document.querySelector(kind === "volunteer" ? "#volunteer-size-summary" : "#child-size-summary");
    if (summary) summary.textContent = format.description;
  }

  function configureBadgeFormats() {
    document.querySelectorAll("[data-badge-setting]").forEach((select) => {
      const kind = select.dataset.badgeSetting; const fallback = kind === "volunteer" ? "avery-8395" : "vertical-3x4"; const selected = badgeFormats[select.value] ? select.value : fallback;
      select.innerHTML = Object.entries(badgeFormats).map(([value, format]) => `<option value="${value}">${format.description}</option>`).join("");
      select.value = selected;
      const label = select.closest("label"); const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (text) text.nodeValue = kind === "volunteer" ? "Volunteer badge format" : "Child badge format";
      applyBadgeFormat(kind, selected);
    });
  }

  function exportWorkbook(type) {
    if (!window.CCCXlsx) {
      toast("The Excel exporter could not load. Please refresh and try again.");
      return;
    }
    const sheets = type === "volunteers" ? volunteerWorkbookSheets() : type === "bag-plan" ? bagPlanWorkbookSheets() : applicationWorkbookSheets();
    window.CCCXlsx.downloadWorkbook(`campbells-crew-${type}-demo.xlsx`, sheets);
    toast(`${type === "volunteers" ? "Volunteer" : type === "bag-plan" ? "Food bag order" : "Application"} Excel workbook created.`);
  }

  function volunteerWorkbookSheets() {
    const directory = [["Volunteer ID", "Name", "Email", "Phone", "Current event", "Current role", "Current shift", "Status", "Organizer notes"]];
    const history = [["Volunteer ID", "Volunteer name", "Event", "Role", "Result"]];
    state.volunteers.forEach((item) => {
      directory.push([item.id, item.name, item.email, item.phone, item.currentEvent || "", item.role || "", item.shift || "", item.currentEvent ? "Currently registered" : "Past volunteer", item.notes || ""]);
      (item.history || []).forEach((entry) => history.push([item.id, item.name, entry.event || "", entry.role || "", entry.result || ""]));
    });
    return [{ name: "Volunteer Directory", rows: directory }, { name: "Event History", rows: history }];
  }

  function applicationWorkbookSheets() {
    const households = [["Application ID", "Event", "Responsible party", "Email", "Phone", "Address", "City", "ZIP", "Referral", "Emergency contact", "Emergency phone", "Relationship", "Submitted", "Status", "Updated since review", "Archived"]];
    const children = [["Application ID", "Child ID", "First name", "Last name", "Birthdate", "Age", "Gender / sizing category", "Shirt", "Pants", "Shoes", "Socks", "Underwear", "Coat", "Preferences", "Accommodations", "Decision", "Attendance", "Attendance note"]];
    const flags = [["Application ID", "Responsible party", "Flag"]];
    const attendance = [["Application ID", "Responsible party", "Event", "Result"]];
    state.applications.forEach((item) => {
      households.push([item.id, item.eventName || state.event.title, item.guardian, item.email, item.phone, item.address, item.city, item.zip, item.referral, item.emergencyName, item.emergencyPhone, item.emergencyRelation, item.submitted, formatStatus(item.status), item.updated ? "Yes" : "No", item.archived ? "Yes" : "No"]);
      (item.children || []).forEach((child) => children.push([item.id, child.id, child.firstName || child.name, child.lastName || "", child.birthdate || "", child.age ?? "", child.gender || "", child.shirt || "", child.pants || "", child.shoes || "", child.socks || "", child.underwear || "", child.coat || "", child.preferences || "", child.accommodations || "", formatStatus(child.decision || item.status), formatStatus(child.attendance || "expected"), child.attendanceNote || ""]));
      (item.flags || []).forEach((flag) => flags.push([item.id, item.guardian, flag]));
      (item.previousAttendance || []).forEach((entry) => attendance.push([item.id, item.guardian, entry.event || "", entry.result || ""]));
    });
    return [{ name: "Households", rows: households }, { name: "Children", rows: children }, { name: "Flags", rows: flags }, { name: "Attendance History", rows: attendance }];
  }

  function bagPlanWorkbookSheets() {
    const plan = [["Campbell's Crew Cares Food Bag Order"], ["Event", state.event.title], ["Bag goal", state.event.bagGoal], [], ["Item", "Quantity per bag", "Total to order"]];
    (state.event.bagItems || []).forEach((item) => plan.push([item.label, item.quantity, Number(item.quantity || 0) * Number(state.event.bagGoal || 0)]));
    return [{ name: "Food Bag Order", rows: plan }];
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
  window.addEventListener("afterprint", clearPrintState);

  async function boot() {
    if (SERVER_AUTH) {
      try {
        await loadLiveEvents();
        await loadLiveVolunteers();
      } catch (error) {
        main.innerHTML = `<section class="page-content"><article class="content-card"><h1>Organizer records could not load</h1><p>Please refresh the page. No changes were made.</p></article></section>`;
        lockScreen.hidden = true;
        appShell.hidden = false;
        return;
      }
    }
    setUnlocked(SERVER_AUTH || sessionStorage.getItem(SESSION_KEY) === "yes");
  }

  void boot();
})();

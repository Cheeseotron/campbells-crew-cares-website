const app = document.querySelector("#app");
const path = location.pathname;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);

async function compressPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Please choose a JPG, PNG, or WebP photo.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Please choose a photo smaller than 8 MB.");
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  return new Promise((resolve) => canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  }, "image/jpeg", 0.78));
}

async function load() {
  const response = await fetch("/portal-api/public/events");
  const data = await response.json();
  if (path.startsWith("/organizer")) {
    app.innerHTML = `<div class="eyebrow">Campbell's Crew Cares</div><h1>You're signed in</h1><p>Your Executive Owner session is active. The live organizer workspace is being connected to the new database now.</p><p class="closed">Public signup remains closed until you open an event from the finished workspace.</p>`;
    return;
  }
  const kind = path === "/apply" ? "recipient application" : "volunteer opportunity";
  if (data.mode !== "open" || !data.events.length) {
    app.innerHTML = `<div class="eyebrow">Campbell's Crew Cares</div><h1>${kind} updates</h1><p>There are no open ${kind}s right now. Please check back soon.</p><p class="closed">This page is ready for the next event, but registration is currently closed.</p>`;
    return;
  }
  const events = data.events.filter((event) => path !== "/apply" || event.event_type === "shopping");
  if (!events.length) {
    app.innerHTML = `<div class="eyebrow">Campbell's Crew Cares</div><h1>Applications are closed</h1><p>There are no open shopping events accepting recipient applications right now.</p>`;
    return;
  }
  const choices = events.map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.title)}${event.event_date ? ` — ${escapeHtml(event.event_date)}` : ""}</option>`).join("");
  if (path === "/apply") {
    app.innerHTML = `<div class="eyebrow">Campbell's Crew Cares</div><h1>Apply for help</h1><p>Applications are reviewed by the Campbell's Crew team. Submitting does not guarantee acceptance.</p><div id="notice"></div><form class="form" id="application"><label>Event<select name="eventId">${choices}</select></label><label>Responsible party name<input required name="guardianName" autocomplete="name"></label><label>Email<input required name="email" type="email" autocomplete="email"></label><label>Phone<input required name="phone" type="tel" autocomplete="tel"></label><label>Child's first name<input required name="firstName"></label><label>Child's last name<input required name="lastName"></label><label>Child photo <input name="childPhoto" type="file" accept="image/jpeg,image/png,image/webp"><span class="helper">Optional. It is resized and compressed before private storage; it is never published publicly.</span></label><label>Notes or accommodations<textarea name="notes"></textarea></label><button>Submit application →</button></form>`;
  } else {
    app.innerHTML = `<div class="eyebrow">Campbell's Crew Cares</div><h1>Volunteer</h1><p>Choose an open event, then tell us how you would like to help.</p><div id="notice"></div><form class="form" id="volunteer"><label>Event<select name="eventId">${choices}</select></label><label>Your name<input required name="name" autocomplete="name"></label><label>Email<input required name="email" type="email" autocomplete="email"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label><label>Volunteer role<input required name="role" placeholder="For example, Shopper"></label><label class="helper"><input name="alertOptIn" type="checkbox"> I would like future volunteer-event alerts.</label><button>Register to volunteer →</button></form>`;
  }
  const form = document.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const photoDataUrl = path === "/apply" && form.childPhoto.files[0] ? await compressPhoto(form.childPhoto.files[0]) : "";
    const body = path === "/apply" ? { ...values, children: [{ firstName: values.firstName, lastName: values.lastName, photoDataUrl }] } : { ...values, alertOptIn: form.alertOptIn.checked };
    delete body.childPhoto;
    const result = await fetch(path === "/apply" ? "/portal-api/public/applications" : "/portal-api/public/volunteer-signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const reply = await result.json();
    const notice = document.querySelector("#notice");
    notice.className = `notice${result.ok ? " success" : ""}`;
    notice.textContent = reply.message || reply.error || "Please try again.";
    if (result.ok) form.reset();
  });
}

load().catch(() => { app.innerHTML = "<div class=\"eyebrow\">Campbell's Crew Cares</div><h1>Please try again</h1><p>We could not load this page just now.</p>"; });

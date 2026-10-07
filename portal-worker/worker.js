import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from "./vendor/pdf-lib.esm.min.js";

const COOKIE_NAME = "ccc_portal_session";
const SESSION_SECONDS = 60 * 60 * 8;
const REMEMBER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const PORTAL_PATHS = new Set(["/volunteer", "/apply", "/login", "/setup", "/organizer", "/forgot-password", "/google-email/connect", "/google-email/callback"]);
const EMAIL_SENDER = "Submission@campbellscrew.com";
const OWNER_ROLES = new Set(["executive_owner"]);
const EDITOR_ROLES = new Set(["executive_owner", "event_admin"]);

function securityHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return headers;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: securityHeaders(new Headers({ "Content-Type": "application/json; charset=utf-8" })) });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function normalizedMatchValue(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function recipientApplicationReference(value = null) {
  if (typeof value === "string" && /^CCC-\d{4}$/.test(value)) return value;
  if (value) {
    let hash = 2166136261;
    for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return `CCC-${String((hash >>> 0) % 10000).padStart(4, "0")}`;
  }
  return `CCC-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0")}`;
}

function photoFromDataUrl(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > 1024 * 1024) return null;
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

function base64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function makeSession(user, secret, lifetime = SESSION_SECONDS) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ id: user.id, role: user.role, expires: Math.floor(Date.now() / 1000) + lifetime })));
  return `${payload}.${base64Url(await hmac(secret, payload))}`;
}

async function readSession(request, env) {
  if (!env.PORTAL_SESSION_SECRET) return null;
  const cookie = (request.headers.get("Cookie") || "").split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const [payload, signature, extra] = cookie.slice(COOKIE_NAME.length + 1).split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = base64Url(await hmac(env.PORTAL_SESSION_SECRET, payload));
    if (!constantTimeEqual(signature, expected)) return null;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (!session.id || !session.role || session.expires <= Math.floor(Date.now() / 1000)) return null;
    const user = await env.DB.prepare("SELECT id, email, display_name, role, status FROM users WHERE id = ?").bind(session.id).first();
    return user?.status === "active" ? user : null;
  } catch { return null; }
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left)); const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function passwordHash(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  // Cloudflare's free Worker CPU allowance is deliberately short. Ten thousand
  // iterations keeps an interactive sign-in below that cap; login throttling is
  // handled separately at the edge rather than allowing a Worker exception.
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 10000 }, material, 256);
  return base64Url(new Uint8Array(bits));
}

function loginPage(message = "", status = 200) {
  const alert = `<style>.remember input{appearance:checkbox;-webkit-appearance:checkbox;cursor:pointer}</style>${message ? `<p role="alert" class="error">${escapeHtml(message)}</p>` : ""}<p id="forgot-password-link"><a style="color:#176b39;font-weight:700" href="/forgot-password">Forgot password?</a></p><script src="/portal-assets/login.js" defer></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Organizer sign in | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--ink);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,580px);padding:clamp(30px,6vw,58px);background:#fff;border-top:7px solid var(--green);box-shadow:0 24px 70px rgba(0,0,0,.32)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:var(--forest)}h1{margin:12px 0 14px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(38px,7vw,52px);line-height:1;letter-spacing:-.045em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:20px 0 7px}input{width:100%;height:52px;padding:12px;border:1px solid #bdc6c0;border-radius:0;background:var(--mist);color:var(--ink);font:400 17px/26px Arial,sans-serif;appearance:none;-webkit-appearance:none}input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-text-fill-color:var(--ink);-webkit-box-shadow:0 0 0 1000px var(--mist) inset;box-shadow:0 0 0 1000px var(--mist) inset;transition:background-color 9999s ease-out 0s}.remember{display:flex;align-items:center;gap:9px;margin:18px 0 0;color:var(--ink);font-size:13px;font-weight:700;letter-spacing:0;text-transform:none;cursor:pointer}.remember input{width:18px;height:18px;padding:0;accent-color:var(--forest)}button{width:100%;min-height:52px;margin-top:22px;border:1px solid var(--green);background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.error{padding:12px;background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Organizer sign in</h1><p>Use the organizer account created for you. Public volunteer and recipient forms stay separate from this private workspace.</p>${alert}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><label class="remember"><input name="remember" type="checkbox"> Stay signed in on this device</label><button>Sign in →</button></form></main></body></html>`;
  return new Response(html, { status, headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

// Keep the initial closed-testing experience entirely server-rendered. This is
// a reliable, no-JavaScript fallback while the fuller interactive workspace is
// connected to its live data screens.
function portalStatusPage(title, detail, action = "") {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,680px);padding:clamp(30px,6vw,58px);background:#fff;border-left:7px solid var(--green);box-shadow:0 18px 55px rgba(17,24,33,.12)}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--forest)}h1{margin:12px 0 14px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,7vw,52px);line-height:1;letter-spacing:-.045em;text-transform:uppercase}p{max-width:57ch;color:var(--gray);line-height:1.55}.action{display:inline-block;margin-top:12px;padding:14px 18px;background:var(--green);color:var(--ink);font-size:11px;font-weight:800;letter-spacing:.12em;text-decoration:none;text-transform:uppercase}</style></head><body><main><div class="eyebrow">Campbell's Crew Cares</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${action}</main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

async function servePortalAsset(request, env, url) {
  const assetUrl = new URL(request.url);
  const route = url.pathname;
  // HTML routing is disabled in Wrangler because these routes intentionally
  // share a single app shell rather than their canonical file locations.
  if (PORTAL_PATHS.has(route) || route.startsWith("/organizer/")) assetUrl.pathname = "/index.html";
  else assetUrl.pathname = route.replace(/^\/portal-assets\/?/, "/");
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = securityHeaders(new Headers(asset.headers));
  if (route === "/apply") {
    const html = (await asset.text())
      .replace("<html lang=\"en\">", "<html lang=\"en\" data-live-public-recipient=\"true\">")
      .replace('href="styles.css"', 'href="/portal-assets/styles.css"')
      .replace('src="xlsx-export.js"', 'src="/portal-assets/xlsx-export.js"')
      .replace('src="app.js"', 'src="/portal-assets/app.js?v=recipient-confirmation-2"')
      .replaceAll("../assets/", "/assets/");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, { status: asset.status, headers });
  }
  return new Response(asset.body, { status: asset.status, headers });
}

function publicStoryPhotos(event, story) {
  const photos = Array.isArray(story?.photos) ? story.photos.slice(0, 12) : [];
  return photos.map((photo, index) => (typeof photo?.key === "string" && photo.key.startsWith(`public-event-stories/${event.id}/`)) ? {
    url: `/portal-api/public/event-stories/${encodeURIComponent(event.id)}/photos/${index}`,
    alt: String(photo.alt || event.title || "Campbell's Crew Cares event photo").slice(0, 220)
  } : null).filter(Boolean);
}

function pdfSafeText(value) {
  return String(value || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").trim();
}

function pdfLines(value, width = 72) {
  const words = pdfSafeText(value).split(/\s+/).filter(Boolean); const lines = []; let line = "";
  words.forEach((word) => { const next = line ? `${line} ${word}` : word; if (next.length > width && line) { lines.push(line); line = word; } else line = next; });
  if (line) lines.push(line); return lines.length ? lines : ["Not provided"];
}

function enabledBudgetTotal(settings = {}) {
  return (Array.isArray(settings.budgetItems) ? settings.budgetItems : [])
    .filter((item) => item?.enabled)
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);
}

function braBudgetEnabled(settings = {}) {
  return (Array.isArray(settings.budgetItems) ? settings.budgetItems : [])
    .some((item) => item?.enabled && /bra/i.test(`${item.id || ""} ${item.label || ""}`));
}

function packetBudgetItems(settings = {}, details = {}) {
  const showBra = braBudgetEnabled(settings) && /^(girl|girls|woman|women)$/i.test(String(details.gender || "").trim());
  const labels = {
    shirts: "Shirt / blouse / dress", pants: "Pants / shorts", underwear: "Undergarments",
    socks: "Socks", shoes: "Shoes", coats: "Coat / jacket", bras: "Bra", toys: "Toys"
  };
  return (Array.isArray(settings.budgetItems) ? settings.budgetItems : [])
    .filter((item) => item?.enabled)
    .filter((item) => !(/bra/i.test(`${item.id || ""} ${item.label || ""}`)) || showBra)
    .map((item) => {
      const isToy = /toy/i.test(`${item.id || ""} ${item.label || ""}`);
      return {
        label: labels[item.id] || item.label || "Item",
        amount: Number(item.amount) || 0,
        // Toys are intentionally a separate, fixed allowance.  Keeping this
        // metadata on the packet row lets every print format state the rule,
        // rather than treating toys as money that can be traded with clothing.
        fixedCap: isToy
      };
    });
}

function childProfilePdf({ child, household, event }) {
  const details = child.details || {}; const application = household.application || {}; const settings = eventSettings(event);
  const line = (text, x, y, size = 10, font = "F1") => `BT /${font} ${size} Tf ${x} ${y} Td (${pdfSafeText(text)}) Tj ET`;
  const wrapped = (label, text, x, y) => [line(label, x, y, 9, "F2"), ...pdfLines(text).slice(0, 4).map((part, index) => line(part, x, y - 15 - index * 13, 10))];
  const name = `${child.first_name || ""} ${child.last_name || ""}`.trim();
  const content = [
    "0.09 0.42 0.22 rg", "72 736 468 4 re f", "0.93 0.96 0.93 rg", "54 54 504 684 re f", "0.11 0.15 0.13 RG", "54 54 504 684 re S",
    line("CAMPBELL'S CREW CARES - CHILD SHOPPING PROFILE", 76, 708, 11, "F2"), line(name, 76, 675, 23, "F2"), line(`${recipientApplicationReference(household.id)} - ${event.title || "Event"}`, 76, 657, 10, "F2"),
    "0.95 0.97 0.95 rg", "76 585 220 48 re f", "316 585 220 48 re f",
    line("RESPONSIBLE PARTY", 88, 616, 8, "F2"), line(household.guardian_name, 88, 597, 12, "F2"), line("EMERGENCY CONTACT", 328, 616, 8, "F2"), line(`${application.emergencyName || "Not provided"} - ${application.emergencyPhone || "Not provided"}`, 328, 597, 11, "F2"),
    line("SIZES", 76, 550, 12, "F2"),
    ...[["SHIRT", details.shirt],["PANTS", details.pants],["SHOES", details.shoes],["UNDERWEAR", details.underwear],["COAT", details.coat]].flatMap(([label, value], index) => [line(label, 76 + index * 93, 526, 8, "F2"), line(value || "Not provided", 76 + index * 93, 509, 11, "F2")]),
    ...wrapped("PREFERENCES", details.preferences, 76, 465), ...wrapped("ACCOMMODATIONS", details.accommodations, 76, 395),
    "0.90 0.97 0.90 rg", "76 116 460 48 re f", "0.09 0.42 0.22 rg", "76 116 5 48 re f", line(`SHOPPING BUDGET: $${enabledBudgetTotal(settings)}`, 94, 139, 12, "F2"), line("VOLUNTEER SPENDING TOTAL: $________________", 302, 139, 10, "F1"),
    line("Campbell's Crew Cares - volunteer packet", 76, 78, 8, "F1")
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function childProfilePrintPage({ child, household, event }) {
  const details = child.details || {}; const application = household.application || {}; const settings = eventSettings(event); const name = `${child.first_name || ""} ${child.last_name || ""}`.trim(); const budgetTotal = enabledBudgetTotal(settings);
  const value = (item) => escapeHtml(item || "Not provided");
  const size = (label, item) => `<div class="size"><span>${label}</span><strong>${value(item)}</strong></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${value(name)} shopping profile</title><style>@page{size:letter;margin:.45in}*{box-sizing:border-box}body{margin:0;color:#111821;background:#fff;font-family:Arial,sans-serif}.sheet{min-height:9.9in;padding:24px;border:1px solid #cbd3ce;border-top:6px solid #35d32f}.eyebrow{margin:0 0 13px;color:#176b39;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:30px;line-height:1.05}h2{margin:30px 0 11px;font-size:16px}.reference{margin:7px 0 26px;color:#617068;font-size:12px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{padding:15px;background:#f3f7f3}.box span,.size span{display:block;margin-bottom:6px;color:#617068;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.box strong{font-size:14px}.sizes{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.size{padding:12px;background:#f3f7f3}.size strong{font-size:14px}.copy{line-height:1.5}.budget{display:flex;margin-top:32px;padding:16px;justify-content:space-between;gap:20px;background:#e8f7e8;border-left:5px solid #176b39;font-weight:700}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><main class="sheet"><p class="eyebrow">Campbell's Crew Cares · Child Shopping Profile</p><h1>${value(name)}</h1><p class="reference">${value(recipientApplicationReference(household.id))} · ${value(event.title)}</p><div class="grid"><div class="box"><span>Responsible party</span><strong>${value(household.guardian_name)}</strong></div><div class="box"><span>Emergency contact</span><strong>${value(application.emergencyName)} · ${value(application.emergencyPhone)}</strong></div></div><h2>Sizes</h2><div class="sizes">${size("Shirt",details.shirt)}${size("Pants",details.pants)}${size("Shoes",details.shoes)}${size("Underwear",details.underwear)}${size("Coat",details.coat)}</div><h2>Preferences & accommodations</h2><p class="copy"><strong>Preferences:</strong> ${value(details.preferences)}</p><p class="copy"><strong>Accommodations:</strong> ${value(details.accommodations)}</p><div class="budget"><span>Shopping budget: $${value(budgetTotal)}</span><span>Volunteer spending total: $________________</span></div></main><script>addEventListener('load',()=>setTimeout(()=>print(),180))</script></body></html>`;
}

function childProfileValues({ child, household, event }) {
  const details = child.details || {}; const application = household.application || {}; const settings = eventSettings(event);
  const birthDate = String(child.birth_date || "").trim();
  const parsedBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(`${birthDate}T12:00:00`) : null;
  const today = new Date();
  let age = "";
  if (parsedBirthDate && !Number.isNaN(parsedBirthDate.valueOf())) { age = today.getFullYear() - parsedBirthDate.getFullYear(); const birthdayThisYear = new Date(today.getFullYear(), parsedBirthDate.getMonth(), parsedBirthDate.getDate()); if (today < birthdayThisYear) age -= 1; }
  const enabledBudgets = Array.isArray(settings.budgetItems) ? settings.budgetItems.filter((item) => item?.enabled) : [];
  const budgetItems = packetBudgetItems(settings, details);
  const budgetFor = (...names) => enabledBudgets.filter((item) => names.includes(String(item.label || "").toLowerCase())).reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const eventDate = event.event_date ? String(event.event_date) : "";
  const parsedEventDate = eventDate ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? `${eventDate}T12:00:00` : eventDate) : null;
  const shortEventDate = parsedEventDate && !Number.isNaN(parsedEventDate.valueOf())
    ? parsedEventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : eventDate;
  return {
    name: `${child.first_name || ""} ${child.last_name || ""}`.trim() || "Not provided",
    application: recipientApplicationReference(household.id),
    // The profile has a compact single-line Date / Event field.  The complete
    // event title follows on the rules page, while this keeps the date legible.
    event: shortEventDate || event.title || "Event",
    eventDate: shortEventDate || "Date not set",
    volunteer: "Assigned at check-in",
    age: details.age || child.age || (age !== "" ? `${age} years · ${birthDate}` : birthDate || "Not provided"),
    emergency: [application.emergencyName, application.emergencyPhone].filter(Boolean).join(" · ") || "Not provided",
    shirt: details.shirt || "Not provided", pants: details.pants || "Not provided", shoes: details.shoes || "Not provided",
    underwear: details.underwear || "Not provided", socks: details.socks || "Not provided", bra: details.bra || "Not provided", coat: details.coat || "Not provided",
    showBra: braBudgetEnabled(settings) && /^(girl|girls|woman|women)$/i.test(String(details.gender || "").trim()),
    preferences: details.preferences || "None provided", accommodations: details.accommodations || "None provided",
    budgets: { shirt: budgetFor("shirts", "shirt"), pants: budgetFor("pants", "pants / shorts"), underwear: budgetFor("underwear", "undergarments"), socks: budgetFor("socks", "sock"), shoes: budgetFor("shoes", "shoe"), coat: budgetFor("coats", "coat", "coat / jacket") },
    budgetItems,
    budgetTotal: budgetItems.reduce((total, item) => total + item.amount, 0)
  };
}

function ageFromBirthDate(birthDate, onDate = new Date()) {
  const value = String(birthDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.valueOf()) || birth > onDate) return null;
  let age = onDate.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(onDate.getFullYear(), birth.getMonth(), birth.getDate());
  if (onDate < birthdayThisYear) age -= 1;
  return age;
}

// Keep the accent away from the page edge. Some printers cannot reliably
// print in their outermost margin, even though a PDF viewer displays it.
function drawPrintSafeTopBar(page) {
  // The taller band still reaches the very top, while extending farther down
  // the page so printers that trim an edge retain a strong visible accent.
  page.drawRectangle({ x: 0, y: 772, width: 205, height: 20, color: rgb(0.21, 0.83, 0.18) });
  page.drawRectangle({ x: 205, y: 772, width: 407, height: 20, color: rgb(0.07, 0.10, 0.13) });
}

function drawProfileOverlay(page, values, font, bold, photo = null, brandLogo = null) {
  const ink = rgb(0.07, 0.10, 0.13); const muted = rgb(0.26, 0.33, 0.29); const fieldPanel = rgb(238 / 255, 243 / 255, 239 / 255); const paper = rgb(1, 1, 1); const border = rgb(0.77, 0.82, 0.79);
  const draw = (text, x, y, size = 9, options = {}) => page.drawText(String(text || ""), { x, y, size, font: options.bold ? bold : font, color: options.color || (options.muted ? muted : ink), maxWidth: options.maxWidth, lineHeight: options.lineHeight || size + 2 });
  const clear = (x, y, width, height, color = fieldPanel) => page.drawRectangle({ x, y, width, height, color });
  drawPrintSafeTopBar(page);
  // The supplied template has several overlapping panel edges and labels.  Do
  // not try to patch those individual marks: cover the whole data region and
  // rebuild it on one shared 41-570 point grid so every edge lands together.
  const left = 41; const right = 570; const width = right - left;
  clear(31, 80, 560, 656, paper);
  // Rebuild the brand lockup lower on the page so it has comfortable space
  // below the stronger print-safe top band.
  clear(31, 710, 350, 62, paper);
  if (brandLogo) page.drawImage(brandLogo, { x: 41, y: 714, width: 40, height: 40 });
  draw("CAMPBELL'S CREW CARES", 91, 732, 10.8, { bold: true, maxWidth: 240 });
  // Remove the template's internal "profile" label; the child's name is the
  // useful title for volunteers sorting a stack of sheets.
  clear(390, 740, 180, 28, paper);
  draw(values.name, left, 670, 25, { bold: true, maxWidth: photo ? 400 : 500 });
  draw("Child information sheet", left, 652, 10.8, { muted: true });
  if (photo) {
    const photoLeft = 491; const photoBottom = 662; const photoSide = 70;
    // Fill, center, and clip the square so every packet uses the same crop
    // treatment as the child badge rather than letterboxing the source image.
    const scale = Math.max(photoSide / photo.width, photoSide / photo.height);
    const photoWidth = photo.width * scale; const photoHeight = photo.height * scale;
    page.drawRectangle({ x: photoLeft - 2, y: photoBottom - 2, width: photoSide + 4, height: photoSide + 4, color: paper, borderColor: rgb(0.09, 0.42, 0.22), borderWidth: 1.5 });
    page.pushOperators(pushGraphicsState(), rectangle(photoLeft, photoBottom, photoSide, photoSide), clip(), endPath());
    page.drawImage(photo, { x: photoLeft + (photoSide - photoWidth) / 2, y: photoBottom + (photoSide - photoHeight) / 2, width: photoWidth, height: photoHeight });
    page.pushOperators(popGraphicsState());
  }
  // The original template's details panel is wider than the rebuilt grid.
  // Keep this cover exactly on the shared right edge so no colored strip leaks
  // beyond the information box.
  clear(left, 574, width, 71);
  page.drawRectangle({ x: left, y: 574, width, height: 71, color: fieldPanel, borderColor: border, borderWidth: .55 });
  page.drawLine({ start: { x: 217, y: 574 }, end: { x: 217, y: 645 }, thickness: .55, color: border });
  page.drawLine({ start: { x: 393, y: 574 }, end: { x: 393, y: 645 }, thickness: .55, color: border });
  page.drawLine({ start: { x: 41, y: 609 }, end: { x: 570, y: 609 }, thickness: .55, color: border });
  // This is deliberately the only white cell: the assigned volunteer writes
  // their own name here at check-in, using a regular pen.
  page.drawRectangle({ x: 41, y: 574, width: 176, height: 35, color: rgb(1, 1, 1), borderColor: border, borderWidth: .55 });
  [["CHILD NAME", 51, 629], ["APPLICATION #", 228, 629], ["DATE / EVENT", 404, 629], ["VOLUNTEER", 51, 593], ["AGE / BIRTHDATE", 228, 593], ["EMERGENCY CONTACT", 404, 593]].forEach(([label, x, y]) => draw(label, x, y, 7, { bold: true, muted: true }));
  draw(values.name, 51, 615, 10.5, { bold: true, maxWidth: 130 });
  draw(values.application, 228, 615, 10.5, { bold: true, maxWidth: 130 });
  draw(values.event, 404, 615, 9, { bold: true, maxWidth: 128 });
  page.drawLine({ start: { x: 51, y: 580 }, end: { x: 207, y: 580 }, thickness: .6, color: muted });
  draw(values.age, 228, 580, 8.2, { maxWidth: 130 });
  draw(values.emergency, 404, 580, 7.4, { maxWidth: 128 });
  // Sizes panel: the header, table, and all value cells share the same outer
  // edge as the details, notes, and budget panels. A bra field only exists
  // when that event enabled it and the child's sizing category is applicable.
  page.drawRectangle({ x: left, y: 420, width, height: 142, color: paper, borderColor: border, borderWidth: .55 });
  page.drawRectangle({ x: left, y: 534, width, height: 28, color: fieldPanel, borderColor: border, borderWidth: .55 });
  draw("Sizes", 53, 544, 13, { bold: true });
  const sizeTop = 523; const sizeBottom = 430; const sizeLeft = 52; const sizeRight = 559; const rowMid = 477;
  page.drawRectangle({ x: sizeLeft, y: sizeBottom, width: sizeRight - sizeLeft, height: sizeTop - sizeBottom, borderColor: border, borderWidth: .5 });
  page.drawLine({ start: { x: sizeLeft, y: rowMid }, end: { x: sizeRight, y: rowMid }, thickness: .5, color: border });
  const drawSizeCell = (label, item, x, y, width) => { draw(label, x + 10, y + 28, 7.6, { bold: true, muted: true }); draw(item, x + 10, y + 11, 9.5, { bold: true, maxWidth: width - 20 }); };
  if (values.showBra) {
    const four = [52, 179, 306, 433, 559]; const three = [52, 221, 390, 559];
    four.slice(1, -1).forEach((x) => page.drawLine({ start: { x, y: rowMid }, end: { x, y: sizeTop }, thickness: .5, color: border }));
    three.slice(1, -1).forEach((x) => page.drawLine({ start: { x, y: sizeBottom }, end: { x, y: rowMid }, thickness: .5, color: border }));
    [["SHIRT / TOP", values.shirt], ["PANTS / SHORTS", values.pants], ["SHOES", values.shoes], ["UNDERWEAR", values.underwear]].forEach(([label, item], index) => drawSizeCell(label, item, four[index], rowMid, four[index + 1] - four[index]));
    [["SOCKS", values.socks], ["COAT / JACKET", values.coat], ["BRA SIZE", values.bra]].forEach(([label, item], index) => drawSizeCell(label, item, three[index], sizeBottom, three[index + 1] - three[index]));
  } else {
    const columns = [52, 221, 390, 559];
    columns.slice(1, -1).forEach((x) => page.drawLine({ start: { x, y: sizeBottom }, end: { x, y: sizeTop }, thickness: .5, color: border }));
    [["SHIRT / TOP", values.shirt], ["PANTS / SHORTS", values.pants], ["SHOES", values.shoes]].forEach(([label, item], index) => drawSizeCell(label, item, columns[index], rowMid, columns[index + 1] - columns[index]));
    [["UNDERWEAR", values.underwear], ["SOCKS", values.socks], ["COAT / JACKET", values.coat]].forEach(([label, item], index) => drawSizeCell(label, item, columns[index], sizeBottom, columns[index + 1] - columns[index]));
  }
  // Preferences are redrawn to remove the template's inset left/right edges.
  page.drawRectangle({ x: left, y: 346, width, height: 62, color: paper, borderColor: border, borderWidth: .55 });
  page.drawLine({ start: { x: 305, y: 346 }, end: { x: 305, y: 408 }, thickness: .55, color: border });
  draw("Preferences, likes, colors, and styles", 53, 389, 8, { bold: true });
  draw("Accommodations and helpful notes", 317, 389, 8, { bold: true });
  draw(values.preferences, 53, 373, 7.7, { maxWidth: 240, lineHeight: 10 });
  draw(values.accommodations, 317, 373, 7.7, { maxWidth: 240, lineHeight: 10 });
  // Rebuild the budget table too. Its source table is wider than the profile
  // panels, which was the remaining right-side overhang in printed packets.
  const budgetTop = 325; const budgetBottom = 113; const headerBottom = 300;
  const columns = [52, 204, 285, 385, 559];
  page.drawRectangle({ x: left, y: budgetBottom, width, height: budgetTop - budgetBottom, color: paper, borderColor: border, borderWidth: .55 });
  page.drawRectangle({ x: left, y: headerBottom, width, height: budgetTop - headerBottom, color: fieldPanel, borderColor: border, borderWidth: .55 });
  draw("Budget and optional spending tracker", 53, 310, 13, { bold: true });
  page.drawRectangle({ x: 52, y: 277, width: 507, height: 23, color: rgb(0.07, 0.10, 0.13) });
  ["ESSENTIAL", "BUDGET", "AMOUNT SPENT", "ITEM / NOTES"].forEach((label, index) => draw(label, columns[index] + 10, 285, 7, { bold: true, color: rgb(0.94, 0.98, 0.95) }));
  const budgetRows = values.budgetItems || [];
  // Reserve the total row before dividing the remaining table height. This
  // prevents a final optional row (such as Toys) being shortened by overlap.
  const rowHeight = (277 - 128) / Math.max(6, budgetRows.length); const firstRowBottom = 277 - rowHeight;
  for (let index = 0; index < budgetRows.length; index += 1) {
    const y = firstRowBottom - index * rowHeight;
    page.drawRectangle({ x: 52, y, width: 507, height: rowHeight, color: paper, borderColor: border, borderWidth: .45 });
    // Keep labels centered, but set the handwriting baselines low in the
    // cells. That leaves the middle of each cell for a person to write in.
    const textY = y + Math.max(5.8, (rowHeight - 8.8) / 2);
    const writingLineY = y + 3.5;
    const textSize = rowHeight < 20 ? 7.6 : 8.5;
    draw(budgetRows[index].fixedCap ? "TOYS — FIXED CAP" : budgetRows[index].label, 62, textY, textSize, { bold: Boolean(budgetRows[index].fixedCap), maxWidth: 132 });
    draw(`$${budgetRows[index].amount}`, 214, textY, textSize, { bold: true, maxWidth: 60 });
    draw("$____________", 295, writingLineY - 1.2, rowHeight < 20 ? 7.4 : 8.1, { maxWidth: 80 });
    page.drawLine({ start: { x: 397, y: writingLineY }, end: { x: 545, y: writingLineY }, thickness: .45, color: muted });
  }
  page.drawRectangle({ x: 52, y: 113, width: 507, height: 15, color: rgb(0.88, 0.95, 0.89), borderColor: border, borderWidth: .45 });
  draw("TOTAL", 62, 118, 7.5, { bold: true });
  draw(`$${values.budgetTotal}`, 214, 118, 8, { bold: true });
  draw("$_______", 295, 115.5, 7.4, { bold: true });
  const toyBudget = budgetRows.find((item) => item.fixedCap);
  draw(toyBudget ? `TOYS: FIXED $${toyBudget.amount} MAX - NO TRANSFERS` : "Remaining: $_______", 397, 118, toyBudget ? 6.4 : 7.2, { bold: true, maxWidth: 150 });
  columns.slice(1, -1).forEach((x) => page.drawLine({ start: { x, y: 113 }, end: { x, y: 300 }, thickness: .45, color: border }));
  // Keep the closeout checklist on the child's own sheet, right below the
  // spending tracker where it is most useful at the register.
  clear(41, 24, 529, 86, paper);
  draw("BEFORE CHECKOUT CHECKLIST", 52, 100, 9.5, { bold: true, color: rgb(0.03, 0.47, 0.23) });
  const checkoutItems = [
    "Bought at least one item from every printed category.",
    "Stayed within a few dollars of the clothing budget.",
    "Checked fit, modesty, and age-appropriateness.",
    "No pajamas, hair accessories, jewelry, or other extras.",
    ...(toyBudget ? ["Did not spend more than the fixed toy limit."] : [])
  ];
  checkoutItems.forEach((item, index) => {
    const column = index % 3; const row = Math.floor(index / 3); const x = 52 + column * 169; const y = 84 - row * 23;
    page.drawRectangle({ x, y: y - 1, width: 8, height: 8, borderColor: muted, borderWidth: .6 });
    draw(item, x + 12, y, 8.6, { maxWidth: 151, lineHeight: 9.8 });
  });
  draw("Need help? Ask a CCC representative before checkout.", 348, 45, 7.5, { bold: true, color: rgb(0.03, 0.47, 0.23) });
  page.drawLine({ start: { x: 348, y: 43 }, end: { x: 570, y: 43 }, thickness: .55, color: rgb(0.03, 0.47, 0.23) });
  page.drawLine({ start: { x: 41, y: 34 }, end: { x: 570, y: 34 }, thickness: .55, color: border });
  draw(`Event date: ${values.eventDate}`, 41, 20, 7.5, { muted: true });
}

function drawRulesOverlay(page, event, font, bold) {
  const settings = eventSettings(event); const ink = rgb(0.07, 0.10, 0.13); const muted = rgb(0.26, 0.33, 0.29); const mist = rgb(238 / 255, 245 / 255, 239 / 255); const line = rgb(0.77, 0.82, 0.79); const green = rgb(0.03, 0.47, 0.23); const orange = rgb(0.66, 0.24, 0); const cream = rgb(1, 242 / 255, 223 / 255); const pale = rgb(247 / 255, 250 / 255, 247 / 255);
  const draw = (text, x, y, size = 8, options = {}) => page.drawText(String(text), { x, y, size, font: options.bold ? bold : font, color: options.color || (options.muted ? muted : ink), maxWidth: options.maxWidth, lineHeight: options.lineHeight || size + 1.8 });
  drawPrintSafeTopBar(page);
  const items = Array.isArray(settings.budgetItems) ? settings.budgetItems : [];
  const toy = items.find((item) => item?.enabled && /toy/i.test(`${item.id || ""} ${item.label || ""}`));
  const bra = items.find((item) => item?.enabled && /bra/i.test(`${item.id || ""} ${item.label || ""}`));
  // These two panels are event-specific. Cover the template wording so a
  // clothing-only event never accidentally suggests that toys or bras are okay.
  page.drawRectangle({ x: 42, y: 542, width: 528, height: 70, color: toy ? cream : mist, borderColor: toy ? orange : green, borderWidth: 1 });
  if (toy) {
    draw("TOYS: FIXED LIMIT - NO EXCEPTIONS", 58, 592, 12, { bold: true, maxWidth: 480 });
    draw(`A toy is allowed only when it is printed on the child's sheet. The fixed toy maximum is $${Number(toy.amount) || 0}: clothing money can never be used for a more expensive toy. Toy money may be used for clothing instead.`, 58, 576, 8.3, { maxWidth: 494 });
  } else {
    draw("CLOTHING-ONLY EVENT - NO TOYS OR ACCESSORIES", 58, 592, 10.8, { bold: true, maxWidth: 480 });
    draw("This event is restricted to clothing only. Do not purchase toys or accessories. Purchase only clothes from the categories listed on the child's information sheet.", 58, 576, 8.6, { maxWidth: 494 });
  }
  // A solid cover is deliberately used here: it reliably masks the template
  // beneath it before the event-aware bra or clothing-only copy is drawn.
  page.drawRectangle({ x: 42, y: 310, width: 255, height: 64, color: pale, borderColor: line, borderWidth: .8 });
  page.drawRectangle({ x: 54, y: 340, width: 28, height: 22, color: green });
  draw("03", 61, 347, 8, { bold: true, color: rgb(1, 1, 1) });
  if (bra) {
    draw("Bras are limited and specific", 92, 361, 10, { bold: true, maxWidth: 190 });
    draw("Bras are only for Girls/Women who truly need them, and only when both a bra size and bra budget are printed. Otherwise, they are not approved.", 92, 345, 6.9, { maxWidth: 190 });
  } else {
    draw("Essential clothing only", 92, 361, 10, { bold: true, maxWidth: 190 });
    draw("Shirts, pants, socks, underwear, shoes, and other printed categories are permitted. If a category is not shown on the child's sheet, it is not allowed for this event.", 92, 345, 6.5, { maxWidth: 190 });
  }
  // Replace the generic closeout sentence with a practical, event-aware
  // checklist. The toy confirmation exists only when toys are enabled.
  page.drawRectangle({ x: 42, y: 224, width: 528, height: 70, color: ink });
  draw("BEFORE CHECKOUT", 58, 278, 10.5, { bold: true, color: rgb(1, 1, 1) });
  const checklist = [
    "Each printed category has been successfully fulfilled.",
    "Total spending is within a few dollars of the total budget.",
    "Everything is appropriately sized and modest.",
    "No pajamas, hair accessories, jewelry, or other non-essential items.",
    ...(toy ? [`Toy spending did not exceed the fixed $${Number(toy.amount) || 0} limit.`] : []),
    "Any question was cleared with a CCC representative."
  ];
  checklist.forEach((item, index) => {
    const column = index % 2; const row = Math.floor(index / 2); const x = 58 + column * 257; const y = 260 - row * 13;
    page.drawRectangle({ x, y: y - 1, width: 7, height: 7, borderColor: rgb(1, 1, 1), borderWidth: .65 });
    draw(item, x + 12, y, 5.8, { color: rgb(1, 1, 1), maxWidth: 235, lineHeight: 7 });
  });
  // This dedicated panel is intentionally the one dynamic part of the rules
  // page. Only active special-item rules appear, so volunteers cannot mistake
  // an optional item from another event as permission for this child.
  page.drawRectangle({ x: 42, y: 135, width: 528, height: 85, color: mist, borderColor: line, borderWidth: .7 });
  draw("Event-specific approvals", 58, 198, 11, { bold: true });
  draw("Only items printed on a child's shopping sheet are approved.", 58, 181, 8.5, { bold: true });
  let y = 163;
  if (toy) { draw(`TOYS - FIXED $${Number(toy.amount) || 0} MAX. Clothing money cannot be used for toys; toy money may be used for clothing.`, 58, y, 7.2, { bold: true, maxWidth: 495 }); y -= 16; }
  if (bra) { draw("BRAS - only for Girls/Women who truly need them, and only when both Bra Size and a Bra budget are printed on the child's sheet.", 58, y, 6.8, { bold: true, maxWidth: 495 }); }
  if (!toy && !bra) draw("No additional special-item approvals are active for this event.", 58, y, 8, { muted: true });
}

async function eventRulesDocument(env, origin, event) {
  const source = await PDFDocument.load(await templatePdfBytes(env, origin, "/assets/packets/CCC_Event_Rules_Sheet.pdf"));
  const output = await PDFDocument.create(); const font = await output.embedFont(StandardFonts.Helvetica); const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const [page] = await output.copyPages(source, [0]); output.addPage(page);
  drawRulesOverlay(page, event, font, bold);
  return output.save();
}

async function templatePdfBytes(env, origin, pathname) {
  const response = await env.ASSETS.fetch(new Request(new URL(pathname, origin)));
  if (!response.ok) throw new Error(`The packet template could not be loaded (${response.status}).`);
  return response.arrayBuffer();
}

async function childPhotoForPdf(env, output, photoKey) {
  if (!photoKey) return null;
  try {
    const photo = await env.PRIVATE_UPLOADS.get(photoKey);
    if (!photo) return null;
    const bytes = await photo.arrayBuffer();
    const type = String(photo.httpMetadata?.contentType || "").toLowerCase();
    if (type.includes("png")) return output.embedPng(bytes);
    return output.embedJpg(bytes);
  } catch {
    // A packet should still print when a legacy or unsupported image cannot
    // be embedded. The sheet simply omits the optional photo in that case.
    return null;
  }
}

async function brandLogoForPdf(env, origin, output) {
  try {
    // Brand imagery is served by the main site, not the portal asset bundle.
    const response = await fetch(new URL("/assets/images/ccc-logo.png", origin));
    if (!response.ok) return null;
    return output.embedPng(await response.arrayBuffer());
  } catch {
    // The packet remains printable if the brand image cannot be loaded.
    return null;
  }
}

async function filledProfileDocument(env, origin, records, includeRules = false) {
  const profileBytes = await templatePdfBytes(env, origin, "/assets/packets/CCC_Child_Shopping_Profile.pdf");
  const rulesBytes = includeRules ? await templatePdfBytes(env, origin, "/assets/packets/CCC_Event_Rules_Sheet.pdf") : null;
  const output = await PDFDocument.create(); const font = await output.embedFont(StandardFonts.Helvetica); const bold = await output.embedFont(StandardFonts.HelveticaBold); const brandLogo = await brandLogoForPdf(env, origin, output);
  for (const record of records) {
    const source = await PDFDocument.load(profileBytes); const [page] = await output.copyPages(source, [0]); output.addPage(page);
    const photo = await childPhotoForPdf(env, output, record.child.photo_key);
    drawProfileOverlay(page, childProfileValues(record), font, bold, photo, brandLogo);
    if (rulesBytes) { const rules = await PDFDocument.load(rulesBytes); const [rulesPage] = await output.copyPages(rules, [0]); output.addPage(rulesPage); drawRulesOverlay(rulesPage, record.event, font, bold); }
  }
  return output.save();
}

async function readSignedUserToken(token, env) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return null;
  try {
    if (!constantTimeEqual(signature, base64Url(await hmac(env.PORTAL_SESSION_SECRET, payload)))) return null;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (!session.id || session.expires <= Math.floor(Date.now() / 1000)) return null;
    const account = await env.DB.prepare("SELECT id, email, role, status FROM users WHERE id = ?").bind(session.id).first();
    return account?.status === "active" ? account : null;
  } catch { return null; }
}

async function emailTokenKey(env) {
  const source = `${env.PORTAL_SESSION_SECRET}:${env.GOOGLE_OAUTH_CLIENT_SECRET}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptEmailToken(token, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await emailTokenKey(env), new TextEncoder().encode(token));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(bytes))}`;
}

async function decryptEmailToken(value, env) {
  const [ivValue, cipherValue] = String(value || "").split(".");
  if (!ivValue || !cipherValue) throw new Error("Email connection is unavailable.");
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(ivValue) }, await emailTokenKey(env), decodeBase64Url(cipherValue));
  return new TextDecoder().decode(bytes);
}

function emailLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function brandedEmailHtml(subject, body) {
  const paragraphs = String(body || "").split(/\r?\n\r?\n/).filter(Boolean).map((paragraph) => `<p style="margin:0 0 18px;color:#111821;font:16px/1.55 Arial,sans-serif;overflow-wrap:anywhere">${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef3ef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef3ef"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff"><tr><td style="height:7px;background:#35d32f;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:20px 26px;background:#111821"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px"><img src="https://campbellscrew.com/assets/images/ccc-logo.png" width="52" height="52" alt="Campbell's Crew Cares" style="display:block;border:0;border-radius:50%;background:#fff"></td><td><div style="color:#fff;font:700 14px Arial,sans-serif;letter-spacing:.7px;text-transform:uppercase">Campbell's Crew Cares</div><div style="padding-top:4px;color:#b9c8bf;font:12px Arial,sans-serif">Community care in action</div></td></tr></table></td></tr><tr><td style="padding:30px 30px 14px"><h1 style="margin:0 0 22px;color:#176b39;font:700 24px/1.2 Arial,sans-serif">${escapeHtml(subject)}</h1>${paragraphs}</td></tr><tr><td style="padding:18px 30px;background:#f2f7f2;border-top:1px solid #d2d9d4;color:#617068;font:12px/1.45 Arial,sans-serif">Campbell's Crew Cares<br>Questions? Reply directly to this email.</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(env, recipient, subject, body) {
  const credential = await env.DB.prepare("SELECT encrypted_refresh_token FROM email_oauth_credentials WHERE id = 1").first();
  if (!credential || !env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("Email delivery has not been connected yet.");
  const destination = emailLine(recipient).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(destination)) throw new Error("A valid email address is required for delivery.");
  const refreshToken = await decryptEmailToken(credential.encrypted_refresh_token, env);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("Google email authorization needs to be reconnected.");
  const boundary = `ccc-${crypto.randomUUID()}`;
  const plainText = String(body || "").replace(/\r?\n/g, "\r\n");
  const message = `From: Campbell's Crew Cares <${EMAIL_SENDER}>\r\nTo: ${destination}\r\nSubject: ${emailLine(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${plainText}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${brandedEmailHtml(subject, body)}\r\n\r\n--${boundary}--`;
  const sent = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(EMAIL_SENDER)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(message)) }) });
  if (!sent.ok) throw new Error("Google could not send the email.");
}

function eventEmailDetails(event) {
  const settings = eventSettings(event) || {};
  return { date: emailLine(event.event_date || settings.date || "To be announced"), time: emailLine(settings.time || "To be announced"), location: emailLine(settings.location || "To be announced"), address: emailLine(settings.address || "") };
}

function eventEmailTemplate(event, id, fallback, values = {}) {
  const templates = eventSettings(event)?.emailTemplates || [];
  const saved = templates.find((template) => template.id === id);
  if (saved?.enabled === false) return null;
  const details = eventEmailDetails(event);
  const replacements = { "{{name}}": values.name || "there", "{{child}}": values.child || "", "{{role}}": values.role || "", "{{reason}}": values.reason || "", "{{event}}": event.title || "", "{{date}}": details.date, "{{time}}": details.time, "{{location}}": details.location };
  const fill = (value) => String(value || "").replace(/{{name}}|{{child}}|{{role}}|{{reason}}|{{event}}|{{date}}|{{time}}|{{location}}/g, (token) => replacements[token] || "");
  return { subject: emailLine(fill(saved?.subject || fallback.subject)), body: fill(saved?.body || fallback.body) };
}

async function sendPasswordResetEmail(env, recipient, resetUrl) {
  await sendEmail(env, recipient, "Reset your Campbell's Crew organizer password", `A password reset was requested for your Campbell's Crew organizer account.\n\nSet a new password using this secure link:\n${resetUrl}\n\nThis link expires in seven days. If you did not request this, you can ignore this email.`);
}

async function sendVolunteerConfirmation(env, recipient, name, role, event) {
  const details = eventEmailDetails(event);
  const message = eventEmailTemplate(event, "vol-confirm", { subject: `You're registered: {{event}}`, body: `Hi {{name}},\n\nThank you for volunteering with Campbell's Crew Cares. You are registered for {{event}} as a {{role}}.\n\nDate: {{date}}\nTime: {{time}}\nLocation: {{location}}${details.address ? `\nAddress: ${details.address}` : ""}\n\nWe look forward to seeing you there.` }, { name, role });
  if (message) await sendEmail(env, recipient, message.subject, message.body);
}

async function sendRecipientConfirmation(env, recipient, guardianName, event) {
  const message = eventEmailTemplate(event, "rec-received", { subject: "Application received: {{event}}", body: "Hi {{name}},\n\nYour Campbell's Crew Cares application for {{event}} has been received and is now awaiting review.\n\nSubmitting an application does not guarantee approval. We will contact you if we need more information or when there is an update." }, { name: guardianName });
  if (message) await sendEmail(env, recipient, message.subject, message.body);
}

async function sendRecipientDecisionEmail(env, recipient, guardianName, childName, decision, event, decisionNote = "") {
  const details = eventEmailDetails(event);
  const messages = {
    approved: { subject: `Approved: ${emailLine(event.title)}`, body: `We are happy to let you know that ${emailLine(childName)} has been approved for ${emailLine(event.title)}.\n\nDate: ${details.date}\nTime: ${details.time}\nLocation: ${details.location}${details.address ? `\nAddress: ${details.address}` : ""}\n\nWe look forward to seeing you there.` },
    declined: { subject: `An update on ${emailLine(childName)}’s application`, body: `Thank you for taking the time to apply for ${emailLine(event.title)}. After careful review, we are unable to offer ${emailLine(childName)} a place in this event.\n\nReason provided by the Campbell's Crew Cares team:\n${emailLine(decisionNote)}\n\nWe understand this may be disappointing. We appreciate your understanding and hope you will consider future Campbell's Crew Cares opportunities.` },
    waitlisted: { subject: `Waitlist update: ${emailLine(event.title)}`, body: `${emailLine(childName)} has been placed on the waitlist for ${emailLine(event.title)}.\n\nWe will contact you if a place becomes available. Please do not make event plans until you receive a separate approval message.` }
  };
  const fallback = messages[decision];
  const message = fallback ? eventEmailTemplate(event, decision, fallback, { name: guardianName, child: childName, reason: decisionNote }) : null;
  if (!message) return;
  await sendEmail(env, recipient, message.subject, message.body);
}

async function sendOrganizerInvitation(env, recipient, name, role, setupUrl) {
  const labels = { event_admin: "Event Administrator", read_only: "Read-Only Coordinator", checkin_staff: "Check-In Staff" };
  await sendEmail(env, recipient, "Set up your Campbell's Crew organizer account", `Hi ${emailLine(name)},\n\nYou have been invited to the Campbell's Crew Cares organizer portal as ${labels[role] || "an organizer"}.\n\nCreate your password using this secure link:\n${setupUrl}\n\nThis link expires in seven days. If you were not expecting this invitation, you can ignore this email.`);
}

// The complete organizer experience is the established test-site interface.
// It is served only after the database-backed organizer session above has been
// verified. Rewriting its local asset links lets it live safely at /organizer.
async function serveOrganizerPrototype(request, env, url, user) {
  const relativePath = url.pathname.replace(/^\/organizer\/?/, "");
  const assetUrl = new URL(request.url);
  assetUrl.pathname = relativePath ? `/${relativePath}` : "/index.html";
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = securityHeaders(new Headers(asset.headers));
  if (assetUrl.pathname === "/index.html") {
    const html = (await asset.text())
      .replace("<html lang=\"en\">", `<html lang="en" data-server-auth="true" data-organizer-role="${escapeHtml(user?.role || "")}">`)
      // Keep CSP's base-uri protection intact; route the prototype's local
      // files explicitly instead of injecting a <base> element.
      .replace('href="styles.css"', 'href="/organizer/styles.css"')
      .replace('src="xlsx-export.js"', 'src="/organizer/xlsx-export.js"')
      .replace('src="app.js"', 'src="/organizer/app.js"')
      .replaceAll("../assets/", "/assets/");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, { status: asset.status, headers });
  }
  if (assetUrl.pathname === "/app.js") {
    const script = (await asset.text())
      .replaceAll("../assets/", "/assets/")
      .replace('const SERVER_AUTH = document.documentElement.dataset.serverAuth === "true";', 'const SERVER_AUTH = document.documentElement.dataset.serverAuth === "true" || window.location.pathname.startsWith("/organizer");')
      .replace('if (!window.location.hash) window.location.hash = "home";', 'if (!window.location.hash) window.location.hash = "organizer/dashboard";')
      .replace('window.location.assign("/test-site/logout")', 'window.location.assign("/logout")');
    headers.set("Content-Type", "text/javascript; charset=utf-8");
    return new Response(script, { status: asset.status, headers });
  }
  return new Response(asset.body, { status: asset.status, headers });
}

async function activeEvents(env) {
  // Keep event configuration, access codes, capacity notes, and contact details
  // on the server. The public form needs only this small display-safe subset.
  const { results } = await env.DB.prepare("SELECT id, title, event_type, event_date, settings_json FROM events WHERE status = 'open' ORDER BY event_date ASC").all();
  return results.map((event) => {
    const settings = eventSettings(event);
    return { id: event.id, title: event.title, event_type: event.event_type, event_date: event.event_date, settings: { date: settings.date, time: settings.time, location: settings.location, volunteerStatus: settings.volunteerStatus, recipientStatus: settings.recipientStatus, volunteerEnabled: settings.volunteerEnabled, recipientEnabled: settings.recipientEnabled, questions: settings.questions || {} } };
  });
}

async function volunteerAccessCookie(eventId, secret) {
  return `${eventId}.${base64Url(await hmac(secret, eventId))}`;
}

async function hasVolunteerAccess(request, eventId, secret) {
  const cookie = (request.headers.get("Cookie") || "").split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`ccc_volunteer_access_${eventId}=`));
  if (!cookie) return false;
  return constantTimeEqual(cookie.slice(`ccc_volunteer_access_${eventId}=`.length), await volunteerAccessCookie(eventId, secret));
}

async function volunteerAccessToken(eventId, secret) {
  const expires = Math.floor(Date.now() / 1000) + (15 * 60);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ eventId, expires })));
  return `${payload}.${base64Url(await hmac(secret, `volunteer-access:${payload}`))}`;
}

async function hasVolunteerAccessToken(token, eventId, secret) {
  if (!token || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    if (!constantTimeEqual(signature, base64Url(await hmac(secret, `volunteer-access:${payload}`)))) return false;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    return data.eventId === eventId && Number(data.expires) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

async function volunteerManageToken(eventId, email, secret) {
  const expires = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ eventId, email: String(email).toLowerCase(), expires })));
  return `${payload}.${base64Url(await hmac(secret, `volunteer-manage:${payload}`))}`;
}

async function readVolunteerManageToken(token, eventId, secret) {
  if (!token || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    if (!constantTimeEqual(signature, base64Url(await hmac(secret, `volunteer-manage:${payload}`)))) return null;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (data.eventId !== eventId || !isValidEmailAddress(data.email) || Number(data.expires) <= Math.floor(Date.now() / 1000)) return null;
    return { email: String(data.email).toLowerCase() };
  } catch { return null; }
}

async function tokenHash(token) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

async function issueInvitation(env, userId) {
  await env.DB.prepare("DELETE FROM user_invitations WHERE user_id = ? AND used_at IS NULL").bind(userId).run();
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO user_invitations (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(randomId("invite"), userId, await tokenHash(token), expiresAt).run();
  return { token, expiresAt };
}

function accountSetupPage(token, email = "", message = "", status = 200) {
  const alert = message ? `<p role="alert" class="error">${escapeHtml(message)}</p>` : "";
  const identity = email ? `<p><strong>Organizer sign-in email</strong><br>${escapeHtml(email)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Set up organizer account | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--ink);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,580px);padding:clamp(30px,6vw,58px);background:#fff;border-top:7px solid var(--green);box-shadow:0 24px 70px rgba(0,0,0,.32)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:#176b39}h1{margin:12px 0 14px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(36px,7vw,52px);line-height:1;letter-spacing:-.045em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:20px 0 7px}input{width:100%;height:52px;padding:12px;border:1px solid #bdc6c0;background:var(--mist);color:var(--ink);font:400 17px/26px Arial,sans-serif}button{width:100%;min-height:52px;margin-top:22px;border:1px solid var(--green);background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.error{padding:12px;background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Set your password</h1><p>Create a password for your private organizer account. This one-time link expires in seven days.</p>${identity}${alert}<form method="post" action="/setup"><input type="hidden" name="token" value="${escapeHtml(token)}"><label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required autofocus><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required><button>Activate organizer account →</button></form></main></body></html>`;
  return new Response(html, { status, headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function forgotPasswordPage(message = "") {
  const notice = message ? `<p class="notice">${escapeHtml(message)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--ink);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,580px);padding:clamp(30px,6vw,58px);background:#fff;border-top:7px solid var(--green)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:#176b39}h1{margin:12px 0;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(36px,7vw,52px);line-height:1;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:20px 0 7px}input{width:100%;height:52px;padding:12px;border:1px solid #bdc6c0;background:var(--mist);font:16px Arial,sans-serif}button{width:100%;min-height:52px;margin-top:22px;border:0;background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.notice{padding:12px;background:#e9f7ea;border-left:4px solid #176b39;color:#155b31;font-weight:700}.back{display:inline-block;margin-top:20px;color:#176b39;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Reset password</h1><p>Enter your organizer email address. If it matches an active account, we will send a reset link.</p>${notice}<form method="post" action="/forgot-password"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required autofocus><button>Send reset link →</button></form><a class="back" href="/login">← Back to sign in</a></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function eventSettings(event) {
  try { return JSON.parse(event.settings_json || "{}"); } catch { return {}; }
}

async function publicVolunteerEvents(env) {
  const { results } = await env.DB.prepare("SELECT id, title, event_date, settings_json FROM events WHERE status = 'open' AND event_type IN ('shopping', 'food_bag') ORDER BY event_date ASC").all();
  const events = results.map((event) => ({ ...event, settings: eventSettings(event) })).filter((event) => ["open", "code"].includes(event.settings.volunteerStatus));
  return Promise.all(events.map(async (event) => {
    const { results: signups } = await env.DB.prepare("SELECT role, COUNT(*) AS count FROM volunteer_signups WHERE event_id = ? GROUP BY role").bind(event.id).all();
    return { ...event, volunteerSignupCounts: Object.fromEntries(signups.map((signup) => [signup.role, Number(signup.count) || 0])) };
  }));
}

async function publicRecipientEvents(env) {
  const { results } = await env.DB.prepare("SELECT id, title, event_date, settings_json FROM events WHERE status = 'open' AND event_type = 'shopping' ORDER BY event_date ASC").all();
  return results.map((event) => ({ ...event, settings: eventSettings(event) })).filter((event) => ["open", "code"].includes(event.settings.recipientStatus));
}

async function recipientAccessCookie(eventId, secret) {
  return `${eventId}.${base64Url(await hmac(secret, `recipient:${eventId}`))}`;
}

async function hasRecipientAccess(request, eventId, secret) {
  const name = `ccc_recipient_access_${eventId}=`;
  const cookie = (request.headers.get("Cookie") || "").split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(name));
  if (!cookie) return false;
  return constantTimeEqual(cookie.slice(name.length), await recipientAccessCookie(eventId, secret));
}

function recipientCodePage(event, error = "") {
  const alert = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Recipient application access | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--mist:#eef3ef;--gray:#617068}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,620px);padding:clamp(30px,6vw,54px);background:#fff;border-left:7px solid var(--green);box-shadow:0 18px 55px rgba(17,24,33,.12)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:#176b39}h1{margin:12px 0;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,7vw,52px);line-height:1;letter-spacing:-.045em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:22px 0 7px}input{width:100%;min-height:52px;padding:12px;border:1px solid #bdc6c0;background:#fff;font:16px Arial,sans-serif}button{width:100%;min-height:52px;margin-top:20px;border:0;background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.error{padding:12px;background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Application access</h1><p>Enter the referral code supplied by Campbell's Crew to apply for <strong>${escapeHtml(event.title)}</strong>.</p>${alert}<form method="post" action="/apply"><input type="hidden" name="action" value="unlock"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><label for="access-code">Referral code</label><input id="access-code" name="accessCode" autocomplete="one-time-code" required autofocus><button>Continue →</button></form></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function recipientApplicationPage(events, query, message = "", error = "") {
  if (!events.length) return portalStatusPage("Recipient applications", "There are no recipient applications open right now. Please check back when the next event is announced.");
  const event = events.find((item) => item.id === query.get("event")) || events[0];
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Recipient application | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 40px,760px);margin:52px auto 70px;background:#fff;border:1px solid var(--line);box-shadow:0 20px 50px rgba(17,24,33,.11);padding:clamp(28px,5vw,54px)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:var(--forest)}h1{margin:12px 0;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,6vw,52px);line-height:.95;letter-spacing:-.045em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}.event{margin:26px 0;padding:18px 20px;background:var(--mist);border-left:5px solid var(--green)}.event strong,.event span{display:block}.event span{margin-top:5px;color:var(--gray)}label{display:block;margin:20px 0 7px}input,textarea{width:100%;min-height:52px;margin-top:7px;padding:12px;border:1px solid var(--line);font:16px Arial,sans-serif}textarea{min-height:110px;resize:vertical}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid label{margin-bottom:0}button{min-height:52px;margin-top:26px;padding:0 22px;border:0;background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.notice{padding:13px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}@media(max-width:620px){main{width:min(100% - 26px,760px);margin-top:28px}.grid{grid-template-columns:1fr}}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Apply for help</h1><p>Applications are reviewed by Campbell's Crew. Submitting an application does not guarantee acceptance.</p>${notice}<div class="event"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.event_date || event.settings.date || "Date to be announced")}</span></div><form method="post" action="/apply"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><label>Responsible party name<input name="guardianName" autocomplete="name" required></label><div class="grid"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label></div><div class="grid"><label>Child's first name<input name="firstName" required></label><label>Child's last name<input name="lastName" required></label></div><label>Notes or accommodations <small>(optional)</small><textarea name="notes"></textarea></label><button>Submit application →</button></form></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function volunteerCodePage(event, error = "") {
  const alert = `<style>button{cursor:pointer}</style>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Volunteer access | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--mist:#eef3ef;--gray:#617068}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,620px);padding:clamp(30px,6vw,54px);background:#fff;border-left:7px solid var(--green);box-shadow:0 18px 55px rgba(17,24,33,.12)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:#176b39}h1{margin:12px 0;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,7vw,52px);line-height:1;letter-spacing:-.045em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:22px 0 7px}input{width:100%;min-height:52px;padding:12px;border:1px solid #bdc6c0;background:#fff;font:16px Arial,sans-serif}button{width:100%;min-height:52px;margin-top:20px;border:0;background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.error{padding:12px;background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Volunteer access</h1><p>Enter the invitation code supplied by Campbell's Crew to view and sign up for <strong>${escapeHtml(event.title)}</strong>.</p>${alert}<form method="post" action="/volunteer"><input type="hidden" name="action" value="unlock"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><label for="access-code">Invitation code</label><input id="access-code" name="accessCode" autocomplete="one-time-code" required autofocus><button>Continue →</button></form></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function volunteerSignupPage(events, message = "", error = "") {
  if (!events.length) return portalStatusPage("Volunteer opportunities", "There are no public volunteer opportunities open right now. Please check back when the next event is announced.");
  const event = events[0];
  const roles = Array.isArray(event.settings.roles) ? event.settings.roles.filter((role) => role.enabled && role.title) : [];
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const roleOptions = roles.map((role) => `<option value="${escapeHtml(role.title)}">${escapeHtml(role.title)}${role.shift ? ` · ${escapeHtml(role.shift)}` : ""}</option>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Volunteer signup | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#edf3ed;--gray:#59665f}*{box-sizing:border-box}body{margin:0;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 32px,760px);margin:54px auto;padding:clamp(28px,6vw,54px);background:#fff;border-left:7px solid var(--green);box-shadow:0 18px 55px rgba(17,24,33,.12)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:var(--forest)}h1{margin:10px 0 15px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(38px,7vw,62px);line-height:.94;letter-spacing:-.05em;text-transform:uppercase}p{line-height:1.55;color:var(--gray)}.event{margin:26px 0;padding:22px;background:var(--mist);border-left:4px solid var(--forest)}.event strong{display:block;font-size:21px}.event span{display:block;margin-top:7px;color:var(--gray)}label{display:block;margin:20px 0 7px}input,select{width:100%;min-height:50px;padding:12px;border:1px solid #bdc6c0;background:#fff;font:16px Arial,sans-serif}.check{display:flex;gap:10px;align-items:flex-start;margin-top:19px;color:var(--ink);font-size:14px;font-weight:700;line-height:1.4;text-transform:none;letter-spacing:0}.check input{width:18px;min-height:18px;margin:0;accent-color:var(--forest)}button{width:100%;min-height:52px;margin-top:24px;border:1px solid var(--green);background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.notice{padding:14px 16px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Volunteer signup</h1><p>Join the crew for an upcoming event. We will email event details to registered volunteers.</p>${notice}<div class="event"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.event_date || event.settings.date || "Date to be announced")}</span><span>${escapeHtml(event.settings.location || "Location to be announced")}</span></div><form method="post" action="/volunteer"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required><label for="phone">Phone number</label><input id="phone" name="phone" type="tel" autocomplete="tel" required><label for="role">Volunteer role</label><select id="role" name="role" required><option value="">Choose a role</option>${roleOptions}</select><label class="check"><input name="alertOptIn" type="checkbox"><span>Keep me on the volunteer alert list for future Campbell's Crew opportunities.</span></label><button>Complete volunteer signup →</button></form></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function volunteerEventChooserPage(events) {
  const cards = events.map((event) => {
    const roles = (Array.isArray(event.settings.roles) ? event.settings.roles : []).filter((role) => role.enabled && role.title);
    const counts = event.volunteerSignupCounts || {};
    const spots = roles.reduce((total, role) => total + Math.max(0, (Number(role.capacity) || 0) - (Number(counts[role.title]) || 0)), 0);
    const date = event.event_date || event.settings.date || "Date to be announced";
    return `<article class="event-choice"><p class="eyebrow">Volunteer opportunity</p><h2>${escapeHtml(event.title)}</h2><p><strong>${escapeHtml(date)} · ${escapeHtml(event.settings.time || "Time to be announced")}</strong><br>${escapeHtml(event.settings.location || "Location to be announced")}</p><div class="choice-footer"><span>${spots} ${spots === 1 ? "spot" : "spots"} open</span><a href="/volunteer?event=${encodeURIComponent(event.id)}">Choose this event →</a></div></article>`;
  }).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Choose an event | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#fff;color:var(--ink);font-family:Arial,sans-serif}main{width:min(100% - 40px,900px);margin:52px auto 70px}.back,.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.back{display:inline-block;margin:0 0 30px;color:var(--forest);text-decoration:none}.eyebrow{color:var(--forest)}h1{margin:0 0 12px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(36px,6vw,56px);line-height:.95;letter-spacing:-.05em;text-transform:uppercase}.intro{max-width:620px;margin-bottom:30px;color:var(--gray);line-height:1.55}.choices{display:grid;gap:16px}.event-choice{padding:28px;border:1px solid var(--line);border-left:6px solid var(--green);background:#fff;box-shadow:0 14px 36px rgba(17,24,33,.08)}.event-choice h2{margin:8px 0 12px;font-size:25px}.event-choice p:not(.eyebrow){margin:0;color:var(--gray);line-height:1.55}.event-choice p strong{color:var(--ink)}.choice-footer{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:22px;font-weight:800}.choice-footer span{color:var(--forest)}.choice-footer a{display:inline-flex;min-height:46px;padding:0 17px;align-items:center;background:var(--green);color:var(--ink);font-size:10px;letter-spacing:.1em;text-decoration:none;text-transform:uppercase}@media(max-width:620px){main{width:min(100% - 26px,900px);margin-top:28px}.event-choice{padding:23px}.choice-footer{align-items:stretch;flex-direction:column}.choice-footer a{justify-content:center}}</style></head><body><main><a class="back" href="/">← Back to Campbell's Crew Cares</a><p class="eyebrow">Volunteer signup</p><h1>Choose an event.</h1><p class="intro">Campbell's Crew has more than one volunteer opportunity open. Select the event you would like to support.</p><div class="choices">${cards}</div></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function volunteerGroupForm(event, roles, selectedRole, accessToken, notice) {
  const roleOptions = roles.map((role) => `<option value="${escapeHtml(role.title)}" ${selectedRole?.title === role.title ? "selected" : ""}>${escapeHtml(role.title)} · ${escapeHtml(role.shift || "Shift to be announced")}</option>`).join("");
  const memberCard = (primary = false) => `<fieldset class="member-card" data-member><legend>${primary ? "Volunteer 1" : "Additional volunteer"}</legend><div class="grid"><label>First name<input data-first autocomplete="given-name" required></label><label>Last name<input data-last autocomplete="family-name" required></label></div><label>Email address<input data-email type="email" autocomplete="email" required></label>${primary ? `<label>Mobile phone<input data-phone type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label>` : `<label>Mobile phone <small>(optional)</small><input data-phone type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555"></label>`}<label>Volunteer role<select data-role required>${roleOptions}</select></label>${primary ? "" : `<button class="button light member-remove" type="button">Remove this person</button>`}</fieldset>`;
  const access = accessToken ? `&access=${encodeURIComponent(accessToken)}` : "";
  return `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles${access}" aria-label="Back">←</a><p class="eyebrow">Step 2 of 2</p><h1>Who is<br>volunteering?</h1><p>Add everyone signing up together. Each person needs a different email address so they receive their own event rules and confirmation.</p>${notice}<form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}" id="group-signup-form"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><input type="hidden" name="access" value="${escapeHtml(accessToken)}"><input type="hidden" name="membersJson" value=""><div id="member-list">${memberCard(true)}</div><template id="additional-member-template">${memberCard(false)}</template><button class="button light" type="button" id="add-volunteer-member">+ Add another person</button><label class="check"><input name="agreement" type="checkbox" required><span>Everyone listed agrees to follow Campbell's Crew event and child-safety instructions.</span></label><button class="button dark">Complete signups →</button></form></article><script>document.addEventListener('DOMContentLoaded',()=>{const form=document.querySelector('#group-signup-form'),list=document.querySelector('#member-list'),template=document.querySelector('#additional-member-template');document.querySelector('#add-volunteer-member').addEventListener('click',()=>{list.append(template.content.cloneNode(true));});list.addEventListener('click',(event)=>{if(event.target.matches('.member-remove')) event.target.closest('[data-member]').remove();});form.addEventListener('submit',(event)=>{const members=[...list.querySelectorAll('[data-member]')].map((card)=>({firstName:card.querySelector('[data-first]').value,lastName:card.querySelector('[data-last]').value,email:card.querySelector('[data-email]').value,phone:card.querySelector('[data-phone]').value,role:card.querySelector('[data-role]').value}));const emails=members.map((member)=>member.email.trim().toLowerCase());if(new Set(emails).size!==emails.length){event.preventDefault();alert('Each volunteer needs a different email address.');return;}form.elements.membersJson.value=JSON.stringify(members);});});</script>`;
}

function volunteerManageRequestPage(event, message = "", error = "") {
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  return `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}" aria-label="Close">×</a><p class="eyebrow">Existing volunteer</p><h1>Manage your signup</h1><p>Enter the email address you used to sign up. We’ll open your signup here so you can change your role, cancel, or add another person.</p>${notice}<form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}"><input type="hidden" name="action" value="manage-request"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><label>Email address<input name="email" type="email" autocomplete="email" required></label><button class="button green">Manage my signup →</button></form></article>`;
}

async function volunteerManagePage(env, event, token, email, message = "", error = "") {
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const { results: signups } = await env.DB.prepare("SELECT s.id, s.role, v.name, v.email FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.event_id = ? AND v.email = ? ORDER BY s.created_at ASC").bind(event.id, email).all();
  const roles = (Array.isArray(event.settings.roles) ? event.settings.roles : []).filter((role) => role.enabled && role.title);
  const optionList = (selected) => roles.map((role) => `<option value="${escapeHtml(role.title)}" ${role.title === selected ? "selected" : ""}>${escapeHtml(role.title)} · ${escapeHtml(role.shift || "Shift to be announced")}</option>`).join("");
  const forms = signups.map((signup) => `<section class="member-card"><p class="eyebrow">Registered volunteer</p><h2>${escapeHtml(signup.name)}</h2><p>${escapeHtml(signup.email)}</p><form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}&manage=${encodeURIComponent(token)}"><input type="hidden" name="action" value="manage-update"><input type="hidden" name="signupId" value="${escapeHtml(signup.id)}"><label>Volunteer role<select name="role">${optionList(signup.role)}</select></label><button class="button dark">Save role change</button></form><form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}&manage=${encodeURIComponent(token)}" onsubmit="return confirm('Remove this volunteer from the event?')"><input type="hidden" name="action" value="manage-cancel"><input type="hidden" name="signupId" value="${escapeHtml(signup.id)}"><button class="button light">Cancel this signup</button></form></section>`).join("") || `<p>No current signup is associated with this email address.</p>`;
  const card = `<article class="step-card"><a class="back" href="/volunteer?event=${encodeURIComponent(event.id)}">← Back to event</a><p class="eyebrow">Private signup link</p><h1>Your signup</h1><p>Only registrations connected to this email are shown here.</p>${notice}${forms}<section class="member-card"><p class="eyebrow">Add someone else</p><h2>Add another volunteer</h2><p>They need their own email address so we can send their confirmation and event rules directly.</p><form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}&manage=${encodeURIComponent(token)}"><input type="hidden" name="action" value="manage-add"><div class="grid"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Mobile phone <small>(optional)</small><input name="phone" type="tel" inputmode="tel" autocomplete="tel"></label><label>Volunteer role<select name="role" required>${optionList("")}</select></label><button class="button green">Add volunteer →</button></form></section></article>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Manage volunteer signup | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 40px,760px);margin:52px auto 70px}.step-card{padding:42px;background:#fff;border:1px solid var(--line);border-radius:28px;box-shadow:0 20px 50px rgba(17,24,33,.11)}.back,.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.back{display:inline-block;margin-bottom:25px;color:var(--forest);text-decoration:none}.eyebrow{margin:0 0 10px;color:var(--forest)}h1{margin:0 0 12px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,5vw,52px);letter-spacing:-.055em;line-height:.9;text-transform:uppercase}h2{margin:7px 0;font-size:23px}p{color:var(--gray);line-height:1.5}.member-card{margin:20px 0;padding:20px;border:1px solid var(--line);background:#fafcfb}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}label{display:block;margin:18px 0 7px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}input,select{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);background:#fff;font:16px Arial,sans-serif}.button{display:inline-flex;min-height:50px;margin-top:16px;padding:0 21px;align-items:center;justify-content:center;border:1px solid var(--ink);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.dark{color:#fff;background:var(--ink)}.light{color:var(--ink);background:#fff}.green{color:var(--ink);background:var(--green);border-color:var(--green)}.notice{padding:13px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}@media(max-width:620px){main{width:min(100% - 26px,760px);margin-top:28px}.step-card{padding:28px 22px}.grid{grid-template-columns:1fr}.button{width:100%}}</style></head><body><main>${card}</main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function liveVolunteerSignupPage(events, query, message = "", error = "") {
  if (!events.length) return volunteerDirectoryPage(message, error);
  if (events.length > 1 && !query.get("event")) return volunteerEventChooserPage(events);
  const event = events.find((item) => item.id === query.get("event")) || events[0];
  const roles = (Array.isArray(event.settings.roles) ? event.settings.roles : []).filter((role) => role.enabled && role.title);
  const signupCounts = event.volunteerSignupCounts || {};
  const spotsOpen = (role) => Math.max(0, (Number(role.capacity) || 0) - (Number(signupCounts[role.title]) || 0));
  const totalSpots = roles.reduce((total, role) => total + spotsOpen(role), 0);
  const selectedRole = roles.find((role) => role.title === query.get("role")) || roles[0];
  const step = query.get("step") || "home";
  const accessToken = query.get("access") || "";
  const access = accessToken ? `&access=${encodeURIComponent(accessToken)}` : "";
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const details = query.get("details") === "1";
  const date = event.event_date || event.settings.date || "Date to be announced";
  const location = event.settings.location || "Location to be announced";
  const address = event.settings.address || "";
  const roleCards = roles.map((role) => `<label class="role-card ${spotsOpen(role) ? "" : "is-full"}"><input type="radio" name="role" value="${escapeHtml(role.title)}" ${selectedRole?.title === role.title ? "checked" : ""} ${spotsOpen(role) ? "" : "disabled"}><span><strong>${escapeHtml(role.title)}</strong><b>${escapeHtml(role.shift || "Shift to be announced")} · ${spotsOpen(role) ? `${spotsOpen(role)} spots open` : "No spots remaining · FULL"}</b><small>${escapeHtml(role.description || "Help make this event possible.")}</small></span></label>`).join("");
  const home = `<a class="back" href="/">← Back to Campbell's Crew Cares</a>${notice}<article class="event-card"><div class="open-bar"><span>Registration open</span><span>${totalSpots} spots open</span></div><div class="event-body"><div class="date-block"><small>${escapeHtml(date.split(" ")[0] || "Event")}</small><strong>${escapeHtml((date.match(/\b\d{1,2}\b/) || ["--"])[0])}</strong></div><div class="event-copy"><p class="eyebrow">Featured event</p><h1>${escapeHtml(event.title)}</h1><p><b>${escapeHtml(date)} · ${escapeHtml(event.settings.time || "Time to be announced")}</b><br>${escapeHtml(location)}</p><div class="actions"><a class="button dark" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles${access}">Choose a role →</a><a class="button light" href="/volunteer?event=${encodeURIComponent(event.id)}&step=manage">Manage existing signup</a><a class="button light" href="/volunteer?event=${encodeURIComponent(event.id)}&details=1${access}">Event details</a></div></div></div></article>`;
  const roleStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}${access}" aria-label="Back">×</a><p class="eyebrow">Step 1 of 2</p><h1>How would you<br>like to help?</h1><form method="get" action="/volunteer"><input type="hidden" name="event" value="${escapeHtml(event.id)}"><input type="hidden" name="step" value="details"><input type="hidden" name="access" value="${escapeHtml(accessToken)}">${roleCards}<button class="button dark" ${roles.length ? "" : "disabled"}>Continue with ${escapeHtml(selectedRole?.title || "selected role")} →</button></form></article>`;
  const detailStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles&role=${encodeURIComponent(selectedRole?.title || "")}${access}" aria-label="Back">←</a><p class="eyebrow">Step 2 of 2</p><h1>A few details,<br>and you're in.</h1>${notice}<div class="selected-role"><span>Selected role</span><strong>${escapeHtml(selectedRole?.title || "Volunteer")}</strong><small>${escapeHtml(selectedRole?.shift || "")}</small></div><form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><input type="hidden" name="role" value="${escapeHtml(selectedRole?.title || "")}"><input type="hidden" name="access" value="${escapeHtml(accessToken)}"><div class="grid"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Mobile phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label>${event.settings.questions?.shirtSize ? `<label>T-shirt size<select name="shirt" required><option value="">Choose size</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></label>` : ""}${event.settings.questions?.volunteerNotes ? `<label>Special notes <small>(optional)</small><textarea name="notes" placeholder="Anything organizers should know?"></textarea></label>` : ""}<label class="check"><input name="agreement" type="checkbox" required><span>I agree to follow Campbell's Crew Cares event and child-safety instructions. I understand that Campbell's Crew keeps volunteer participation records for future event coordination.</span></label><button class="button dark">Complete signup →</button></form></article>`;
  const detailPanel = `<article class="details-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}" aria-label="Close">×</a><p class="eyebrow">Event details</p><h1>${escapeHtml(event.title)}</h1><div class="details-grid"><div><span>Date</span><strong>${escapeHtml(date)}</strong></div><div><span>Time</span><strong>${escapeHtml(event.settings.time || "To be announced")}</strong></div><div><span>Location</span><strong>${escapeHtml(location)}</strong></div><div><span>Address</span><strong>${escapeHtml(address || "To be announced")}</strong></div></div><a class="button green" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles">Continue to signup →</a></article>`;
  const groupDetailStep = volunteerGroupForm(event, roles, selectedRole, accessToken, notice);
  const manageRequestStep = volunteerManageRequestPage(event, message, error);
  let content = details ? detailPanel : step === "roles" ? roleStep : step === "details" ? groupDetailStep : step === "manage" ? manageRequestStep : home;
  content = `<style>.step-card select{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);background:#fff;font:16px Arial,sans-serif}.step-card .role-card input[type="radio"]{width:20px;min-width:20px;height:20px;min-height:20px;margin:0;padding:0;border:0;flex:0 0 20px;font:inherit}.step-card .role-card.is-full{background:#f5f6f5;color:#6d7771;cursor:not-allowed}.step-card .role-card.is-full small{color:#7d8681}.member-card{margin:20px 0;padding:20px;border:1px solid var(--line);background:#fafcfb}.member-card legend{padding:0 7px;color:var(--forest);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.member-card h2{margin:7px 0;font-size:23px}.member-card p{margin:7px 0;color:var(--gray)}.member-card .button{margin-top:16px}</style>${accessToken ? `<script>history.replaceState({}, "", location.pathname + "?" + new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => key !== "access")).toString())</script>` : ""}${content}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Volunteer signup | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#fff;font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 40px,760px);margin:52px auto 70px}.back,.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.back{display:inline-block;margin:0 0 30px;color:var(--forest);text-decoration:none}.event-card,.step-card,.details-card{overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:28px;box-shadow:0 20px 50px rgba(17,24,33,.11)}.open-bar{display:flex;justify-content:space-between;padding:17px 26px;background:var(--green);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.event-body{display:grid;grid-template-columns:100px minmax(0,1fr);gap:28px;padding:38px 42px 30px}.date-block{align-self:center;text-align:center}.date-block small{font-weight:800;letter-spacing:.12em}.date-block strong{display:block;font-family:"Arial Black",Arial,sans-serif;font-size:64px;line-height:1}.eyebrow{margin:0 0 12px;color:var(--forest)}h1{margin:0 0 12px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,5vw,52px);letter-spacing:-.055em;line-height:.9;text-transform:uppercase}.event-copy p{line-height:1.55;color:var(--gray)}.event-copy p b{color:var(--ink)}.actions{display:flex;gap:10px;margin-top:24px}.button{display:inline-flex;min-height:50px;padding:0 21px;align-items:center;justify-content:center;border:1px solid var(--ink);font-size:10px;font-weight:800;letter-spacing:.1em;text-decoration:none;text-transform:uppercase;cursor:pointer}.dark{color:#fff;background:var(--ink)}.light{color:var(--ink);background:#fff}.green{color:var(--ink);background:var(--green);border-color:var(--green)}.step-card,.details-card{position:relative;padding:42px}.step-card h1{font-size:28px;line-height:1.02}.round{position:absolute;top:35px;right:42px;display:grid;width:40px;height:40px;place-items:center;border:1px solid var(--line);border-radius:50%;color:var(--ink);text-decoration:none}.role-card{display:flex;align-items:center;gap:18px;margin:10px 0;padding:16px;border:1px solid var(--line);cursor:pointer}.role-card.selected,.role-card:has(input:checked){background:#edf8ed;border:2px solid var(--forest)}.role-card input{flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:var(--forest)}.role-card>span{flex:1;min-width:0;text-align:left}.role-card strong,.role-card b,.role-card small{display:block}.role-card strong{font-size:16px}.role-card b{margin:2px 0 5px}.role-card small{color:var(--gray);line-height:1.4}.step-card form>.button{margin-top:18px}.selected-role{margin:22px 0;padding:16px 20px;border-left:5px solid var(--green);background:var(--mist)}.selected-role span,.selected-role strong,.selected-role small{display:block}.selected-role span,.details-grid span{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.step-card label:not(.role-card):not(.check){display:block;margin:18px 0 7px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.step-card input:not([type=checkbox]),textarea{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);font:16px Arial,sans-serif}.step-card textarea{min-height:100px;resize:vertical}.check{display:flex;gap:10px;margin-top:14px;color:var(--gray);font-size:13px;line-height:1.45}.check input{width:19px;height:19px;accent-color:var(--forest)}.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}.details-grid div{padding:17px;background:var(--mist)}.details-grid span,.details-grid strong{display:block}.details-grid strong{margin-top:6px;line-height:1.35}.notice{padding:13px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}@media(max-width:620px){main{width:min(100% - 26px,760px);margin-top:28px}.event-body{grid-template-columns:1fr;padding:30px}.date-block{text-align:left}.date-block strong{font-size:48px}.step-card,.details-card{padding:28px 22px}.round{top:22px;right:22px}.grid,.details-grid{grid-template-columns:1fr}.actions{flex-direction:column}.role-card{align-items:flex-start;gap:12px;margin:8px 0;padding:15px 13px}.role-card input{margin-top:3px}.role-card strong{font-size:15px}.role-card b{font-size:14px;line-height:1.25}.role-card small{font-size:13px}.step-card form>.button{width:100%;padding-inline:12px}}</style><script src="/portal-assets/volunteer-signup.js" defer></script></head><body><main>${content}</main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function volunteerDirectoryPage(message = "", error = "") {
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Volunteer directory | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--mist);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 32px,680px);margin:52px auto;padding:clamp(28px,6vw,52px);background:#fff;border-top:7px solid var(--green);box-shadow:0 18px 55px rgba(17,24,33,.12)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:var(--forest)}h1{margin:10px 0 15px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(36px,7vw,58px);line-height:.94;letter-spacing:-.05em;text-transform:uppercase}p{line-height:1.55;color:var(--gray)}label{display:block;margin:20px 0 7px}input{width:100%;min-height:50px;padding:12px;border:1px solid var(--line);font:16px Arial,sans-serif}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.check{display:flex;gap:10px;margin-top:18px;color:var(--ink);font-size:13px;font-weight:700;line-height:1.45;text-transform:none;letter-spacing:0}.check input{width:18px;min-height:18px;margin:0;accent-color:var(--forest)}button{width:100%;min-height:52px;margin-top:24px;border:0;background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.notice{padding:14px 16px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}.back{display:inline-block;margin-bottom:25px;color:var(--forest);font-size:10px;font-weight:800;letter-spacing:.12em;text-decoration:none;text-transform:uppercase}@media(max-width:560px){main{margin:26px auto}.grid{grid-template-columns:1fr}}</style></head><body><main><a class="back" href="/">← Back to Campbell's Crew Cares</a><p class="eyebrow">Volunteer directory</p><h1>Stay in the loop.</h1><p>There is not a volunteer event open right now. Join the Volunteer Directory and we will email you when future volunteer spots open. You can also return to this same page anytime.</p>${notice}<form method="post" action="/volunteer"><input type="hidden" name="action" value="directory"><div class="grid"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Mobile phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label><label class="check"><input name="agreement" type="checkbox" required><span>I would like to join the Campbell's Crew Volunteer Directory and receive future volunteer opening announcements.</span></label><button>Join volunteer directory →</button></form></main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

async function registerVolunteerDirectory(env, input) {
  const name = `${String(input.firstName || "").trim()} ${String(input.lastName || "").trim()}`.trim();
  const email = String(input.email || "").trim().toLowerCase(); const phone = String(input.phone || "").trim();
  if (!name || !phone || !isValidEmailAddress(email)) return { error: "Please enter your full name, a complete email address, and phone number." };
  let profile = await env.DB.prepare("SELECT id FROM volunteer_profiles WHERE email = ?").bind(email).first();
  if (!profile) { profile = { id: randomId("volunteer") }; await env.DB.prepare("INSERT INTO volunteer_profiles (id, name, email, phone, alert_opt_in) VALUES (?, ?, ?, ?, 1)").bind(profile.id, name.slice(0, 120), email, phone.slice(0, 30)).run(); }
  else await env.DB.prepare("UPDATE volunteer_profiles SET name = ?, phone = ?, alert_opt_in = 1 WHERE id = ?").bind(name.slice(0, 120), phone.slice(0, 30), profile.id).run();
  await audit(env, null, "volunteer_directory_joined", "volunteer_profile", profile.id);
  return { id: profile.id, name, email };
}

async function sendVolunteerDirectoryConfirmation(env, recipient, name) {
  const event = await env.DB.prepare("SELECT title, event_date, settings_json FROM events ORDER BY updated_at DESC LIMIT 1").first();
  const fallback = { subject: "You're in the Campbell's Crew Volunteer Directory", body: "Hi {{name}},\n\nThanks for joining the Campbell's Crew Cares Volunteer Directory.\n\nWe will email you whenever future volunteer spots open. You can also find new opportunities right here on the Campbell's Crew website.\n\nWe look forward to having you on the crew." };
  const message = event ? eventEmailTemplate(event, "directory-confirm", fallback, { name }) : { subject: fallback.subject, body: fallback.body.replace("{{name}}", emailLine(name)) };
  if (message) await sendEmail(env, recipient, message.subject, message.body);
}

async function registerVolunteer(env, input, codeGranted = false) {
  const event = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
  const settings = event ? eventSettings(event) : null;
  const roles = Array.isArray(settings?.roles) ? settings.roles.filter((role) => role.enabled && role.title) : [];
  const status = settings?.volunteerStatus;
  const codeMatches = status === "code" && String(input.accessCode || "").trim() === String(settings.volunteerCode || "").trim();
  const selectedRole = roles.find((role) => role.title === String(input.role || ""));
  if (!event || !["open", "code"].includes(status) || (status === "code" && !codeGranted && !codeMatches) || !selectedRole) return { error: "That volunteer opportunity is not available." };
  if (!input.name || !input.email || !input.role) return { error: "Please complete your name, email address, and volunteer role." };
  if (!isValidEmailAddress(input.email)) return { error: "Enter a complete email address, such as name@example.com." };
  const email = String(input.email).trim().toLowerCase();
  const currentRoleSignups = await env.DB.prepare("SELECT COUNT(*) AS count FROM volunteer_signups WHERE event_id = ? AND role = ?").bind(event.id, selectedRole.title).first();
  if ((Number(currentRoleSignups?.count) || 0) >= (Number(selectedRole.capacity) || 0)) return { error: "That volunteer role is now full. Please choose another open role." };
  let profile = await env.DB.prepare("SELECT id FROM volunteer_profiles WHERE email = ?").bind(email).first();
  if (!profile) {
    profile = { id: randomId("volunteer") };
    await env.DB.prepare("INSERT INTO volunteer_profiles (id, name, email, phone, alert_opt_in) VALUES (?, ?, ?, ?, ?)")
      .bind(profile.id, String(input.name).slice(0, 120), email, String(input.phone).slice(0, 30), 0).run();
  } else await env.DB.prepare("UPDATE volunteer_profiles SET name = ?, phone = ? WHERE id = ?")
    .bind(String(input.name).slice(0, 120), String(input.phone).slice(0, 30), profile.id).run();
  const signupId = randomId("signup");
  const notes = [input.shirt ? `T-shirt size: ${String(input.shirt).slice(0, 30)}` : "", String(input.notes || "").slice(0, 1900)].filter(Boolean).join("\n");
  try {
    await env.DB.prepare("INSERT INTO volunteer_signups (id, event_id, volunteer_id, role, notes) VALUES (?, ?, ?, ?, ?)")
      .bind(signupId, event.id, profile.id, String(input.role).slice(0, 100), notes).run();
  } catch { return { error: "That email is already registered for this event." }; }
  await audit(env, null, "volunteer_signed_up", "volunteer_signup", signupId, event.id);
  return { id: signupId, event };
}

async function registerVolunteerGroup(env, input, codeGranted = false) {
  const members = Array.isArray(input.members) ? input.members.slice(0, 8) : [];
  if (!members.length) return { error: "Add at least one volunteer." };
  const normalized = members.map((member) => ({
    name: `${String(member.firstName || "").trim()} ${String(member.lastName || "").trim()}`.trim(),
    email: String(member.email || "").trim().toLowerCase(),
    phone: String(member.phone || "").trim(),
    role: String(member.role || "").trim(),
    shirt: String(member.shirt || "").trim(),
    notes: String(member.notes || "").trim()
  }));
  if (normalized.some((member) => !member.name || !isValidEmailAddress(member.email) || !member.role)) return { error: "Every volunteer needs a full name, unique email address, and role." };
  if (!normalized[0].phone) return { error: "Please add a mobile phone number for the first volunteer." };
  if (new Set(normalized.map((member) => member.email)).size !== normalized.length) return { error: "Each volunteer needs a different email address." };

  const event = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
  const settings = event ? eventSettings(event) : null;
  const roles = Array.isArray(settings?.roles) ? settings.roles.filter((role) => role.enabled && role.title) : [];
  const status = settings?.volunteerStatus;
  const codeMatches = status === "code" && String(input.accessCode || "").trim() === String(settings.volunteerCode || "").trim();
  if (!event || !["open", "code"].includes(status) || (status === "code" && !codeGranted && !codeMatches)) return { error: "That volunteer opportunity is not available." };
  if (normalized.some((member) => !roles.some((role) => role.title === member.role))) return { error: "One of the selected roles is no longer available." };

  for (const email of normalized.map((member) => member.email)) {
    const existing = await env.DB.prepare("SELECT s.id FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.event_id = ? AND v.email = ?").bind(event.id, email).first();
    if (existing) return { error: "One of those email addresses is already registered for this event." };
  }
  for (const role of roles) {
    const requested = normalized.filter((member) => member.role === role.title).length;
    if (!requested) continue;
    const current = await env.DB.prepare("SELECT COUNT(*) AS count FROM volunteer_signups WHERE event_id = ? AND role = ?").bind(event.id, role.title).first();
    if ((Number(current?.count) || 0) + requested > (Number(role.capacity) || 0)) return { error: `${role.title} no longer has enough open spots for everyone in this signup.` };
  }

  const registrations = [];
  for (const member of normalized) {
    const result = await registerVolunteer(env, { ...member, eventId: input.eventId }, codeGranted);
    if (result.error) return { error: result.error };
    registrations.push({ ...member, id: result.id, event: result.event });
  }
  return { registrations, event };
}

async function registerRecipient(env, input, codeGranted = false) {
  const event = await env.DB.prepare("SELECT id, title, event_type, settings_json FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
  const settings = event ? eventSettings(event) : null;
  const status = settings?.recipientStatus;
  const codeMatches = status === "code" && String(input.accessCode || "").trim() === String(settings.recipientCode || "").trim();
  if (!event || event.event_type !== "shopping" || !["open", "code"].includes(status) || (status === "code" && !codeGranted && !codeMatches)) return { error: "That recipient application is not available." };
  if (!input.guardianName || !input.email || !input.phone || !Array.isArray(input.children) || !input.children.length) return { error: "Please complete the responsible party information and add at least one child." };
  if (!isValidEmailAddress(input.email)) return { error: "Enter a complete email address, such as name@example.com." };
  const submittedChildren = input.children.slice(0, 12).filter((child) => child?.firstName && child?.lastName);
  if (!submittedChildren.length) return { error: "Add at least one child with a full name." };
  if (submittedChildren.some((child) => !photoFromDataUrl(child.photoDataUrl))) return { error: "A valid JPG or PNG photo is required for every child before the application can be submitted." };
  const email = String(input.email).trim().toLowerCase();
  const phone = String(input.phone).trim();
  const address = input.address && typeof input.address === "object" ? input.address : {};
  const { results: existingHouseholds } = await env.DB.prepare("SELECT guardian_name, email, phone, address_json FROM recipient_households WHERE event_id = ?").bind(event.id).all();
  const flags = [];
  if (existingHouseholds.some((household) => normalizedMatchValue(household.guardian_name) === normalizedMatchValue(input.guardianName))) flags.push("Responsible party name matches another application");
  if (existingHouseholds.some((household) => household.email === email)) flags.push("Email used on another application");
  if (existingHouseholds.some((household) => normalizedMatchValue(household.phone) === normalizedMatchValue(phone))) flags.push("Phone used on another application");
  const addressKey = normalizedMatchValue(`${address.address || ""}${address.zip || ""}`);
  if (addressKey && existingHouseholds.some((household) => { try { const saved = JSON.parse(household.address_json || "{}"); return normalizedMatchValue(`${saved.address || ""}${saved.zip || ""}`) === addressKey; } catch { return false; } })) flags.push("Household address matches another application");
  const addressState = String(address.state || "AZ").trim().toUpperCase();
  if (addressState && addressState !== "AZ") flags.push("Address is outside Arizona");
  const { results: existingChildren } = await env.DB.prepare("SELECT c.first_name, c.last_name FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id WHERE h.event_id = ?").bind(event.id).all();
  const matchingNames = submittedChildren.filter((child) => existingChildren.some((existing) => normalizedMatchValue(`${existing.first_name} ${existing.last_name}`) === normalizedMatchValue(`${child.firstName} ${child.lastName}`)));
  if (matchingNames.length) flags.push(matchingNames.length === 1 ? "Child name matches another application" : `${matchingNames.length} child names match another application`);
  const adults = submittedChildren.filter((child) => Number(ageFromBirthDate(child.birthDate)) >= 18);
  if (adults.length) flags.push(adults.length === 1 ? "Child is age 18 or older" : `${adults.length} children are age 18 or older`);
  let householdId = recipientApplicationReference();
  while (await env.DB.prepare("SELECT id FROM recipient_households WHERE id = ?").bind(householdId).first()) householdId = recipientApplicationReference();
  await env.DB.prepare("INSERT INTO recipient_households (id, event_id, guardian_name, email, phone, flags_json, address_json, application_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(householdId, event.id, String(input.guardianName).slice(0, 120), email, phone.slice(0, 30), JSON.stringify(flags), JSON.stringify(address), JSON.stringify({ notes: String(input.notes || "").slice(0, 2000), ...(input.application && typeof input.application === "object" ? input.application : {}) })).run();
  for (const child of submittedChildren) {
    const childId = randomId("child");
    const photo = photoFromDataUrl(child.photoDataUrl);
    let photoKey = null;
    if (photo) {
      photoKey = `children/${householdId}/${childId}.jpg`;
      await env.PRIVATE_UPLOADS.put(photoKey, photo.bytes, { httpMetadata: { contentType: photo.contentType }, customMetadata: { householdId, childId } });
    }
    const details = child.details && typeof child.details === "object" ? { ...child.details } : {};
    const braApplicable = braBudgetEnabled(settings) && /^(girl|girls|woman|women)$/i.test(String(details.gender || "").trim());
    if (!braApplicable) delete details.bra;
    await env.DB.prepare("INSERT INTO recipient_children (id, household_id, first_name, last_name, birth_date, details_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(childId, householdId, String(child.firstName).slice(0, 80), String(child.lastName).slice(0, 80), child.birthDate || null, JSON.stringify(details)).run();
    if (photoKey) await env.DB.prepare("UPDATE recipient_children SET photo_key = ? WHERE id = ?").bind(photoKey, childId).run();
  }
  await audit(env, null, "recipient_application_submitted", "recipient_household", householdId, event.id);
  return { id: householdId, event, flags, photosSaved: submittedChildren.length };
}

async function audit(env, actor, action, targetType, targetId, eventId = null, metadata = {}) {
  await env.DB.prepare("INSERT INTO audit_log (id, actor_user_id, event_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(randomId("audit"), actor?.id || null, eventId, action, targetType, targetId, JSON.stringify(metadata)).run();
}

async function api(request, env, url, user) {
  if (url.pathname === "/portal-api/health") return json({ ready: true, mode: env.PORTAL_MODE || "closed", emailDelivery: "not_configured" });
  if (url.pathname === "/portal-api/public/events" && request.method === "GET") return json({ events: await activeEvents(env), mode: env.PORTAL_MODE || "closed" });
  if (url.pathname === "/portal-api/public/event-stories" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, title, event_type, event_date, settings_json FROM events WHERE status = 'closed' ORDER BY event_date DESC").all();
    const stories = results.map((event) => { let settings = {}; try { settings = JSON.parse(event.settings_json || "{}"); } catch {} const story = settings.publicStory || {}; const closeout = settings.closeout || {}; const outcome = event.event_type === "food_bag" ? Number(closeout.bagsMade || 0) : Number(closeout.childrenAttended || 0); return { id: event.id, title: story.title || event.title, recap: story.recap || "", impactLine: String(story.impactLine || (event.event_type === "food_bag" ? `${outcome.toLocaleString()} food bags prepared` : `${outcome.toLocaleString()} children supported`)).slice(0, 180), eventDate: event.event_date || settings.date || "", eventType: event.event_type, outcome, photos: publicStoryPhotos(event, story), published: story.published === true }; }).filter((story) => story.published);
    return json({ stories });
  }
  const publicStoryPhotoMatch = url.pathname.match(/^\/portal-api\/public\/event-stories\/([^/]+)\/photos\/(\d+)$/);
  if (publicStoryPhotoMatch && request.method === "GET") {
    const event = await env.DB.prepare("SELECT id, title, status, settings_json FROM events WHERE id = ? AND status = 'closed'").bind(publicStoryPhotoMatch[1]).first();
    if (!event) return json({ error: "Photo not found." }, 404);
    let settings = {}; try { settings = JSON.parse(event.settings_json || "{}"); } catch {}
    if (settings.publicStory?.published !== true) return json({ error: "Photo not found." }, 404);
    const index = Number(publicStoryPhotoMatch[2]);
    const key = settings.publicStory?.photos?.[index]?.key;
    if (typeof key !== "string" || !key.startsWith(`public-event-stories/${event.id}/`)) return json({ error: "Photo not found." }, 404);
    const object = await env.PRIVATE_UPLOADS.get(key);
    if (!object) return json({ error: "Photo not found." }, 404);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }
  if (url.pathname === "/portal-api/public/impact" && request.method === "GET") {
    const impact = await env.DB.prepare("SELECT families_minimum, children_minimum, people_fed_minimum, years_serving FROM public_impact WHERE id = 1").first();
    return json({ impact: impact || { families_minimum: 0, children_minimum: 0, people_fed_minimum: 0, years_serving: 9 } });
  }

  if (url.pathname === "/portal-api/public/volunteer-signups" && request.method === "POST") {
    const input = await request.json();
    const result = await registerVolunteer(env, input);
    if (result.error) return json({ error: result.error }, 400);
    let emailSent = true;
    try { await sendVolunteerConfirmation(env, input.email, input.name, input.role, result.event); await audit(env, null, "volunteer_confirmation_sent", "volunteer_signup", result.id, result.event.id); }
    catch (error) { console.error("Volunteer confirmation delivery failed", error); emailSent = false; await audit(env, null, "volunteer_confirmation_failed", "volunteer_signup", result.id, result.event.id); }
    return json({ id: result.id, emailSent, message: emailSent ? "You are registered. A confirmation email is on its way." : "You are registered, but we could not send the confirmation email." }, 201);
  }

  if (url.pathname === "/portal-api/public/applications" && request.method === "POST") {
    const input = await request.json();
    const result = await registerRecipient(env, input);
    if (result.error) return json({ error: result.error }, 400);
    let emailSent = true;
    try { await sendRecipientConfirmation(env, input.email, input.guardianName, result.event); await audit(env, null, "recipient_receipt_sent", "recipient_household", result.id, result.event.id); }
    catch (error) { console.error("Recipient application receipt delivery failed", error); emailSent = false; await audit(env, null, "recipient_receipt_failed", "recipient_household", result.id, result.event.id); }
    return json({ id: result.id, emailSent, message: emailSent ? "Your application has been received for review. A receipt email is on its way." : "Your application has been received for review, but we could not send the receipt email." }, 201);
  }
  if (url.pathname === "/portal-api/organizer/emails/blast" && request.method === "POST") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    if (!input.eventId || !["all-volunteers", "signed-volunteers", "approved-applications"].includes(input.audience)) return json({ error: "Choose a valid audience." }, 400);
    const subject = emailLine(input.subject || ""); const body = String(input.body || "").trim();
    if (!subject || !body) return json({ error: "A subject and message are required." }, 400);
    const event = await env.DB.prepare("SELECT id, title, event_date, settings_json FROM events WHERE id = ?").bind(input.eventId).first();
    if (!event) return json({ error: "Event not found." }, 404);
    let results = [];
    if (input.audience === "all-volunteers") ({ results } = await env.DB.prepare("SELECT DISTINCT name, email FROM volunteer_profiles WHERE email <> ''").all());
    else if (input.audience === "signed-volunteers") ({ results } = await env.DB.prepare("SELECT DISTINCT v.name, v.email FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.event_id = ? AND v.email <> ''").bind(event.id).all());
    else ({ results } = await env.DB.prepare("SELECT guardian_name AS name, email FROM recipient_households WHERE event_id = ? AND status = 'approved' AND email <> ''").bind(event.id).all());
    const recipients = results.filter((item) => isValidEmailAddress(item.email)).slice(0, 250);
    const details = eventEmailDetails(event);
    const fill = (value, name) => String(value).replace(/{{name}}/g, emailLine(name || "there")).replace(/{{event}}/g, emailLine(event.title)).replace(/{{date}}/g, details.date).replace(/{{time}}/g, details.time).replace(/{{location}}/g, details.location);
    let sent = 0; let failed = 0;
    for (const recipient of recipients) { try { await sendEmail(env, recipient.email, fill(subject, recipient.name), fill(body, recipient.name)); sent += 1; } catch (error) { console.error("Blast email delivery failed", recipient.email, error); failed += 1; } }
    await audit(env, user, "email_blast_sent", "event", event.id, event.id, { audience: input.audience, sent, failed });
    return json({ sent, failed, total: recipients.length });
  }
  if (url.pathname === "/portal-api/me" && request.method === "GET") return user ? json({ user }) : json({ user: null }, 401);

  if (url.pathname === "/portal-api/organizer/impact" && request.method === "PUT") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    const safeNumber = (value, fallback = 0) => Math.max(0, Math.min(10000000, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback));
    const families = safeNumber(input.familiesMinimum); const children = safeNumber(input.childrenMinimum); const peopleFed = safeNumber(input.peopleFedMinimum); const years = safeNumber(input.yearsServing, 9);
    await env.DB.prepare("INSERT INTO public_impact (id, families_minimum, children_minimum, people_fed_minimum, years_serving, updated_at) VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET families_minimum = excluded.families_minimum, children_minimum = excluded.children_minimum, people_fed_minimum = excluded.people_fed_minimum, years_serving = excluded.years_serving, updated_at = CURRENT_TIMESTAMP")
      .bind(families, children, peopleFed, years).run();
    await audit(env, user, "public_impact_updated", "public_impact", "1", null, { families, children, peopleFed, years });
    return json({ impact: { families_minimum: families, children_minimum: children, people_fed_minimum: peopleFed, years_serving: years } });
  }

  if (url.pathname === "/portal-api/events" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const { results } = await env.DB.prepare("SELECT id, title, event_type, event_date, status, settings_json, created_at, updated_at FROM events ORDER BY event_date DESC").all();
    return json({ events: results.map((event) => ({ ...event, settings: JSON.parse(event.settings_json) })) });
  }

  if (url.pathname === "/portal-api/events" && request.method === "POST") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    if (!input.title || !["shopping", "food_bag"].includes(input.eventType)) return json({ error: "A title and supported event type are required." }, 400);
    const id = randomId("event");
    await env.DB.prepare("INSERT INTO events (id, title, event_type, event_date, status, settings_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, String(input.title).slice(0, 160), input.eventType, input.eventDate || null, input.status === "open" ? "open" : "draft", JSON.stringify(input.settings || {})).run();
    await audit(env, user, "event_created", "event", id, id);
    return json({ id }, 201);
  }

  const eventCloseoutMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)\/closeout$/);
  if (eventCloseoutMatch && request.method === "PUT") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Executive Owner or Event Administrator permission required." }, 403);
    const input = await request.json();
    const existing = await env.DB.prepare("SELECT id, title, event_type, event_date, settings_json FROM events WHERE id = ?").bind(eventCloseoutMatch[1]).first();
    if (!existing) return json({ error: "Event not found." }, 404);
    let settings = {}; try { settings = JSON.parse(existing.settings_json || "{}"); } catch {}
    const safeNumber = (value) => Math.max(0, Math.min(10000000, Number.isFinite(Number(value)) ? Number(value) : 0));
    const closeout = {
      eventType: existing.event_type === "food_bag" ? "food-bag" : "shopping",
      bagsPlanned: safeNumber(input.bagsPlanned), bagsMade: safeNumber(input.bagsMade),
      childrenRegistered: safeNumber(input.childrenRegistered), childrenAttended: safeNumber(input.childrenAttended),
      volunteersRegistered: safeNumber(input.volunteersRegistered), volunteersAttended: safeNumber(input.volunteersAttended),
      volunteerHours: safeNumber(input.volunteerHours), totalSpent: safeNumber(input.totalSpent),
      notes: String(input.notes || "").trim().slice(0, 5000), closedAt: settings.closeout?.closedAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    settings.closeout = closeout; settings.closed = true; settings.volunteerStatus = "closed"; settings.recipientStatus = "closed";
    if (!settings.publicStory) settings.publicStory = { title: existing.title, recap: "", impactLine: "", photos: [], published: false, updatedAt: new Date().toISOString() };
    await env.DB.prepare("UPDATE events SET status = 'closed', settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(settings), existing.id).run();
    await audit(env, user, existing.settings_json?.includes('"closeout"') ? "event_closeout_updated" : "event_closed", "event", existing.id, existing.id);
    return json({ report: { id: existing.id, event: existing.title, eventDate: existing.event_date || settings.date || "", eventType: closeout.eventType, status: "Closed out", ...closeout } });
  }

  const eventStoryMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)\/public-story$/);
  const eventStoryPhotoMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)\/public-story\/photos$/);
  const organizerStoryPhotoMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)\/public-story\/photos\/(\d+)$/);
  if (organizerStoryPhotoMatch && request.method === "GET") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Executive Owner or Event Administrator permission required." }, 403);
    const event = await env.DB.prepare("SELECT id, settings_json FROM events WHERE id = ? AND status = 'closed'").bind(organizerStoryPhotoMatch[1]).first();
    if (!event) return json({ error: "Photo not found." }, 404);
    let settings = {}; try { settings = JSON.parse(event.settings_json || "{}"); } catch {}
    const key = settings.publicStory?.photos?.[Number(organizerStoryPhotoMatch[2])]?.key;
    if (typeof key !== "string" || !key.startsWith(`public-event-stories/${event.id}/`)) return json({ error: "Photo not found." }, 404);
    const object = await env.PRIVATE_UPLOADS.get(key);
    if (!object) return json({ error: "Photo not found." }, 404);
    return new Response(object.body, { headers: securityHeaders(new Headers({ "Content-Type": object.httpMetadata?.contentType || "image/jpeg" })) });
  }
  if (eventStoryPhotoMatch && request.method === "POST") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Executive Owner or Event Administrator permission required." }, 403);
    const input = await request.json(); const existing = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ? AND status = 'closed'").bind(eventStoryPhotoMatch[1]).first();
    if (!existing) return json({ error: "Completed event not found." }, 404);
    const photo = photoFromDataUrl(input.photoDataUrl);
    if (!photo) return json({ error: "Please choose a JPG or PNG photo smaller than 1 MB." }, 400);
    let settings = {}; try { settings = JSON.parse(existing.settings_json || "{}"); } catch {}
    const story = settings.publicStory || { title: existing.title, recap: "", impactLine: "", published: false };
    const photos = Array.isArray(story.photos) ? story.photos.slice(0, 12) : [];
    if (photos.length >= 12) return json({ error: "An event story can include up to 12 photos." }, 400);
    const extension = photo.contentType === "image/png" ? "png" : photo.contentType === "image/webp" ? "webp" : "jpg";
    const key = `public-event-stories/${existing.id}/${randomId("photo")}.${extension}`;
    await env.PRIVATE_UPLOADS.put(key, photo.bytes, { httpMetadata: { contentType: photo.contentType }, customMetadata: { eventId: existing.id, visibility: "public-story" } });
    story.photos = [...photos, { key, alt: String(input.alt || existing.title).trim().slice(0, 220) }]; story.updatedAt = new Date().toISOString(); settings.publicStory = story;
    await env.DB.prepare("UPDATE events SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(settings), existing.id).run();
    await audit(env, user, "public_event_story_photo_added", "event", existing.id, existing.id);
    return json({ story });
  }
  if (eventStoryMatch && request.method === "PUT") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Executive Owner or Event Administrator permission required." }, 403);
    const input = await request.json(); const existing = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ? AND status = 'closed'").bind(eventStoryMatch[1]).first();
    if (!existing) return json({ error: "Completed event not found." }, 404);
    let settings = {}; try { settings = JSON.parse(existing.settings_json || "{}"); } catch {}
    const currentStory = settings.publicStory || {};
    const photos = Array.isArray(currentStory.photos) ? currentStory.photos.slice(0, 12) : [];
    if (input.published === true && !photos.length) return json({ error: "Add at least one event photo before publishing this story." }, 400);
    settings.publicStory = { title: String(input.title || existing.title).trim().slice(0, 160), recap: String(input.recap || "").trim().slice(0, 2000), impactLine: String(input.impactLine || "").trim().slice(0, 180), photos, published: input.published === true, updatedAt: new Date().toISOString() };
    await env.DB.prepare("UPDATE events SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(settings), existing.id).run();
    await audit(env, user, settings.publicStory.published ? "public_event_story_published" : "public_event_story_saved", "event", existing.id, existing.id);
    return json({ story: settings.publicStory });
  }

  const eventReopenMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)\/reopen$/);
  if (eventReopenMatch && request.method === "POST") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Executive Owner or Event Administrator permission required." }, 403);
    const existing = await env.DB.prepare("SELECT id, settings_json, status FROM events WHERE id = ?").bind(eventReopenMatch[1]).first();
    if (!existing) return json({ error: "Event not found." }, 404);
    if (existing.status !== "closed") return json({ error: "Only a completed event can be reopened." }, 400);
    let settings = {}; try { settings = JSON.parse(existing.settings_json || "{}"); } catch {}
    settings.closed = false; settings.volunteerStatus = "closed"; settings.recipientStatus = "closed";
    await env.DB.prepare("UPDATE events SET status = 'draft', settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(settings), existing.id).run();
    await audit(env, user, "event_reopened", "event", existing.id, existing.id);
    return json({ id: existing.id, status: "draft" });
  }

  const eventMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)$/);
  if (eventMatch && request.method === "PUT") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    const existing = await env.DB.prepare("SELECT id, status FROM events WHERE id = ?").bind(eventMatch[1]).first();
    if (!existing) return json({ error: "Event not found." }, 404);
    const status = ["draft", "open", "closed"].includes(input.status) ? input.status : "draft";
    if (status === "closed" && existing.status !== "closed") return json({ error: "Use the Finish Event close-out workflow to close an event." }, 400);
    if (existing.status === "closed" && status !== "closed") return json({ error: "Use the confirmed re-open action to reopen an event." }, 400);
    await env.DB.prepare("UPDATE events SET title = ?, event_date = ?, status = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(String(input.title || "Untitled event").slice(0, 160), input.eventDate || null, status, JSON.stringify(input.settings || {}), eventMatch[1]).run();
    await audit(env, user, "event_updated", "event", eventMatch[1], eventMatch[1]);
    return json({ id: eventMatch[1] });
  }

  if (eventMatch && request.method === "DELETE") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Only the Executive Owner account can delete an event." }, 403);
    const existing = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ?").bind(eventMatch[1]).first();
    if (!existing) return json({ error: "Event not found." }, 404);
    const { results: children } = await env.DB.prepare("SELECT c.photo_key FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id WHERE h.event_id = ?").bind(existing.id).all();
    await audit(env, user, "event_deleted", "event", existing.id, existing.id, { title: existing.title });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM recipient_children WHERE household_id IN (SELECT id FROM recipient_households WHERE event_id = ?)").bind(existing.id),
      env.DB.prepare("DELETE FROM recipient_households WHERE event_id = ?").bind(existing.id),
      env.DB.prepare("DELETE FROM volunteer_signups WHERE event_id = ?").bind(existing.id),
      env.DB.prepare("DELETE FROM email_jobs WHERE event_id = ?").bind(existing.id),
      env.DB.prepare("UPDATE audit_log SET event_id = NULL WHERE event_id = ?").bind(existing.id),
      env.DB.prepare("DELETE FROM events WHERE id = ?").bind(existing.id)
    ]);
    let settings = {}; try { settings = JSON.parse(existing.settings_json || "{}"); } catch {}
    const storyPhotos = Array.isArray(settings.publicStory?.photos) ? settings.publicStory.photos : [];
    await Promise.all([...children.filter((child) => child.photo_key).map((child) => child.photo_key), ...storyPhotos.map((photo) => photo?.key).filter(Boolean)].map((key) => env.PRIVATE_UPLOADS.delete(key)));
    return json({ id: existing.id });
  }

  if (url.pathname === "/portal-api/organizer/volunteers" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const { results } = await env.DB.prepare("SELECT COALESCE(s.id, v.id) AS id, s.event_id, s.role, s.status, s.notes, COALESCE(s.created_at, v.created_at) AS created_at, v.name, v.email, v.phone, e.title AS event_title FROM volunteer_profiles v LEFT JOIN volunteer_signups s ON s.volunteer_id = v.id LEFT JOIN events e ON e.id = s.event_id ORDER BY COALESCE(s.created_at, v.created_at) DESC").all();
    return json({ volunteers: results });
  }

  const volunteerSignupMatch = url.pathname.match(/^\/portal-api\/organizer\/volunteers\/([^/]+)$/);
  if (volunteerSignupMatch && request.method === "DELETE") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const signup = await env.DB.prepare("SELECT id, event_id FROM volunteer_signups WHERE id = ?").bind(volunteerSignupMatch[1]).first();
    if (!signup) return json({ error: "That volunteer signup was not found." }, 404);
    await env.DB.prepare("DELETE FROM volunteer_signups WHERE id = ?").bind(signup.id).run();
    await audit(env, user, "volunteer_signup_removed", "volunteer_signup", signup.id, signup.event_id);
    return json({ id: signup.id });
  }

  if (url.pathname === "/portal-api/organizer/recipients" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const { results } = await env.DB.prepare("SELECT h.id, h.event_id, h.guardian_name, h.email, h.phone, h.status, h.flags_json, h.created_at, h.address_json, h.application_json, e.title AS event_title FROM recipient_households h JOIN events e ON e.id = h.event_id ORDER BY h.created_at DESC").all();
    const recipients = await Promise.all(results.map(async (household) => {
      const { results: children } = await env.DB.prepare("SELECT id, first_name, last_name, birth_date, status, photo_key, details_json FROM recipient_children WHERE household_id = ? ORDER BY first_name, last_name").bind(household.id).all();
      let address = {}; let application = {}; let flags = [];
      try { address = JSON.parse(household.address_json || "{}"); } catch {}
      try { application = JSON.parse(household.application_json || "{}"); } catch {}
      try { flags = JSON.parse(household.flags_json || "[]"); } catch {}
      const otherHouseholds = results.filter((other) => other.id !== household.id);
      if (otherHouseholds.some((other) => other.event_id === household.event_id && normalizedMatchValue(other.guardian_name) === normalizedMatchValue(household.guardian_name)) && !flags.includes("Responsible party name matches another application")) flags.push("Responsible party name matches another application");
      if (otherHouseholds.some((other) => other.event_id === household.event_id && other.email === household.email) && !flags.includes("Email used on another application")) flags.push("Email used on another application");
      if (otherHouseholds.some((other) => other.event_id === household.event_id && normalizedMatchValue(other.phone) === normalizedMatchValue(household.phone)) && !flags.includes("Phone used on another application")) flags.push("Phone used on another application");
      const addressKey = normalizedMatchValue(`${address.address || ""}${address.zip || ""}`);
      if (addressKey && otherHouseholds.some((other) => { try { const saved = JSON.parse(other.address_json || "{}"); return other.event_id === household.event_id && normalizedMatchValue(`${saved.address || ""}${saved.zip || ""}`) === addressKey; } catch { return false; } }) && !flags.includes("Household address matches another application")) flags.push("Household address matches another application");
      if (String(address.state || "AZ").trim().toUpperCase() !== "AZ" && !flags.includes("Address is outside Arizona")) flags.push("Address is outside Arizona");
      const { results: otherChildren } = await env.DB.prepare("SELECT c.first_name, c.last_name FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id WHERE h.event_id = ? AND h.id <> ?").bind(household.event_id, household.id).all();
      const matchingNames = children.filter((child) => otherChildren.some((other) => normalizedMatchValue(`${other.first_name} ${other.last_name}`) === normalizedMatchValue(`${child.first_name} ${child.last_name}`)));
      const nameFlag = matchingNames.length === 1 ? "Child name matches another application" : `${matchingNames.length} child names match another application`;
      if (matchingNames.length && !flags.some((flag) => /child name(?:s)? match(?:es)? another application/.test(flag))) flags.push(nameFlag);
      const adultChildren = children.filter((child) => Number(ageFromBirthDate(child.birth_date)) >= 18);
      const ageFlag = adultChildren.length === 1 ? "Child is age 18 or older" : `${adultChildren.length} children are age 18 or older`;
      if (adultChildren.length && !flags.some((flag) => /child(?:ren)? (?:is|are) age 18 or older/.test(flag))) flags.push(ageFlag);
      return { ...household, reference_code: recipientApplicationReference(household.id), address, application, flags, children: children.map((child) => { let details = {}; try { details = JSON.parse(child.details_json || "{}"); } catch {} return { ...child, photo_url: child.photo_key ? `/portal-api/organizer/children/${encodeURIComponent(child.id)}/photo` : "", details }; }) };
    }));
    return json({ recipients });
  }

  const childPhotoMatch = url.pathname.match(/^\/portal-api\/organizer\/children\/([^/]+)\/photo$/);
  if (childPhotoMatch && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const child = await env.DB.prepare("SELECT photo_key FROM recipient_children WHERE id = ?").bind(childPhotoMatch[1]).first();
    if (!child?.photo_key) return json({ error: "A photo was not found for this child." }, 404);
    const photo = await env.PRIVATE_UPLOADS.get(child.photo_key);
    if (!photo) return json({ error: "The photo file was not found." }, 404);
    const headers = securityHeaders(new Headers({ "Content-Type": photo.httpMetadata?.contentType || "image/jpeg" }));
    return new Response(photo.body, { headers });
  }

  const eventRulesPdfMatch = url.pathname.match(/^\/portal-api\/organizer\/events\/([^/]+)\/rules\.pdf$/);
  if (eventRulesPdfMatch && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const event = await env.DB.prepare("SELECT id, title, event_date, settings_json FROM events WHERE id = ?").bind(eventRulesPdfMatch[1]).first();
    if (!event) return json({ error: "Event not found." }, 404);
    const pdf = await eventRulesDocument(env, url.origin, event);
    const filename = `${String(event.title || "event").replace(/[^a-z0-9]+/gi, "-")}-rules.pdf`;
    return new Response(pdf, { headers: securityHeaders(new Headers({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` })) });
  }

  if (childPhotoMatch && request.method === "POST") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    const photo = photoFromDataUrl(input.photoDataUrl);
    if (!photo) return json({ error: "Please choose a JPG, PNG, or WebP photo." }, 400);
    const child = await env.DB.prepare("SELECT id, household_id, photo_key FROM recipient_children WHERE id = ?").bind(childPhotoMatch[1]).first();
    if (!child) return json({ error: "That child record was not found." }, 404);
    const photoKey = child.photo_key || `children/${child.household_id}/${child.id}.jpg`;
    await env.PRIVATE_UPLOADS.put(photoKey, photo.bytes, { httpMetadata: { contentType: photo.contentType }, customMetadata: { householdId: child.household_id, childId: child.id } });
    await env.DB.prepare("UPDATE recipient_children SET photo_key = ? WHERE id = ?").bind(photoKey, child.id).run();
    await audit(env, user, "recipient_child_photo_saved", "recipient_child", child.id);
    return json({ photoUrl: `/portal-api/organizer/children/${encodeURIComponent(child.id)}/photo` });
  }

  const childProfilePdfMatch = url.pathname.match(/^\/portal-api\/organizer\/children\/([^/]+)\/profile\.pdf$/);
  if (childProfilePdfMatch && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const child = await env.DB.prepare("SELECT c.id, c.first_name, c.last_name, c.birth_date, c.photo_key, c.details_json, h.id AS household_id, h.guardian_name, h.application_json, e.id AS event_id, e.title, e.event_date, e.settings_json FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id JOIN events e ON e.id = h.event_id WHERE c.id = ?").bind(childProfilePdfMatch[1]).first();
    if (!child) return json({ error: "That child record was not found." }, 404);
    let details = {}; let application = {}; let settings = {};
    try { details = JSON.parse(child.details_json || "{}"); } catch {}
    try { application = JSON.parse(child.application_json || "{}"); } catch {}
    try { settings = JSON.parse(child.settings_json || "{}"); } catch {}
    const pdf = await filledProfileDocument(env, url.origin, [{ child: { ...child, details }, household: { id: child.household_id, guardian_name: child.guardian_name, application }, event: { id: child.event_id, title: child.title, event_date: child.event_date, settings_json: JSON.stringify(settings) } }]);
    const filename = `${String(child.first_name || "child").replace(/[^a-z0-9]+/gi, "-")}-shopping-profile.pdf`;
    return new Response(pdf, { headers: securityHeaders(new Headers({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` })) });
  }

  const childPacketPdfMatch = url.pathname.match(/^\/portal-api\/organizer\/children\/([^/]+)\/packet\.pdf$/);
  if (childPacketPdfMatch && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const child = await env.DB.prepare("SELECT c.id, c.first_name, c.last_name, c.birth_date, c.photo_key, c.details_json, h.id AS household_id, h.guardian_name, h.application_json, e.id AS event_id, e.title, e.event_date, e.settings_json FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id JOIN events e ON e.id = h.event_id WHERE c.id = ?").bind(childPacketPdfMatch[1]).first();
    if (!child) return json({ error: "That child record was not found." }, 404);
    let details = {}; let application = {}; let settings = {};
    try { details = JSON.parse(child.details_json || "{}"); } catch {}
    try { application = JSON.parse(child.application_json || "{}"); } catch {}
    try { settings = JSON.parse(child.settings_json || "{}"); } catch {}
    const pdf = await filledProfileDocument(env, url.origin, [{ child: { ...child, details }, household: { id: child.household_id, guardian_name: child.guardian_name, application }, event: { id: child.event_id, title: child.title, event_date: child.event_date, settings_json: JSON.stringify(settings) } }], true);
    const filename = `${String(child.first_name || "child").replace(/[^a-z0-9]+/gi, "-")}-complete-packet.pdf`;
    return new Response(pdf, { headers: securityHeaders(new Headers({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` })) });
  }

  if (url.pathname === "/portal-api/organizer/packets.pdf" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const eventId = String(url.searchParams.get("event") || "");
    if (!eventId) return json({ error: "Choose an event before printing packets." }, 400);
    const { results } = await env.DB.prepare("SELECT c.id, c.first_name, c.last_name, c.birth_date, c.photo_key, c.details_json, h.id AS household_id, h.guardian_name, h.application_json, e.id AS event_id, e.title, e.event_date, e.settings_json FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id JOIN events e ON e.id = h.event_id WHERE h.event_id = ? AND c.status = 'approved' ORDER BY c.first_name, c.last_name").bind(eventId).all();
    if (!results.length) return json({ error: "There are no approved child packets for this event." }, 404);
    const records = results.map((child) => { let details = {}; let application = {}; let settings = {}; try { details = JSON.parse(child.details_json || "{}"); } catch {} try { application = JSON.parse(child.application_json || "{}"); } catch {} try { settings = JSON.parse(child.settings_json || "{}"); } catch {} return { child: { ...child, details }, household: { id: child.household_id, guardian_name: child.guardian_name, application }, event: { id: child.event_id, title: child.title, event_date: child.event_date, settings_json: JSON.stringify(settings) } }; });
    const pdf = await filledProfileDocument(env, url.origin, records, true);
    return new Response(pdf, { headers: securityHeaders(new Headers({ "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=campbells-crew-complete-packets.pdf" })) });
  }

  const childProfilePrintMatch = url.pathname.match(/^\/portal-api\/organizer\/children\/([^/]+)\/profile\/print$/);
  if (childProfilePrintMatch && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const child = await env.DB.prepare("SELECT c.id, c.first_name, c.last_name, c.details_json, h.id AS household_id, h.guardian_name, h.application_json, e.id AS event_id, e.title, e.settings_json FROM recipient_children c JOIN recipient_households h ON h.id = c.household_id JOIN events e ON e.id = h.event_id WHERE c.id = ?").bind(childProfilePrintMatch[1]).first();
    if (!child) return json({ error: "That child record was not found." }, 404);
    let details = {}; let application = {}; let settings = {};
    try { details = JSON.parse(child.details_json || "{}"); } catch {}
    try { application = JSON.parse(child.application_json || "{}"); } catch {}
    try { settings = JSON.parse(child.settings_json || "{}"); } catch {}
    const html = childProfilePrintPage({ child: { ...child, details }, household: { id: child.household_id, guardian_name: child.guardian_name, application }, event: { id: child.event_id, title: child.title, settings_json: JSON.stringify(settings) } });
    const headers = securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" }));
    headers.set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    return new Response(html, { headers });
  }

  const recipientHouseholdMatch = url.pathname.match(/^\/portal-api\/organizer\/recipients\/([^/]+)$/);
  if (recipientHouseholdMatch && request.method === "DELETE") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const household = await env.DB.prepare("SELECT id, event_id, guardian_name FROM recipient_households WHERE id = ?").bind(recipientHouseholdMatch[1]).first();
    if (!household) return json({ error: "That recipient application was not found." }, 404);
    const { results: children } = await env.DB.prepare("SELECT photo_key FROM recipient_children WHERE household_id = ?").bind(household.id).all();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM recipient_children WHERE household_id = ?").bind(household.id),
      env.DB.prepare("DELETE FROM recipient_households WHERE id = ?").bind(household.id)
    ]);
    await Promise.all(children.filter((child) => child.photo_key).map((child) => env.PRIVATE_UPLOADS.delete(child.photo_key)));
    await audit(env, user, "recipient_application_deleted", "recipient_household", household.id, household.event_id);
    return json({ id: household.id });
  }

  const recipientDecisionMatch = url.pathname.match(/^\/portal-api\/organizer\/recipients\/([^/]+)\/children\/([^/]+)$/);
  if (recipientDecisionMatch && request.method === "PATCH") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    const decision = String(input.decision || "");
    const decisionNote = String(input.decisionNote || "").trim().slice(0, 1000);
    if (!["approved", "declined", "waitlisted", "needs_information", "info", "review"].includes(decision)) return json({ error: "That decision is not supported." }, 400);
    if (decision === "declined" && !decisionNote) return json({ error: "Please provide a reason before declining this application." }, 400);
    const household = await env.DB.prepare("SELECT h.id, h.event_id, h.guardian_name, h.email, e.title, e.event_date, e.settings_json FROM recipient_households h JOIN events e ON e.id = h.event_id WHERE h.id = ?").bind(recipientDecisionMatch[1]).first();
    if (!household) return json({ error: "That recipient household was not found." }, 404);
    const child = await env.DB.prepare("SELECT id, first_name, last_name, details_json FROM recipient_children WHERE id = ? AND household_id = ?").bind(recipientDecisionMatch[2], household.id).first();
    if (!child) return json({ error: "That child was not found in this household." }, 404);
    let details = {}; try { details = JSON.parse(child.details_json || "{}"); } catch {}
    if (decision === "declined") details.organizerDecisionNote = decisionNote;
    await env.DB.prepare("UPDATE recipient_children SET status = ?, details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(decision, JSON.stringify(details), child.id).run();
    const { results: children } = await env.DB.prepare("SELECT status FROM recipient_children WHERE household_id = ?").bind(household.id).all();
    const statuses = children.map((record) => record.status === "needs_information" ? "info" : record.status);
    const householdStatus = !statuses.length ? "review" : statuses.every((status) => status === statuses[0]) ? statuses[0] : statuses.some((status) => ["review", "submitted", "info"].includes(status)) ? "review" : "mixed";
    await env.DB.prepare("UPDATE recipient_households SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(householdStatus, household.id).run();
    let emailSent = null;
    if (["approved", "declined", "waitlisted"].includes(decision)) {
      try { await sendRecipientDecisionEmail(env, household.email, household.guardian_name, `${child.first_name} ${child.last_name}`.trim(), decision, household, decisionNote); emailSent = true; }
      catch (error) { console.error("Recipient decision delivery failed", error); emailSent = false; }
    }
    await audit(env, user, `recipient_child_${decision}`, "recipient_child", child.id, household.event_id, decision === "declined" ? { decisionNote } : {});
    return json({ id: child.id, decision, householdStatus, emailSent });
  }

  if (url.pathname === "/portal-api/organizer/reports" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const { results } = await env.DB.prepare("SELECT e.id, e.title, e.event_type, e.event_date, e.status, e.settings_json, COUNT(DISTINCT s.id) AS volunteer_count, COUNT(DISTINCT CASE WHEN s.status = 'checked_in' THEN s.id END) AS checkedin_volunteer_count, COUNT(DISTINCT h.id) AS household_count, COUNT(DISTINCT c.id) AS child_count FROM events e LEFT JOIN volunteer_signups s ON s.event_id = e.id LEFT JOIN recipient_households h ON h.event_id = e.id LEFT JOIN recipient_children c ON c.household_id = h.id WHERE e.status = 'closed' GROUP BY e.id ORDER BY e.event_date DESC").all();
    return json({ reports: results.map((event) => { let settings = {}; try { settings = JSON.parse(event.settings_json || "{}"); } catch {} const hasSavedCloseout = Object.prototype.hasOwnProperty.call(settings, "closeout"); const closeout = settings.closeout || {}; return { id: event.id, event: event.title, eventDate: event.event_date || settings.date || "", eventType: event.event_type === "food_bag" ? "food-bag" : "shopping", status: "Closed out", publicStory: settings.publicStory || null, bagsPlanned: Number(hasSavedCloseout ? closeout.bagsPlanned ?? 0 : settings.bagGoal ?? 0), bagsMade: Number(closeout.bagsMade ?? 0), childrenRegistered: Number(hasSavedCloseout ? closeout.childrenRegistered ?? 0 : event.child_count ?? 0), childrenAttended: Number(closeout.childrenAttended ?? 0), volunteersRegistered: Number(hasSavedCloseout ? closeout.volunteersRegistered ?? 0 : event.volunteer_count ?? 0), volunteersAttended: Number(hasSavedCloseout ? closeout.volunteersAttended ?? 0 : event.checkedin_volunteer_count ?? 0), volunteerHours: Number(closeout.volunteerHours ?? 0), totalSpent: Number(closeout.totalSpent ?? 0), notes: String(closeout.notes || ""), closedAt: closeout.closedAt || event.updated_at || "" }; }) });
  }

  if (url.pathname === "/portal-api/organizer/users" && request.method === "GET") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    const { results } = await env.DB.prepare("SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at, (SELECT i.expires_at FROM user_invitations i WHERE i.user_id = u.id AND i.used_at IS NULL ORDER BY i.created_at DESC LIMIT 1) AS invitation_expires_at FROM users u ORDER BY u.created_at ASC").all();
    return json({ users: results });
  }

  if (url.pathname === "/portal-api/organizer/users" && request.method === "POST") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    const input = await request.json();
    const email = String(input.email || "").trim().toLowerCase();
    const displayName = String(input.displayName || "").trim();
    const role = String(input.role || "");
    if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || !["event_admin", "read_only", "checkin_staff"].includes(role)) return json({ error: "Enter a name, a valid email address, and a permission level." }, 400);
    const existing = await env.DB.prepare("SELECT id, status FROM users WHERE email = ?").bind(email).first();
    if (existing?.status === "active") return json({ error: "An active organizer account already uses that email address." }, 409);
    let id = existing?.id;
    if (!id) {
      id = randomId("user");
      const salt = base64Url(crypto.getRandomValues(new Uint8Array(18)));
      const placeholderPassword = base64Url(crypto.getRandomValues(new Uint8Array(24)));
      await env.DB.prepare("INSERT INTO users (id, email, display_name, role, password_hash, password_salt, status) VALUES (?, ?, ?, ?, ?, ?, 'disabled')")
        .bind(id, email, displayName.slice(0, 100), role, await passwordHash(placeholderPassword, salt), salt).run();
    }
    const invitation = await issueInvitation(env, id);
    await audit(env, user, existing ? "organizer_invitation_renewed" : "organizer_invited", "user", id, null, { role });
    const setupUrl = `${url.origin}/setup?token=${encodeURIComponent(invitation.token)}`;
    let emailSent = true;
    try { await sendOrganizerInvitation(env, email, displayName, role, setupUrl); await audit(env, user, "organizer_invitation_email_sent", "user", id); }
    catch (error) { console.error("Organizer invitation delivery failed", error); emailSent = false; await audit(env, user, "organizer_invitation_email_failed", "user", id); }
    return json({ id, setupUrl, expiresAt: invitation.expiresAt, emailSent }, 201);
  }

  const invitationMatch = url.pathname.match(/^\/portal-api\/organizer\/users\/([^/]+)\/invitation$/);
  if (invitationMatch && request.method === "POST") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    const account = await env.DB.prepare("SELECT id, email, display_name, role, status FROM users WHERE id = ?").bind(invitationMatch[1]).first();
    if (!account || account.status === "active") return json({ error: "A new invitation is only available for a pending account." }, 400);
    const invitation = await issueInvitation(env, account.id);
    await audit(env, user, "organizer_invitation_renewed", "user", account.id);
    const setupUrl = `${url.origin}/setup?token=${encodeURIComponent(invitation.token)}`;
    let emailSent = true;
    try { await sendOrganizerInvitation(env, account.email, account.display_name, account.role, setupUrl); await audit(env, user, "organizer_invitation_email_sent", "user", account.id); }
    catch (error) { console.error("Organizer invitation delivery failed", error); emailSent = false; await audit(env, user, "organizer_invitation_email_failed", "user", account.id); }
    return json({ id: account.id, setupUrl, expiresAt: invitation.expiresAt, emailSent });
  }

  const userMatch = url.pathname.match(/^\/portal-api\/organizer\/users\/([^/]+)$/);
  if (userMatch && request.method === "PATCH") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    if (userMatch[1] === user.id) return json({ error: "You cannot change your own permission level here." }, 400);
    const input = await request.json();
    const role = String(input.role || "");
    if (!["event_admin", "read_only", "checkin_staff"].includes(role)) return json({ error: "Choose a valid organizer permission level." }, 400);
    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userMatch[1]).first();
    if (!target || target.role === "executive_owner") return json({ error: "Executive Owner accounts cannot be changed here." }, 400);
    await env.DB.prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(role, target.id).run();
    await audit(env, user, "organizer_permission_changed", "user", target.id, null, { role });
    return json({ id: target.id, role });
  }
  if (userMatch && request.method === "DELETE") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    if (userMatch[1] === user.id) return json({ error: "You cannot delete your own account." }, 400);
    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userMatch[1]).first();
    if (!target || target.role === "executive_owner") return json({ error: "Executive Owner accounts cannot be deleted here." }, 400);
    await env.DB.batch([env.DB.prepare("DELETE FROM user_invitations WHERE user_id = ?").bind(target.id), env.DB.prepare("DELETE FROM users WHERE id = ?").bind(target.id)]);
    await audit(env, user, "organizer_account_deleted", "user", target.id);
    return json({ id: target.id });
  }
  if (invitationMatch && request.method === "DELETE") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    if (invitationMatch[1] === user.id) return json({ error: "You cannot cancel your own account invitation." }, 400);
    const target = await env.DB.prepare("SELECT id, status FROM users WHERE id = ?").bind(invitationMatch[1]).first();
    if (!target || target.status === "active") return json({ error: "Only pending invitations can be cancelled." }, 400);
    await env.DB.prepare("DELETE FROM user_invitations WHERE user_id = ? AND used_at IS NULL").bind(target.id).run();
    await audit(env, user, "organizer_invitation_cancelled", "user", target.id);
    return json({ id: target.id });
  }
  const resetMatch = url.pathname.match(/^\/portal-api\/organizer\/users\/([^/]+)\/password-reset$/);
  if (resetMatch && request.method === "POST") {
    if (!user || !OWNER_ROLES.has(user.role)) return json({ error: "Executive Owner permission required." }, 403);
    const account = await env.DB.prepare("SELECT id, email, status FROM users WHERE id = ?").bind(resetMatch[1]).first();
    if (!account || account.status !== "active") return json({ error: "A password-reset link is available only for an active organizer account." }, 400);
    const invitation = await issueInvitation(env, account.id);
    await sendPasswordResetEmail(env, account.email, `${url.origin}/setup?token=${encodeURIComponent(invitation.token)}`);
    await audit(env, user, "organizer_password_reset_issued", "user", account.id);
    return json({ id: account.id, setupUrl: `${url.origin}/setup?token=${encodeURIComponent(invitation.token)}`, expiresAt: invitation.expiresAt });
  }

  if (url.pathname === "/portal-api/bootstrap-owner" && request.method === "POST") {
    // Disabled by default. Initial account creation happens only with a deployment secret,
    // never from a public browser form or hard-coded credential.
    if (!env.BOOTSTRAP_TOKEN || request.headers.get("X-Bootstrap-Token") !== env.BOOTSTRAP_TOKEN) return json({ error: "Not available." }, 404);
    const input = await request.json();
    if (!input.email || !input.password || String(input.password).length < 10) return json({ error: "Use an email and a password of at least 10 characters." }, 400);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first();
    if (existing) return json({ error: "Owner already exists." }, 409);
    const salt = base64Url(crypto.getRandomValues(new Uint8Array(18)));
    const id = randomId("user");
    await env.DB.prepare("INSERT INTO users (id, email, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, 'executive_owner', ?, ?)")
      .bind(id, input.email, String(input.displayName || "Executive Owner").slice(0, 100), await passwordHash(input.password, salt), salt).run();
    await audit(env, { id }, "owner_bootstrapped", "user", id);
    return json({ id }, 201);
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Logout is a protected portal action too. It must reach this Worker so it
    // can expire the HttpOnly session cookie before redirecting to sign-in.
    const isPortal = PORTAL_PATHS.has(url.pathname) || url.pathname === "/logout" || url.pathname.startsWith("/organizer/") || url.pathname.startsWith("/portal-assets/") || url.pathname.startsWith("/portal-api/");
    if (!isPortal) return new Response("Not found", { status: 404 });
    if (!env.DB || !env.ASSETS) return json({ error: "Portal deployment is not configured." }, 503);
    const user = await readSession(request, env);

    if (url.pathname.startsWith("/portal-api/")) return api(request, env, url, user);
    if (url.pathname === "/logout") return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: "/login", "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` })) });
    if (url.pathname === "/forgot-password") {
      if (request.method !== "POST") return forgotPasswordPage();
      const form = await request.formData();
      const email = String(form.get("email") || "").trim().toLowerCase();
      const account = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(email).first();
      if (account) {
        try {
          const invitation = await issueInvitation(env, account.id);
          await sendPasswordResetEmail(env, email, `${url.origin}/setup?token=${encodeURIComponent(invitation.token)}`);
          await audit(env, null, "organizer_password_reset_requested", "user", account.id);
        } catch (error) { console.error("Password reset delivery failed", error); }
      }
      return forgotPasswordPage("If an active organizer account uses that address, a reset link has been sent.");
    }
    if (url.pathname === "/google-email/connect") {
      if (!user || !OWNER_ROLES.has(user.role)) return Response.redirect(`${url.origin}/login`, 303);
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return portalStatusPage("Email connection unavailable", "Add the Google OAuth client ID and secret in Cloudflare before connecting email delivery.");
      const state = await makeSession(user, env.PORTAL_SESSION_SECRET, 600);
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorization.search = new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: `${url.origin}/google-email/callback`, response_type: "code", scope: "https://www.googleapis.com/auth/gmail.send", access_type: "offline", include_granted_scopes: "true", prompt: "select_account consent", login_hint: EMAIL_SENDER, state }).toString();
      return Response.redirect(authorization.toString(), 302);
    }
    if (url.pathname === "/google-email/callback") {
      const owner = await readSignedUserToken(url.searchParams.get("state"), env);
      const code = url.searchParams.get("code");
      if (!owner || !OWNER_ROLES.has(owner.role) || !code) return portalStatusPage("Email connection could not be completed", "Return to Settings and try connecting the Submission mailbox again.");
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: `${url.origin}/google-email/callback`, grant_type: "authorization_code" }) });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok) {
        console.error("Google OAuth code exchange failed", tokenResponse.status, token.error, token.error_description);
        return portalStatusPage("Email connection could not be completed", "Google rejected the connection details. In Cloudflare, confirm the Google OAuth client ID and client secret are both saved exactly as provided by Google, then return to Settings and try again.");
      }
      if (!token.refresh_token) return portalStatusPage("Email connection needs one more approval", "Choose Submission@campbellscrew.com when Google asks which account to use, then approve the requested permission. Google needs to issue a reusable authorization so password-reset emails can be sent later.");
      const encrypted = await encryptEmailToken(token.refresh_token, env);
      await env.DB.prepare("INSERT INTO email_oauth_credentials (id, encrypted_refresh_token, sender_email, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET encrypted_refresh_token = excluded.encrypted_refresh_token, sender_email = excluded.sender_email, updated_at = CURRENT_TIMESTAMP").bind(encrypted, EMAIL_SENDER).run();
      await audit(env, owner, "google_email_connected", "email_sender", EMAIL_SENDER);
      return portalStatusPage("Email delivery connected", `Password-reset emails will now be sent from ${EMAIL_SENDER}.`, `<a class="action" href="/organizer#organizer/settings">Return to Settings →</a>`);
    }
    if (url.pathname === "/setup") {
      const setupForm = request.method === "POST" ? await request.formData() : null;
      const token = setupForm ? String(setupForm.get("token") || "") : String(url.searchParams.get("token") || "");
      if (!token) return portalStatusPage("Invitation link needed", "Use the account-setup link supplied by a Campbell's Crew Executive Owner.");
      const invitation = await env.DB.prepare("SELECT id, user_id, expires_at, used_at FROM user_invitations WHERE token_hash = ?").bind(await tokenHash(token)).first();
      if (!invitation || invitation.used_at || Date.parse(invitation.expires_at) < Date.now()) return portalStatusPage("Invitation expired", "Ask a Campbell's Crew Executive Owner to create a new account invitation.");
      const account = await env.DB.prepare("SELECT id, email, display_name, role FROM users WHERE id = ?").bind(invitation.user_id).first();
      if (!account) return portalStatusPage("Invitation unavailable", "Ask a Campbell's Crew Executive Owner to create a new account invitation.");
      if (request.method === "POST") {
        const password = String(setupForm.get("password") || "");
        const confirm = String(setupForm.get("confirm") || "");
        if (password.length < 10) return accountSetupPage(token, account.email, "Use a password of at least 10 characters.", 400);
        if (password !== confirm) return accountSetupPage(token, account.email, "The password confirmation does not match.", 400);
        const salt = base64Url(crypto.getRandomValues(new Uint8Array(18)));
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await passwordHash(password, salt), salt, account.id),
          env.DB.prepare("UPDATE user_invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invitation.id)
        ]);
        await audit(env, account, "organizer_account_activated", "user", account.id);
        const session = await makeSession({ id: account.id, role: account.role }, env.PORTAL_SESSION_SECRET);
        return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: "/organizer#organizer/dashboard", "Set-Cookie": `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}` })) });
      }
      return accountSetupPage(token, account.email);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      const clientKey = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.LOGIN_RATE_LIMITER && !(await env.LOGIN_RATE_LIMITER.limit({ key: clientKey })).success) return loginPage("Too many attempts. Please wait one minute and try again.", 429);
      const form = await request.formData(); const email = String(form.get("email") || "").trim(); const password = String(form.get("password") || ""); const lifetime = form.get("remember") === "on" ? REMEMBER_SESSION_SECONDS : SESSION_SECONDS;
      const account = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!account || account.status !== "active" || !constantTimeEqual(await passwordHash(password, account.password_salt), account.password_hash)) return loginPage("That email and password do not match.", 401);
      const session = await makeSession(account, env.PORTAL_SESSION_SECRET, lifetime);
      await audit(env, account, "login", "user", account.id);
      return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: "/organizer#organizer/dashboard", "Set-Cookie": `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}` })) });
    }
    if (url.pathname === "/login") return user ? Response.redirect(`${url.origin}/organizer#organizer/dashboard`, 303) : loginPage();
    if (url.pathname === "/organizer" || url.pathname.startsWith("/organizer/")) {
      if (!user) return Response.redirect(`${url.origin}/login`, 303);
      return serveOrganizerPrototype(request, env, url, user);
    }
    if (url.pathname === "/volunteer") {
      const events = await publicVolunteerEvents(env);
      if (request.method === "POST") {
        const form = await request.formData();
        const input = Object.fromEntries(form);
        if (input.action === "directory") {
          if (input.agreement !== "on") return volunteerDirectoryPage("", "Please confirm that you would like future volunteer opening announcements.");
          const result = await registerVolunteerDirectory(env, input);
          if (result.error) return volunteerDirectoryPage("", result.error);
          try { await sendVolunteerDirectoryConfirmation(env, result.email, result.name); return volunteerDirectoryPage("Thanks for joining the Volunteer Directory. A confirmation email is on its way."); }
          catch (error) { console.error("Volunteer directory confirmation delivery failed", error); return volunteerDirectoryPage("You are in the Volunteer Directory, but we could not send the confirmation email."); }
        }
        const event = events.find((item) => item.id === input.eventId);
        if (input.action === "unlock") {
          if (!event || event.settings.volunteerStatus !== "code" || String(input.accessCode || "").trim() !== String(event.settings.volunteerCode || "").trim()) return volunteerCodePage(event || { id: "", title: "this event" }, "That invitation code does not match.");
          const access = await volunteerAccessToken(event.id, env.PORTAL_SESSION_SECRET);
          return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: `/volunteer?event=${encodeURIComponent(event.id)}&access=${encodeURIComponent(access)}` })) });
        }
        if (!event) return liveVolunteerSignupPage(events, url.searchParams, "", "That volunteer opportunity is not available.");
        const manageToken = String(url.searchParams.get("manage") || "");
        const manageAccess = await readVolunteerManageToken(manageToken, event.id, env.PORTAL_SESSION_SECRET);
        if (input.action === "manage-request") {
          const email = String(input.email || "").trim().toLowerCase();
          const query = new URLSearchParams({ event: event.id, step: "manage" });
          if (!isValidEmailAddress(email)) return liveVolunteerSignupPage(events, query, "", "Enter a complete email address, such as name@example.com.");
          const existing = await env.DB.prepare("SELECT s.id FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.event_id = ? AND v.email = ? LIMIT 1").bind(event.id, email).first();
          if (!existing) return liveVolunteerSignupPage(events, query, "", "We could not find a signup for that email at this event. Check the address or sign up as a new volunteer.");
          const token = await volunteerManageToken(event.id, email, env.PORTAL_SESSION_SECRET);
          await audit(env, null, "volunteer_signup_management_opened", "volunteer_signup", existing.id, event.id);
          return volunteerManagePage(env, event, token, email);
        }
        if (["manage-update", "manage-cancel", "manage-add"].includes(String(input.action || ""))) {
          if (!manageAccess) return liveVolunteerSignupPage(events, new URLSearchParams({ event: event.id, step: "manage" }), "", "This private link has expired. Request a new one to continue.");
          if (input.action === "manage-update") {
            const signup = await env.DB.prepare("SELECT s.id, s.role FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.id = ? AND s.event_id = ? AND v.email = ?").bind(String(input.signupId || ""), event.id, manageAccess.email).first();
            const role = (Array.isArray(event.settings.roles) ? event.settings.roles : []).find((item) => item.enabled && item.title === String(input.role || ""));
            if (!signup || !role) return volunteerManagePage(env, event, manageToken, manageAccess.email, "", "Choose an available volunteer role.");
            if (signup.role !== role.title) {
              const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM volunteer_signups WHERE event_id = ? AND role = ? AND id <> ?").bind(event.id, role.title, signup.id).first();
              if ((Number(count?.count) || 0) >= (Number(role.capacity) || 0)) return volunteerManagePage(env, event, manageToken, manageAccess.email, "", "That volunteer role is now full. Please choose another role.");
              await env.DB.prepare("UPDATE volunteer_signups SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(role.title, signup.id).run();
              await audit(env, null, "volunteer_signup_role_updated", "volunteer_signup", signup.id, event.id);
            }
            return volunteerManagePage(env, event, manageToken, manageAccess.email, "Your volunteer role was updated.");
          }
          if (input.action === "manage-cancel") {
            const signup = await env.DB.prepare("SELECT s.id FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id WHERE s.id = ? AND s.event_id = ? AND v.email = ?").bind(String(input.signupId || ""), event.id, manageAccess.email).first();
            if (!signup) return volunteerManagePage(env, event, manageToken, manageAccess.email, "", "That signup could not be found.");
            await env.DB.prepare("DELETE FROM volunteer_signups WHERE id = ?").bind(signup.id).run();
            await audit(env, null, "volunteer_signup_cancelled", "volunteer_signup", signup.id, event.id);
            return volunteerManagePage(env, event, manageToken, manageAccess.email, "This volunteer has been removed from the event.");
          }
          const addInput = { ...input, eventId: event.id, name: `${String(input.firstName || "").trim()} ${String(input.lastName || "").trim()}`.trim() };
          const result = await registerVolunteer(env, addInput, true);
          if (result.error) return volunteerManagePage(env, event, manageToken, manageAccess.email, "", result.error);
          try { await sendVolunteerConfirmation(env, addInput.email, addInput.name, addInput.role, result.event); await audit(env, null, "volunteer_confirmation_sent", "volunteer_signup", result.id, event.id); }
          catch (error) { console.error("Volunteer confirmation delivery failed", error); await audit(env, null, "volunteer_confirmation_failed", "volunteer_signup", result.id, event.id); }
          return volunteerManagePage(env, event, manageToken, manageAccess.email, "The volunteer was added. Their confirmation email is on its way.");
        }
        const codeGranted = event.settings.volunteerStatus !== "code" || await hasVolunteerAccessToken(String(input.access || ""), event.id, env.PORTAL_SESSION_SECRET);
        if (!codeGranted) return volunteerCodePage(event, "Enter the invitation code before completing this signup.");
        if (input.agreement !== "on") return liveVolunteerSignupPage(events, url.searchParams, "", "Please agree to the event and child-safety instructions before continuing.");
        let members = [];
        try { members = JSON.parse(String(input.membersJson || "[]")); } catch { return liveVolunteerSignupPage(events, url.searchParams, "", "We could not read the volunteer details. Please try again."); }
        const result = await registerVolunteerGroup(env, { eventId: event.id, members }, codeGranted);
        if (result.error) return liveVolunteerSignupPage(events, url.searchParams, "", result.error);
        let sent = 0;
        for (const registration of result.registrations) {
          try { await sendVolunteerConfirmation(env, registration.email, registration.name, registration.role, registration.event); await audit(env, null, "volunteer_confirmation_sent", "volunteer_signup", registration.id, registration.event.id); sent += 1; }
          catch (error) { console.error("Volunteer confirmation delivery failed", error); await audit(env, null, "volunteer_confirmation_failed", "volunteer_signup", registration.id, registration.event.id); }
        }
        const total = result.registrations.length;
        return liveVolunteerSignupPage(events, url.searchParams, sent === total ? `${total} ${total === 1 ? "volunteer is" : "volunteers are"} registered. Each will receive a confirmation email.` : `${total} ${total === 1 ? "volunteer is" : "volunteers are"} registered, but we could not send every confirmation email.`);
      }
      const selected = events.find((item) => item.id === url.searchParams.get("event")) || events[0];
      const manageToken = String(url.searchParams.get("manage") || "");
      if (selected && manageToken) {
        const manageAccess = await readVolunteerManageToken(manageToken, selected.id, env.PORTAL_SESSION_SECRET);
        if (!manageAccess) return liveVolunteerSignupPage(events, new URLSearchParams({ event: selected.id, step: "manage" }), "", "This private link has expired. Request a new one to continue.");
        return volunteerManagePage(env, selected, manageToken, manageAccess.email);
      }
      if (selected?.settings.volunteerStatus === "code" && url.searchParams.get("step") !== "manage" && !(await hasVolunteerAccessToken(url.searchParams.get("access"), selected.id, env.PORTAL_SESSION_SECRET))) return volunteerCodePage(selected);
      return liveVolunteerSignupPage(events, url.searchParams);
    }
    if (url.pathname === "/apply") {
      const events = await publicRecipientEvents(env);
      if (request.method === "POST") {
        const form = await request.formData();
        const input = Object.fromEntries(form);
        const event = events.find((item) => item.id === input.eventId);
        if (input.action === "unlock") {
          if (!event || event.settings.recipientStatus !== "code" || String(input.accessCode || "").trim() !== String(event.settings.recipientCode || "").trim()) return recipientCodePage(event || { id: "", title: "this event" }, "That referral code does not match.");
          const access = await recipientAccessCookie(event.id, env.PORTAL_SESSION_SECRET);
          return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: `/apply?event=${encodeURIComponent(event.id)}`, "Set-Cookie": `ccc_recipient_access_${event.id}=${access}; Path=/apply; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` })) });
        }
        if (!event) return recipientApplicationPage(events, url.searchParams, "", "That recipient application is not available.");
        const codeGranted = event.settings.recipientStatus !== "code" || await hasRecipientAccess(request, event.id, env.PORTAL_SESSION_SECRET);
        if (!codeGranted) return recipientCodePage(event, "Enter the referral code before completing this application.");
        const result = await registerRecipient(env, { ...input, children: [{ firstName: input.firstName, lastName: input.lastName }] }, codeGranted);
        if (result.error) return recipientApplicationPage(events, url.searchParams, "", result.error);
        try {
          await sendRecipientConfirmation(env, input.email, input.guardianName, result.event);
          await audit(env, null, "recipient_receipt_sent", "recipient_household", result.id, result.event.id);
          return recipientApplicationPage(events, url.searchParams, "Your application has been received for review. A receipt email is on its way.");
        } catch (error) {
          console.error("Recipient application receipt delivery failed", error);
          await audit(env, null, "recipient_receipt_failed", "recipient_household", result.id, result.event.id);
          return recipientApplicationPage(events, url.searchParams, "Your application has been received for review, but we could not send the receipt email.");
        }
      }
      const selected = events.find((item) => item.id === url.searchParams.get("event")) || events[0];
      if (selected?.settings.recipientStatus === "code" && !(await hasRecipientAccess(request, selected.id, env.PORTAL_SESSION_SECRET))) return recipientCodePage(selected);
      return servePortalAsset(request, env, url);
    }
    return servePortalAsset(request, env, url);
  }
};

export { passwordHash, makeSession, readSession };

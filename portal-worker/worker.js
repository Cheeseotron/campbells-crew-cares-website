import { PDFDocument, StandardFonts, rgb } from "./vendor/pdf-lib.esm.min.js";

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

function drawProfileOverlay(page, values, font, bold, photo = null) {
  const ink = rgb(0.07, 0.10, 0.13); const muted = rgb(0.26, 0.33, 0.29); const fieldPanel = rgb(238 / 255, 243 / 255, 239 / 255); const paper = rgb(251 / 255, 252 / 255, 251 / 255); const border = rgb(0.77, 0.82, 0.79);
  const draw = (text, x, y, size = 9, options = {}) => page.drawText(String(text || ""), { x, y, size, font: options.bold ? bold : font, color: options.color || (options.muted ? muted : ink), maxWidth: options.maxWidth, lineHeight: options.lineHeight || size + 2 });
  const clear = (x, y, width, height, color = fieldPanel) => page.drawRectangle({ x, y, width, height, color });
  // The supplied template has several overlapping panel edges and labels.  Do
  // not try to patch those individual marks: cover the whole data region and
  // rebuild it on one shared 41-570 point grid so every edge lands together.
  const left = 41; const right = 570; const width = right - left;
  clear(31, 80, 560, 656, paper);
  // Remove the template's internal "profile" label; the child's name is the
  // useful title for volunteers sorting a stack of sheets.
  clear(390, 740, 180, 28, paper);
  draw(values.name, left, 710, 25, { bold: true, maxWidth: photo ? 410 : 500 });
  draw("Child information sheet", left, 686, 10.5, { muted: true });
  if (photo) {
    const photoLeft = 507; const photoBottom = 674; const photoSide = 52;
    // Fit inside the square instead of stretching or bleeding outside the
    // frame; badge upload cropping already keeps the photo well composed.
    const scale = Math.min(photoSide / photo.width, photoSide / photo.height);
    const photoWidth = photo.width * scale; const photoHeight = photo.height * scale;
    page.drawRectangle({ x: photoLeft - 2, y: photoBottom - 2, width: photoSide + 4, height: photoSide + 4, color: paper, borderColor: rgb(0.09, 0.42, 0.22), borderWidth: 1.5 });
    page.drawImage(photo, { x: photoLeft + (photoSide - photoWidth) / 2, y: photoBottom + (photoSide - photoHeight) / 2, width: photoWidth, height: photoHeight });
  }
  // The original template's details panel is wider than the rebuilt grid.
  // Keep this cover exactly on the shared right edge so no colored strip leaks
  // beyond the information box.
  clear(left, 574, width, 71);
  page.drawRectangle({ x: left, y: 574, width, height: 71, color: fieldPanel, borderColor: border, borderWidth: .55 });
  page.drawLine({ start: { x: 217, y: 574 }, end: { x: 217, y: 645 }, thickness: .55, color: border });
  page.drawLine({ start: { x: 393, y: 574 }, end: { x: 393, y: 645 }, thickness: .55, color: border });
  page.drawLine({ start: { x: 41, y: 609 }, end: { x: 570, y: 609 }, thickness: .55, color: border });
  [["CHILD NAME", 51, 629], ["APPLICATION #", 228, 629], ["DATE / EVENT", 404, 629], ["VOLUNTEER", 51, 593], ["AGE / BIRTHDATE", 228, 593], ["EMERGENCY CONTACT", 404, 593]].forEach(([label, x, y]) => draw(label, x, y, 6.3, { bold: true, muted: true }));
  draw(values.name, 51, 615, 9.3, { bold: true, maxWidth: 130 });
  draw(values.application, 228, 615, 9.3, { bold: true, maxWidth: 130 });
  draw(values.event, 404, 615, 8.2, { bold: true, maxWidth: 128 });
  draw(values.volunteer, 51, 580, 7.7, { maxWidth: 130 });
  draw(values.age, 228, 580, 7.3, { maxWidth: 130 });
  draw(values.emergency, 404, 580, 6.6, { maxWidth: 128 });
  // Sizes panel: the header, table, and all value cells share the same outer
  // edge as the details, notes, and budget panels. A bra field only exists
  // when that event enabled it and the child's sizing category is applicable.
  page.drawRectangle({ x: left, y: 420, width, height: 142, color: paper, borderColor: border, borderWidth: .55 });
  page.drawRectangle({ x: left, y: 534, width, height: 28, color: fieldPanel, borderColor: border, borderWidth: .55 });
  draw("Sizes", 53, 544, 13, { bold: true });
  const sizeTop = 523; const sizeBottom = 430; const sizeLeft = 52; const sizeRight = 559; const rowMid = 477;
  page.drawRectangle({ x: sizeLeft, y: sizeBottom, width: sizeRight - sizeLeft, height: sizeTop - sizeBottom, borderColor: border, borderWidth: .5 });
  page.drawLine({ start: { x: sizeLeft, y: rowMid }, end: { x: sizeRight, y: rowMid }, thickness: .5, color: border });
  const drawSizeCell = (label, item, x, y, width) => { draw(label, x + 10, y + 28, 6.8, { bold: true, muted: true }); draw(item, x + 10, y + 12, 8.5, { bold: true, maxWidth: width - 20 }); };
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
  page.drawRectangle({ x: left, y: 317, width, height: 91, color: paper, borderColor: border, borderWidth: .55 });
  page.drawLine({ start: { x: 305, y: 317 }, end: { x: 305, y: 408 }, thickness: .55, color: border });
  draw("Preferences, likes, colors, and styles", 53, 389, 8, { bold: true });
  draw("Accommodations and helpful notes", 317, 389, 8, { bold: true });
  draw(values.preferences, 53, 365, 7.7, { maxWidth: 240, lineHeight: 10 });
  draw(values.accommodations, 317, 365, 7.7, { maxWidth: 240, lineHeight: 10 });
  // Rebuild the budget table too. Its source table is wider than the profile
  // panels, which was the remaining right-side overhang in printed packets.
  const budgetTop = 295; const budgetBottom = 88; const headerBottom = 270;
  const columns = [52, 204, 285, 385, 559];
  page.drawRectangle({ x: left, y: budgetBottom, width, height: budgetTop - budgetBottom, color: paper, borderColor: border, borderWidth: .55 });
  page.drawRectangle({ x: left, y: headerBottom, width, height: budgetTop - headerBottom, color: fieldPanel, borderColor: border, borderWidth: .55 });
  draw("Budget and optional spending tracker", 53, 280, 13, { bold: true });
  page.drawRectangle({ x: 52, y: 247, width: 507, height: 23, color: rgb(0.07, 0.10, 0.13) });
  ["ESSENTIAL", "BUDGET", "AMOUNT SPENT", "ITEM / NOTES"].forEach((label, index) => draw(label, columns[index] + 10, 255, 7, { bold: true, color: rgb(0.94, 0.98, 0.95) }));
  const budgetRows = values.budgetItems || [];
  const rowHeight = 144 / Math.max(6, budgetRows.length); const firstRowBottom = 247 - rowHeight;
  for (let index = 0; index < budgetRows.length; index += 1) {
    const y = firstRowBottom - index * rowHeight;
    page.drawRectangle({ x: 52, y, width: 507, height: rowHeight, color: paper, borderColor: border, borderWidth: .45 });
    const textY = y + Math.max(5, (rowHeight - 8) / 2);
    const textSize = rowHeight < 20 ? 6.8 : 7.7;
    draw(budgetRows[index].fixedCap ? "TOYS — FIXED CAP" : budgetRows[index].label, 62, textY, textSize, { bold: Boolean(budgetRows[index].fixedCap), maxWidth: 132 });
    draw(`$${budgetRows[index].amount}`, 214, textY, textSize, { bold: true, maxWidth: 60 });
    draw("$____________", 295, textY, rowHeight < 20 ? 6.7 : 7.4, { maxWidth: 80 });
    page.drawLine({ start: { x: 397, y: y + rowHeight / 2 }, end: { x: 545, y: y + rowHeight / 2 }, thickness: .45, color: muted });
  }
  page.drawRectangle({ x: 52, y: 88, width: 507, height: 15, color: rgb(0.88, 0.95, 0.89), borderColor: border, borderWidth: .45 });
  draw("TOTAL", 62, 93, 7.5, { bold: true });
  draw(`$${values.budgetTotal}`, 214, 93, 8, { bold: true });
  draw("$_______", 295, 93, 7.4, { bold: true });
  const toyBudget = budgetRows.find((item) => item.fixedCap);
  draw(toyBudget ? `TOYS: FIXED $${toyBudget.amount} MAX - NO TRANSFERS` : "Remaining: $_______", 397, 93, toyBudget ? 6.4 : 7.2, { bold: true, maxWidth: 150 });
  columns.slice(1, -1).forEach((x) => page.drawLine({ start: { x, y: 88 }, end: { x, y: 270 }, thickness: .45, color: border }));
  // Keep the event date in the existing footer row. This replaces both the
  // old generic label and the first attempt's extra line above the footer.
  clear(41, 24, 260, 50, paper);
  page.drawLine({ start: { x: 41, y: 49 }, end: { x: 570, y: 49 }, thickness: .55, color: border });
  draw(`Event date: ${values.eventDate}`, 41, 34, 7.5, { muted: true });
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

async function filledProfileDocument(env, origin, records, includeRules = false) {
  const profileBytes = await templatePdfBytes(env, origin, "/assets/packets/CCC_Child_Shopping_Profile.pdf");
  const rulesBytes = includeRules ? await templatePdfBytes(env, origin, "/assets/packets/CCC_Event_Rules_Sheet.pdf") : null;
  const output = await PDFDocument.create(); const font = await output.embedFont(StandardFonts.Helvetica); const bold = await output.embedFont(StandardFonts.HelveticaBold);
  for (const record of records) {
    const source = await PDFDocument.load(profileBytes); const [page] = await output.copyPages(source, [0]); output.addPage(page);
    const photo = await childPhotoForPdf(env, output, record.child.photo_key);
    drawProfileOverlay(page, childProfileValues(record), font, bold, photo);
    if (rulesBytes) { const rules = await PDFDocument.load(rulesBytes); const [rulesPage] = await output.copyPages(rules, [0]); output.addPage(rulesPage); }
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
async function serveOrganizerPrototype(request, env, url) {
  const relativePath = url.pathname.replace(/^\/organizer\/?/, "");
  const assetUrl = new URL(request.url);
  assetUrl.pathname = relativePath ? `/${relativePath}` : "/index.html";
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = securityHeaders(new Headers(asset.headers));
  if (assetUrl.pathname === "/index.html") {
    const html = (await asset.text())
      .replace("<html lang=\"en\">", "<html lang=\"en\" data-server-auth=\"true\">")
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
  const home = `<a class="back" href="/">← Back to Campbell's Crew Cares</a>${notice}<article class="event-card"><div class="open-bar"><span>Registration open</span><span>${totalSpots} spots open</span></div><div class="event-body"><div class="date-block"><small>${escapeHtml(date.split(" ")[0] || "Event")}</small><strong>${escapeHtml((date.match(/\b\d{1,2}\b/) || ["--"])[0])}</strong></div><div class="event-copy"><p class="eyebrow">Featured event</p><h1>${escapeHtml(event.title)}</h1><p><b>${escapeHtml(date)} · ${escapeHtml(event.settings.time || "Time to be announced")}</b><br>${escapeHtml(location)}</p><div class="actions"><a class="button dark" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles${access}">Choose a role →</a><a class="button light" href="/volunteer?event=${encodeURIComponent(event.id)}&details=1${access}">Event details</a></div></div></div></article>`;
  const roleStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}${access}" aria-label="Back">×</a><p class="eyebrow">Step 1 of 2</p><h1>How would you<br>like to help?</h1><form method="get" action="/volunteer"><input type="hidden" name="event" value="${escapeHtml(event.id)}"><input type="hidden" name="step" value="details"><input type="hidden" name="access" value="${escapeHtml(accessToken)}">${roleCards}<button class="button dark" ${roles.length ? "" : "disabled"}>Continue with ${escapeHtml(selectedRole?.title || "selected role")} →</button></form></article>`;
  const detailStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles&role=${encodeURIComponent(selectedRole?.title || "")}${access}" aria-label="Back">←</a><p class="eyebrow">Step 2 of 2</p><h1>A few details,<br>and you're in.</h1>${notice}<div class="selected-role"><span>Selected role</span><strong>${escapeHtml(selectedRole?.title || "Volunteer")}</strong><small>${escapeHtml(selectedRole?.shift || "")}</small></div><form method="post" action="/volunteer?event=${encodeURIComponent(event.id)}"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><input type="hidden" name="role" value="${escapeHtml(selectedRole?.title || "")}"><input type="hidden" name="access" value="${escapeHtml(accessToken)}"><div class="grid"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Mobile phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label>${event.settings.questions?.shirtSize ? `<label>T-shirt size<select name="shirt" required><option value="">Choose size</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></label>` : ""}${event.settings.questions?.volunteerNotes ? `<label>Special notes <small>(optional)</small><textarea name="notes" placeholder="Anything organizers should know?"></textarea></label>` : ""}<label class="check"><input name="agreement" type="checkbox" required><span>I agree to follow Campbell's Crew Cares event and child-safety instructions. I understand that Campbell's Crew keeps volunteer participation records for future event coordination.</span></label><button class="button dark">Complete signup →</button></form></article>`;
  const detailPanel = `<article class="details-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}" aria-label="Close">×</a><p class="eyebrow">Event details</p><h1>${escapeHtml(event.title)}</h1><div class="details-grid"><div><span>Date</span><strong>${escapeHtml(date)}</strong></div><div><span>Time</span><strong>${escapeHtml(event.settings.time || "To be announced")}</strong></div><div><span>Location</span><strong>${escapeHtml(location)}</strong></div><div><span>Address</span><strong>${escapeHtml(address || "To be announced")}</strong></div></div><a class="button green" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles">Continue to signup →</a></article>`;
  let content = details ? detailPanel : step === "roles" ? roleStep : step === "details" ? detailStep : home;
  content = `<style>.step-card select{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);background:#fff;font:16px Arial,sans-serif}.step-card .role-card input[type="radio"]{width:20px;min-width:20px;height:20px;min-height:20px;margin:0;padding:0;border:0;flex:0 0 20px;font:inherit}.step-card .role-card.is-full{background:#f5f6f5;color:#6d7771;cursor:not-allowed}.step-card .role-card.is-full small{color:#7d8681}</style>${accessToken ? `<script>history.replaceState({}, "", location.pathname + "?" + new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => key !== "access")).toString())</script>` : ""}${content}`;
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
  if (!input.name || !input.email || !input.phone || !input.role) return { error: "Please complete your name, email, phone number, and volunteer role." };
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
  const { results: existingHouseholds } = await env.DB.prepare("SELECT email, phone, address_json FROM recipient_households WHERE event_id = ?").bind(event.id).all();
  const flags = [];
  if (existingHouseholds.some((household) => household.email === email)) flags.push("Email used on another application");
  if (existingHouseholds.some((household) => normalizedMatchValue(household.phone) === normalizedMatchValue(phone))) flags.push("Phone used on another application");
  const addressKey = normalizedMatchValue(`${address.address || ""}${address.zip || ""}`);
  if (addressKey && existingHouseholds.some((household) => { try { const saved = JSON.parse(household.address_json || "{}"); return normalizedMatchValue(`${saved.address || ""}${saved.zip || ""}`) === addressKey; } catch { return false; } })) flags.push("Household address matches another application");
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

  const eventMatch = url.pathname.match(/^\/portal-api\/events\/([^/]+)$/);
  if (eventMatch && request.method === "PUT") {
    if (!user || !EDITOR_ROLES.has(user.role)) return json({ error: "Editing permission required." }, 403);
    const input = await request.json();
    const existing = await env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventMatch[1]).first();
    if (!existing) return json({ error: "Event not found." }, 404);
    const status = ["draft", "open", "closed"].includes(input.status) ? input.status : "draft";
    await env.DB.prepare("UPDATE events SET title = ?, event_date = ?, status = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(String(input.title || "Untitled event").slice(0, 160), input.eventDate || null, status, JSON.stringify(input.settings || {}), eventMatch[1]).run();
    await audit(env, user, "event_updated", "event", eventMatch[1], eventMatch[1]);
    return json({ id: eventMatch[1] });
  }

  if (url.pathname === "/portal-api/organizer/volunteers" && request.method === "GET") {
    if (!user) return json({ error: "Sign in required." }, 401);
    const { results } = await env.DB.prepare("SELECT s.id, s.event_id, s.role, s.status, s.notes, s.created_at, v.name, v.email, v.phone, e.title AS event_title FROM volunteer_signups s JOIN volunteer_profiles v ON v.id = s.volunteer_id JOIN events e ON e.id = s.event_id ORDER BY s.created_at DESC").all();
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
      if (otherHouseholds.some((other) => other.event_id === household.event_id && other.email === household.email) && !flags.includes("Email used on another application")) flags.push("Email used on another application");
      if (otherHouseholds.some((other) => other.event_id === household.event_id && normalizedMatchValue(other.phone) === normalizedMatchValue(household.phone)) && !flags.includes("Phone used on another application")) flags.push("Phone used on another application");
      const addressKey = normalizedMatchValue(`${address.address || ""}${address.zip || ""}`);
      if (addressKey && otherHouseholds.some((other) => { try { const saved = JSON.parse(other.address_json || "{}"); return other.event_id === household.event_id && normalizedMatchValue(`${saved.address || ""}${saved.zip || ""}`) === addressKey; } catch { return false; } }) && !flags.includes("Household address matches another application")) flags.push("Household address matches another application");
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
    const { results } = await env.DB.prepare("SELECT e.id, e.title, e.event_type, e.event_date, e.status, COUNT(DISTINCT s.id) AS volunteer_count, COUNT(DISTINCT h.id) AS household_count, COUNT(DISTINCT c.id) AS child_count FROM events e LEFT JOIN volunteer_signups s ON s.event_id = e.id LEFT JOIN recipient_households h ON h.event_id = e.id LEFT JOIN recipient_children c ON c.household_id = h.id GROUP BY e.id ORDER BY e.event_date DESC").all();
    return json({ reports: results });
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
      return serveOrganizerPrototype(request, env, url);
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
        const codeGranted = event.settings.volunteerStatus !== "code" || await hasVolunteerAccessToken(String(input.access || ""), event.id, env.PORTAL_SESSION_SECRET);
        if (!codeGranted) return volunteerCodePage(event, "Enter the invitation code before completing this signup.");
        input.name = `${String(input.firstName || "").trim()} ${String(input.lastName || "").trim()}`.trim();
        if (input.agreement !== "on") return liveVolunteerSignupPage(events, url.searchParams, "", "Please agree to the event and child-safety instructions before continuing.");
        const result = await registerVolunteer(env, input, codeGranted);
        if (result.error) return liveVolunteerSignupPage(events, url.searchParams, "", result.error);
        try {
          await sendVolunteerConfirmation(env, input.email, input.name, input.role, result.event);
          await audit(env, null, "volunteer_confirmation_sent", "volunteer_signup", result.id, result.event.id);
          return liveVolunteerSignupPage(events, url.searchParams, "You are registered. A confirmation email is on its way.");
        } catch (error) {
          console.error("Volunteer confirmation delivery failed", error);
          await audit(env, null, "volunteer_confirmation_failed", "volunteer_signup", result.id, result.event.id);
          return liveVolunteerSignupPage(events, url.searchParams, "You are registered, but we could not send the confirmation email.");
        }
      }
      const selected = events.find((item) => item.id === url.searchParams.get("event")) || events[0];
      if (selected?.settings.volunteerStatus === "code" && !(await hasVolunteerAccessToken(url.searchParams.get("access"), selected.id, env.PORTAL_SESSION_SECRET))) return volunteerCodePage(selected);
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

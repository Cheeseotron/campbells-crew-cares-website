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

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
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
  const alert = `${message ? `<p role="alert" class="error">${escapeHtml(message)}</p>` : ""}<p><a style="color:#176b39;font-weight:700" href="/forgot-password">Forgot password?</a></p>`;
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
      .replace('src="app.js"', 'src="/portal-assets/app.js"')
      .replaceAll("../assets/", "/assets/");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, { status: asset.status, headers });
  }
  return new Response(asset.body, { status: asset.status, headers });
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

async function sendEmail(env, recipient, subject, body) {
  const credential = await env.DB.prepare("SELECT encrypted_refresh_token FROM email_oauth_credentials WHERE id = 1").first();
  if (!credential || !env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("Email delivery has not been connected yet.");
  const destination = emailLine(recipient).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(destination)) throw new Error("A valid email address is required for delivery.");
  const refreshToken = await decryptEmailToken(credential.encrypted_refresh_token, env);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("Google email authorization needs to be reconnected.");
  const message = `From: Campbell's Crew Cares <${EMAIL_SENDER}>\r\nTo: ${destination}\r\nSubject: ${emailLine(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${String(body || "").replace(/\r?\n/g, "\r\n")}`;
  const sent = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(EMAIL_SENDER)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(message)) }) });
  if (!sent.ok) throw new Error("Google could not send the email.");
}

function eventEmailDetails(event) {
  const settings = eventSettings(event) || {};
  return { date: emailLine(event.event_date || settings.date || "To be announced"), time: emailLine(settings.time || "To be announced"), location: emailLine(settings.location || "To be announced"), address: emailLine(settings.address || "") };
}

async function sendPasswordResetEmail(env, recipient, resetUrl) {
  await sendEmail(env, recipient, "Reset your Campbell's Crew organizer password", `A password reset was requested for your Campbell's Crew organizer account.\n\nSet a new password using this secure link:\n${resetUrl}\n\nThis link expires in seven days. If you did not request this, you can ignore this email.`);
}

async function sendVolunteerConfirmation(env, recipient, name, role, event) {
  const details = eventEmailDetails(event);
  await sendEmail(env, recipient, `You're registered: ${emailLine(event.title)}`, `Hi ${emailLine(name)},\n\nThank you for volunteering with Campbell's Crew Cares. You are registered for:\n\n${emailLine(event.title)}\nRole: ${emailLine(role)}\nDate: ${details.date}\nTime: ${details.time}\nLocation: ${details.location}${details.address ? `\nAddress: ${details.address}` : ""}\n\nWe look forward to seeing you there.`);
}

async function sendRecipientConfirmation(env, recipient, guardianName, event) {
  const details = eventEmailDetails(event);
  await sendEmail(env, recipient, `Application received: ${emailLine(event.title)}`, `Hi ${emailLine(guardianName)},\n\nYour Campbell's Crew Cares application for ${emailLine(event.title)} has been received and is now awaiting review.\n\nEvent date: ${details.date}\n\nSubmitting an application does not guarantee approval. We will contact you if we need more information or when there is an update.`);
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
  return results.map((event) => ({ ...event, settings: eventSettings(event) })).filter((event) => ["open", "code"].includes(event.settings.volunteerStatus));
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

function liveVolunteerSignupPage(events, query, message = "", error = "") {
  if (!events.length) return portalStatusPage("Volunteer opportunities", "There are no public volunteer opportunities open right now. Please check back when the next event is announced.");
  const event = events.find((item) => item.id === query.get("event")) || events[0];
  const roles = (Array.isArray(event.settings.roles) ? event.settings.roles : []).filter((role) => role.enabled && role.title);
  const totalSpots = roles.reduce((total, role) => total + Math.max(0, Number(role.capacity) || 0), 0);
  const selectedRole = roles.find((role) => role.title === query.get("role")) || roles[0];
  const step = query.get("step") || "home";
  const accessToken = query.get("access") || "";
  const access = accessToken ? `&access=${encodeURIComponent(accessToken)}` : "";
  const notice = error ? `<p class="notice error" role="alert">${escapeHtml(error)}</p>` : message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const details = query.get("details") === "1";
  const date = event.event_date || event.settings.date || "Date to be announced";
  const location = event.settings.location || "Location to be announced";
  const address = event.settings.address || "";
  const roleCards = roles.map((role) => `<label class="role-card ${selectedRole?.title === role.title ? "selected" : ""}"><input type="radio" name="role" value="${escapeHtml(role.title)}" ${selectedRole?.title === role.title ? "checked" : ""}><span><strong>${escapeHtml(role.title)}</strong><b>${escapeHtml(role.shift || "Shift to be announced")} · ${escapeHtml(role.capacity || 0)} spots</b><small>${escapeHtml(role.description || "Help make this event possible.")}</small></span></label>`).join("");
  const home = `<a class="back" href="/">← Back to Campbell's Crew Cares</a>${notice}<article class="event-card"><div class="open-bar"><span>Registration open</span><span>${totalSpots} spots open</span></div><div class="event-body"><div class="date-block"><small>${escapeHtml(date.split(" ")[0] || "Event")}</small><strong>${escapeHtml((date.match(/\b\d{1,2}\b/) || ["--"])[0])}</strong></div><div class="event-copy"><p class="eyebrow">Featured event</p><h1>${escapeHtml(event.title)}</h1><p><b>${escapeHtml(date)} · ${escapeHtml(event.settings.time || "Time to be announced")}</b><br>${escapeHtml(location)}</p><div class="actions"><a class="button dark" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles${access}">Choose a role →</a><a class="button light" href="/volunteer?event=${encodeURIComponent(event.id)}&details=1${access}">Event details</a></div></div></div></article>`;
  const roleStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}${access}" aria-label="Back">×</a><p class="eyebrow">Step 1 of 2</p><h1>How would you<br>like to help?</h1><form method="get" action="/volunteer"><input type="hidden" name="event" value="${escapeHtml(event.id)}"><input type="hidden" name="step" value="details"><input type="hidden" name="access" value="${escapeHtml(accessToken)}">${roleCards}<button class="button dark" ${roles.length ? "" : "disabled"}>Continue with ${escapeHtml(selectedRole?.title || "selected role")} →</button></form></article>`;
  const detailStep = `<article class="step-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles&role=${encodeURIComponent(selectedRole?.title || "")}${access}" aria-label="Back">←</a><p class="eyebrow">Step 2 of 2</p><h1>A few details,<br>and you're in.</h1>${notice}<div class="selected-role"><span>Selected role</span><strong>${escapeHtml(selectedRole?.title || "Volunteer")}</strong><small>${escapeHtml(selectedRole?.shift || "")}</small></div><form method="post" action="/volunteer"><input type="hidden" name="eventId" value="${escapeHtml(event.id)}"><input type="hidden" name="role" value="${escapeHtml(selectedRole?.title || "")}"><input type="hidden" name="access" value="${escapeHtml(accessToken)}"><div class="grid"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Mobile phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required></label>${event.settings.questions?.shirtSize ? `<label>T-shirt size<select name="shirt" required><option value="">Choose size</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option><option>Adult 3XL</option></select></label>` : ""}${event.settings.questions?.volunteerNotes ? `<label>Special notes <small>(optional)</small><textarea name="notes" placeholder="Anything organizers should know?"></textarea></label>` : ""}<label class="check"><input name="agreement" type="checkbox" required><span>I agree to follow Campbell's Crew Cares event and child-safety instructions. I understand that Campbell's Crew keeps volunteer participation records for future event coordination.</span></label><button class="button dark">Complete signup →</button></form></article>`;
  const detailPanel = `<article class="details-card"><a class="round" href="/volunteer?event=${encodeURIComponent(event.id)}" aria-label="Close">×</a><p class="eyebrow">Event details</p><h1>${escapeHtml(event.title)}</h1><div class="details-grid"><div><span>Date</span><strong>${escapeHtml(date)}</strong></div><div><span>Time</span><strong>${escapeHtml(event.settings.time || "To be announced")}</strong></div><div><span>Location</span><strong>${escapeHtml(location)}</strong></div><div><span>Address</span><strong>${escapeHtml(address || "To be announced")}</strong></div></div><a class="button green" href="/volunteer?event=${encodeURIComponent(event.id)}&step=roles">Continue to signup →</a></article>`;
  let content = details ? detailPanel : step === "roles" ? roleStep : step === "details" ? detailStep : home;
  content = `<style>.step-card select{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);background:#fff;font:16px Arial,sans-serif}</style>${accessToken ? `<script>history.replaceState({}, "", location.pathname + "?" + new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => key !== "access")).toString())</script>` : ""}${content}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Volunteer signup | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#eef3ef;--line:#d2d9d4;--gray:#617068}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#fff;font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100% - 40px,760px);margin:52px auto 70px}.back,.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.back{display:inline-block;margin:0 0 30px;color:var(--forest);text-decoration:none}.event-card,.step-card,.details-card{overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:28px;box-shadow:0 20px 50px rgba(17,24,33,.11)}.open-bar{display:flex;justify-content:space-between;padding:17px 26px;background:var(--green);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.event-body{display:grid;grid-template-columns:100px minmax(0,1fr);gap:28px;padding:38px 42px 30px}.date-block{align-self:center;text-align:center}.date-block small{font-weight:800;letter-spacing:.12em}.date-block strong{display:block;font-family:"Arial Black",Arial,sans-serif;font-size:64px;line-height:1}.eyebrow{margin:0 0 12px;color:var(--forest)}h1{margin:0 0 12px;font-family:"Arial Black",Arial,sans-serif;font-size:clamp(34px,5vw,52px);letter-spacing:-.055em;line-height:.9;text-transform:uppercase}.event-copy p{line-height:1.55;color:var(--gray)}.event-copy p b{color:var(--ink)}.actions{display:flex;gap:10px;margin-top:24px}.button{display:inline-flex;min-height:50px;padding:0 21px;align-items:center;justify-content:center;border:1px solid var(--ink);font-size:10px;font-weight:800;letter-spacing:.1em;text-decoration:none;text-transform:uppercase;cursor:pointer}.dark{color:#fff;background:var(--ink)}.light{color:var(--ink);background:#fff}.green{color:var(--ink);background:var(--green);border-color:var(--green)}.step-card,.details-card{position:relative;padding:42px}.step-card h1{font-size:28px;line-height:1.02}.round{position:absolute;top:35px;right:42px;display:grid;width:40px;height:40px;place-items:center;border:1px solid var(--line);border-radius:50%;color:var(--ink);text-decoration:none}.role-card{display:flex;align-items:center;gap:18px;margin:10px 0;padding:16px;border:1px solid var(--line);cursor:pointer}.role-card.selected{background:#edf8ed;border:2px solid var(--forest)}.role-card input{flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:var(--forest)}.role-card>span{flex:1;min-width:0;text-align:left}.role-card strong,.role-card b,.role-card small{display:block}.role-card strong{font-size:16px}.role-card b{margin:2px 0 5px}.role-card small{color:var(--gray);line-height:1.4}.step-card form>.button{margin-top:18px}.selected-role{margin:22px 0;padding:16px 20px;border-left:5px solid var(--green);background:var(--mist)}.selected-role span,.selected-role strong,.selected-role small{display:block}.selected-role span,.details-grid span{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.step-card label:not(.role-card):not(.check){display:block;margin:18px 0 7px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.step-card input:not([type=checkbox]),textarea{width:100%;min-height:50px;margin-top:7px;padding:12px;border:1px solid var(--line);font:16px Arial,sans-serif}.step-card textarea{min-height:100px;resize:vertical}.check{display:flex;gap:10px;margin-top:14px;color:var(--gray);font-size:13px;line-height:1.45}.check input{width:19px;height:19px;accent-color:var(--forest)}.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}.details-grid div{padding:17px;background:var(--mist)}.details-grid span,.details-grid strong{display:block}.details-grid strong{margin-top:6px;line-height:1.35}.notice{padding:13px;font-weight:700}.error{background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d}.success{background:#e9f7ea;border-left:4px solid var(--forest);color:#155b31}@media(max-width:620px){main{width:min(100% - 26px,760px);margin-top:28px}.event-body{grid-template-columns:1fr;padding:30px}.date-block{text-align:left}.date-block strong{font-size:48px}.step-card,.details-card{padding:28px 22px}.round{top:22px;right:22px}.grid,.details-grid{grid-template-columns:1fr}.actions{flex-direction:column}}</style><script src="/portal-assets/volunteer-signup.js" defer></script></head><body><main>${content}</main></body></html>`;
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

async function registerVolunteer(env, input, codeGranted = false) {
  const event = await env.DB.prepare("SELECT id, title, settings_json FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
  const settings = event ? eventSettings(event) : null;
  const roles = Array.isArray(settings?.roles) ? settings.roles.filter((role) => role.enabled).map((role) => role.title) : [];
  const status = settings?.volunteerStatus;
  const codeMatches = status === "code" && String(input.accessCode || "").trim() === String(settings.volunteerCode || "").trim();
  if (!event || !["open", "code"].includes(status) || (status === "code" && !codeGranted && !codeMatches) || !roles.includes(String(input.role || ""))) return { error: "That volunteer opportunity is not available." };
  if (!input.name || !input.email || !input.phone || !input.role) return { error: "Please complete your name, email, phone number, and volunteer role." };
  const email = String(input.email).trim().toLowerCase();
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
  const householdId = randomId("household");
  await env.DB.prepare("INSERT INTO recipient_households (id, event_id, guardian_name, email, phone, address_json, application_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(householdId, event.id, String(input.guardianName).slice(0, 120), String(input.email).trim().toLowerCase(), String(input.phone).slice(0, 30), JSON.stringify(input.address || {}), JSON.stringify({ notes: String(input.notes || "").slice(0, 2000), ...(input.application && typeof input.application === "object" ? input.application : {}) })).run();
  for (const child of input.children.slice(0, 12)) {
    if (!child.firstName || !child.lastName) continue;
    const childId = randomId("child");
    const photo = photoFromDataUrl(child.photoDataUrl);
    let photoKey = null;
    if (photo) {
      photoKey = `children/${householdId}/${childId}.jpg`;
      await env.PRIVATE_UPLOADS.put(photoKey, photo.bytes, { httpMetadata: { contentType: photo.contentType }, customMetadata: { householdId, childId } });
    }
    await env.DB.prepare("INSERT INTO recipient_children (id, household_id, first_name, last_name, birth_date, details_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(childId, householdId, String(child.firstName).slice(0, 80), String(child.lastName).slice(0, 80), child.birthDate || null, JSON.stringify(child.details || {})).run();
    if (photoKey) await env.DB.prepare("UPDATE recipient_children SET photo_key = ? WHERE id = ?").bind(photoKey, childId).run();
  }
  await audit(env, null, "recipient_application_submitted", "recipient_household", householdId, event.id);
  return { id: householdId, event };
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
    const { results } = await env.DB.prepare("SELECT h.id, h.event_id, h.guardian_name, h.email, h.phone, h.status, h.created_at, e.title AS event_title, COUNT(c.id) AS child_count FROM recipient_households h JOIN events e ON e.id = h.event_id LEFT JOIN recipient_children c ON c.household_id = h.id GROUP BY h.id ORDER BY h.created_at DESC").all();
    return json({ recipients: results });
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

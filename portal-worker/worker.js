const COOKIE_NAME = "ccc_portal_session";
const SESSION_SECONDS = 60 * 60 * 8;
const PORTAL_PATHS = new Set(["/volunteer", "/apply", "/login", "/organizer"]);
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

async function makeSession(user, secret) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ id: user.id, role: user.role, expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
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
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 310000 }, material, 256);
  return base64Url(new Uint8Array(bits));
}

function loginPage(message = "", status = 200) {
  const alert = message ? `<p role="alert" class="error">${escapeHtml(message)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Organizer sign in | Campbell's Crew Cares</title><style>:root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--ink);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,580px);padding:clamp(30px,6vw,58px);background:#fff;border-top:7px solid var(--green);box-shadow:0 24px 70px rgba(0,0,0,.32)}.eyebrow,label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.eyebrow{color:var(--forest)}h1{margin:12px 0 14px;font-family:Impact,"Arial Black",sans-serif;font-size:clamp(42px,9vw,68px);letter-spacing:-.04em;text-transform:uppercase}p{color:var(--gray);line-height:1.55}label{display:block;margin:20px 0 7px}input{width:100%;min-height:52px;padding:12px;border:1px solid #bdc6c0;background:var(--mist);font-size:17px}button{width:100%;min-height:52px;margin-top:22px;border:1px solid var(--green);background:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.error{padding:12px;background:#f8e9e6;border-left:4px solid #a22d22;color:#85251d;font-weight:700}</style></head><body><main><p class="eyebrow">Campbell's Crew Cares</p><h1>Organizer sign in</h1><p>Use the organizer account created for you. Public volunteer and recipient forms stay separate from this private workspace.</p>${alert}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus><label for="password">Password or PIN</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Sign in →</button></form></main></body></html>`;
  return new Response(html, { status, headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
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
  return new Response(asset.body, { status: asset.status, headers });
}

async function activeEvents(env) {
  // Keep event configuration, access codes, capacity notes, and contact details
  // on the server. The public form needs only this small display-safe subset.
  const { results } = await env.DB.prepare("SELECT id, title, event_type, event_date FROM events WHERE status = 'open' ORDER BY event_date ASC").all();
  return results;
}

async function audit(env, actor, action, targetType, targetId, eventId = null, metadata = {}) {
  await env.DB.prepare("INSERT INTO audit_log (id, actor_user_id, event_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(randomId("audit"), actor?.id || null, eventId, action, targetType, targetId, JSON.stringify(metadata)).run();
}

async function api(request, env, url, user) {
  if (url.pathname === "/portal-api/health") return json({ ready: true, mode: env.PORTAL_MODE || "closed", emailDelivery: "not_configured" });
  if (url.pathname === "/portal-api/public/events" && request.method === "GET") return json({ events: await activeEvents(env), mode: env.PORTAL_MODE || "closed" });

  if (url.pathname === "/portal-api/public/volunteer-signups" && request.method === "POST") {
    if ((env.PORTAL_MODE || "closed") !== "open") return json({ error: "Volunteer signups are not open right now." }, 403);
    const input = await request.json();
    const event = await env.DB.prepare("SELECT id, settings_json FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
    if (!event || !input.name || !input.email || !input.role) return json({ error: "Please select an open event and complete your name, email, and role." }, 400);
    const email = String(input.email).trim().toLowerCase();
    let profile = await env.DB.prepare("SELECT id FROM volunteer_profiles WHERE email = ?").bind(email).first();
    if (!profile) {
      profile = { id: randomId("volunteer") };
      await env.DB.prepare("INSERT INTO volunteer_profiles (id, name, email, phone, alert_opt_in) VALUES (?, ?, ?, ?, ?)")
        .bind(profile.id, String(input.name).slice(0, 120), email, String(input.phone || "").slice(0, 30), input.alertOptIn ? 1 : 0).run();
    }
    const signupId = randomId("signup");
    try {
      await env.DB.prepare("INSERT INTO volunteer_signups (id, event_id, volunteer_id, role) VALUES (?, ?, ?, ?)")
        .bind(signupId, event.id, profile.id, String(input.role).slice(0, 100)).run();
    } catch { return json({ error: "You are already signed up for this event." }, 409); }
    await audit(env, null, "volunteer_signed_up", "volunteer_signup", signupId, event.id);
    return json({ id: signupId, message: "You are registered. We will email event details before the event." }, 201);
  }

  if (url.pathname === "/portal-api/public/applications" && request.method === "POST") {
    if ((env.PORTAL_MODE || "closed") !== "open") return json({ error: "Recipient applications are not open right now." }, 403);
    const input = await request.json();
    const event = await env.DB.prepare("SELECT id, event_type FROM events WHERE id = ? AND status = 'open'").bind(input.eventId).first();
    if (!event || event.event_type !== "shopping") return json({ error: "That recipient application is not available." }, 400);
    if (!input.guardianName || !input.email || !input.phone || !Array.isArray(input.children) || !input.children.length) return json({ error: "Please complete the guardian information and add at least one child." }, 400);
    const householdId = randomId("household");
    await env.DB.prepare("INSERT INTO recipient_households (id, event_id, guardian_name, email, phone, address_json, application_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(householdId, event.id, String(input.guardianName).slice(0, 120), String(input.email).trim().toLowerCase(), String(input.phone).slice(0, 30), JSON.stringify(input.address || {}), JSON.stringify({ notes: String(input.notes || "").slice(0, 2000) })).run();
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
    return json({ id: householdId, message: "Your application has been received for review." }, 201);
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
    const isPortal = PORTAL_PATHS.has(url.pathname) || url.pathname.startsWith("/organizer/") || url.pathname.startsWith("/portal-assets/") || url.pathname.startsWith("/portal-api/");
    if (!isPortal) return new Response("Not found", { status: 404 });
    if (!env.DB || !env.ASSETS) return json({ error: "Portal deployment is not configured." }, 503);
    const user = await readSession(request, env);

    if (url.pathname.startsWith("/portal-api/")) return api(request, env, url, user);
    if (url.pathname === "/logout") return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: "/login", "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` })) });
    if (url.pathname === "/login" && request.method === "POST") {
      const clientKey = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.LOGIN_RATE_LIMITER && !(await env.LOGIN_RATE_LIMITER.limit({ key: clientKey })).success) return loginPage("Too many attempts. Please wait one minute and try again.", 429);
      const form = await request.formData(); const email = String(form.get("email") || "").trim(); const password = String(form.get("password") || "");
      const account = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!account || account.status !== "active" || !constantTimeEqual(await passwordHash(password, account.password_salt), account.password_hash)) return loginPage("That email and password do not match.", 401);
      const session = await makeSession(account, env.PORTAL_SESSION_SECRET);
      await audit(env, account, "login", "user", account.id);
      return new Response(null, { status: 303, headers: securityHeaders(new Headers({ Location: "/organizer", "Set-Cookie": `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}` })) });
    }
    if (url.pathname === "/login") return user ? Response.redirect(`${url.origin}/organizer`, 303) : loginPage();
    if (url.pathname === "/organizer" || url.pathname.startsWith("/organizer/")) {
      if (!user) return Response.redirect(`${url.origin}/login`, 303);
      return servePortalAsset(request, env, url);
    }
    return servePortalAsset(request, env, url);
  }
};

export { passwordHash, makeSession, readSession };

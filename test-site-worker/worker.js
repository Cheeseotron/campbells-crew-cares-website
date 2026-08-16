const COOKIE_NAME = "ccc_test_session";
const SESSION_SECONDS = 60 * 60 * 8;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createSession(secret) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(String(expires)));
  return `${expires}.${base64Url(new Uint8Array(signature))}`;
}

async function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [expiresText, signatureText, extra] = token.split(".");
  if (!expiresText || !signatureText || extra || !/^\d+$/.test(expiresText)) return false;
  if (Number(expiresText) <= Math.floor(Date.now() / 1000)) return false;
  try {
    return crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      decodeBase64Url(signatureText),
      new TextEncoder().encode(expiresText)
    );
  } catch (error) {
    return false;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

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

function loginPage(message = "", status = 200) {
  const alert = message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : "";
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Campbell's Crew Cares | Private Test Site</title><style>
    :root{--ink:#111821;--green:#35d32f;--forest:#176b39;--mist:#edf3ed;--gray:#66716c}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;background:var(--ink);font-family:Arial,sans-serif;color:var(--ink)}main{width:min(100%,570px);padding:clamp(30px,6vw,62px);background:#fff;border-top:7px solid var(--green);box-shadow:0 24px 70px rgba(0,0,0,.32)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:42px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.brand img{width:50px;height:50px;object-fit:contain}.eyebrow{margin:0 0 15px;color:var(--forest);font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{margin:0 0 18px;font-family:"Arial Black",Impact,sans-serif;font-size:clamp(46px,10vw,72px);line-height:.9;letter-spacing:-.055em;text-transform:uppercase}p{color:var(--gray);line-height:1.6}label{display:block;margin:30px 0 8px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.row{display:grid;grid-template-columns:1fr auto;gap:9px}input{min-width:0;min-height:58px;padding:0 18px;background:var(--mist);border:1px solid #bdc6c0;font-size:26px;font-weight:800;letter-spacing:.35em}input:focus{outline:3px solid rgba(53,211,47,.3);border-color:var(--forest)}button{min-height:58px;padding:0 22px;background:var(--green);border:1px solid var(--green);cursor:pointer;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.error{padding:12px 14px;color:#9b2f25;background:#f8e9e6;border-left:4px solid #9b2f25;font-weight:700;font-size:13px}.note{margin:12px 0 0;font-size:11px}@media(max-width:520px){body{padding:18px}.row{grid-template-columns:1fr}main{padding:30px 22px}.brand{margin-bottom:32px}}
  </style></head><body><main><div class="brand"><img src="/assets/images/ccc-logo.png" alt=""><span>Campbell's Crew Cares</span></div><p class="eyebrow">Private test site</p><h1>Welcome back.</h1><p>This preview is for Campbell's Crew organizers and invited testers.</p>${alert}<form action="/test-site/login" method="post"><label for="pin">Enter your 4-digit PIN</label><div class="row"><input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]{4}" required autofocus><button type="submit">Enter →</button></div><p class="note">The PIN was provided by Campbell's Crew.</p></form></main></body></html>`;
  return new Response(body, { status, headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" })) });
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function serveProtectedAsset(request, env, url) {
  const relativePath = url.pathname.replace(/^\/test-site\/?/, "");
  const assetUrl = new URL(request.url);
  assetUrl.pathname = relativePath ? `/${relativePath}` : "/";
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (assetResponse.status === 404 && request.headers.get("Sec-Fetch-Mode") === "navigate") {
    assetUrl.pathname = "/";
    return transformIndex(await env.ASSETS.fetch(new Request(assetUrl, request)));
  }
  if (assetUrl.pathname === "/") return transformIndex(assetResponse);
  const headers = securityHeaders(new Headers(assetResponse.headers));
  return new Response(assetResponse.body, { status: assetResponse.status, headers });
}

async function transformIndex(response) {
  const html = await response.text();
  const protectedHtml = html.replace("<html lang=\"en\">", "<html lang=\"en\" data-server-auth=\"true\">");
  const headers = securityHeaders(new Headers(response.headers));
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(protectedHtml, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/test-site")) return new Response("Not found", { status: 404 });

    if (!env.TEST_SITE_PIN || !env.SESSION_SECRET) {
      return new Response("The private test site is not configured.", { status: 503, headers: securityHeaders() });
    }

    if (url.pathname === "/test-site/logout") {
      return new Response(null, {
        status: 303,
        headers: securityHeaders(new Headers({
          Location: "/test-site/",
          "Set-Cookie": `${COOKIE_NAME}=; Path=/test-site; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        }))
      });
    }

    if (url.pathname === "/test-site/login" && request.method === "POST") {
      const clientKey = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.LOGIN_RATE_LIMITER) {
        const result = await env.LOGIN_RATE_LIMITER.limit({ key: clientKey });
        if (!result.success) return loginPage("Too many attempts. Please wait one minute and try again.", 429);
      }
      const form = await request.formData();
      if (!constantTimeEqual(form.get("pin") || "", env.TEST_SITE_PIN)) return loginPage("That PIN isn't correct. Please try again.", 401);
      const token = await createSession(env.SESSION_SECRET);
      return new Response(null, {
        status: 303,
        headers: securityHeaders(new Headers({
          Location: "/test-site/",
          "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/test-site; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`
        }))
      });
    }

    const authenticated = await verifySession(readCookie(request, COOKIE_NAME), env.SESSION_SECRET);
    if (!authenticated) return loginPage();
    if (url.pathname === "/test-site") return Response.redirect(`${url.origin}/test-site/`, 308);
    return serveProtectedAsset(request, env, url);
  }
};

export { createSession, verifySession };

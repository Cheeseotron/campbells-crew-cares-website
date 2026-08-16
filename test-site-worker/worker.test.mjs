import test from "node:test";
import assert from "node:assert/strict";
import worker, { createSession, verifySession } from "./worker.js";

const indexHtml = "<!doctype html><html lang=\"en\"><head><title>Test</title></head><body>Protected app</body></html>";

function environment(rateAllowed = true) {
  return {
    TEST_SITE_PIN: "2017",
    SESSION_SECRET: "test-secret-that-is-long-enough-for-hmac",
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: rateAllowed }) },
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/") return new Response(indexHtml, { headers: { "Content-Type": "text/html" } });
        if (path === "/app.js") return new Response("console.log('protected');", { headers: { "Content-Type": "text/javascript" } });
        return new Response("Not found", { status: 404 });
      }
    }
  };
}

test("session token signs, verifies, and rejects tampering", async () => {
  const token = await createSession("secret");
  assert.equal(await verifySession(token, "secret"), true);
  assert.equal(await verifySession(`${token}x`, "secret"), false);
  assert.equal(await verifySession(token, "different"), false);
});

test("unauthenticated visitors receive only the login page", async () => {
  const response = await worker.fetch(new Request("https://campbellscrew.com/test-site/app.js"), environment());
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Enter your 4-digit PIN/);
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
});

test("incorrect PIN is rejected", async () => {
  const form = new FormData();
  form.set("pin", "9999");
  const response = await worker.fetch(new Request("https://campbellscrew.com/test-site/login", { method: "POST", body: form, headers: { "CF-Connecting-IP": "127.0.0.1" } }), environment());
  assert.equal(response.status, 401);
  assert.match(await response.text(), /isn&#039;t correct/);
});

test("correct PIN creates an HttpOnly protected session", async () => {
  const form = new FormData();
  form.set("pin", "2017");
  const response = await worker.fetch(new Request("https://campbellscrew.com/test-site/login", { method: "POST", body: form, headers: { "CF-Connecting-IP": "127.0.0.1" } }), environment());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/test-site/");
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure; SameSite=Lax/);
});

test("authenticated visitor receives the protected app and assets", async () => {
  const token = await createSession("test-secret-that-is-long-enough-for-hmac");
  const indexResponse = await worker.fetch(new Request("https://campbellscrew.com/test-site/", { headers: { Cookie: `ccc_test_session=${token}` } }), environment());
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /data-server-auth="true"/);
  const assetResponse = await worker.fetch(new Request("https://campbellscrew.com/test-site/app.js", { headers: { Cookie: `ccc_test_session=${token}` } }), environment());
  assert.equal(assetResponse.status, 200);
  assert.match(await assetResponse.text(), /protected/);
});

test("rate-limited PIN attempts receive a 429 response", async () => {
  const form = new FormData();
  form.set("pin", "2017");
  const response = await worker.fetch(new Request("https://campbellscrew.com/test-site/login", { method: "POST", body: form }), environment(false));
  assert.equal(response.status, 429);
});

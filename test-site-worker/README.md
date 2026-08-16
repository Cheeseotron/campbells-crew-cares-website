# Campbell's Crew private test site

This Cloudflare Worker protects the static application in `../test-site` and serves it only at `/test-site` after a valid PIN login.

## Security model

- `TEST_SITE_PIN` and `SESSION_SECRET` are Cloudflare Worker secrets. They are not stored in this repository.
- Sessions are signed, expire after eight hours, and use an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Unauthenticated requests for application assets receive the login page.
- PIN attempts are rate limited to eight per minute per client IP.
- Responses are marked `no-store` and `noindex`.

## Developer commands

```sh
pnpm install
pnpm test
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy
```

Set or rotate secrets with:

```sh
pnpm exec wrangler secret put TEST_SITE_PIN
pnpm exec wrangler secret put SESSION_SECRET
```

The current application is a workflow prototype. It stores fictional demonstration data in the visitor's browser and must not be used to collect real recipient information until the production database, staff authentication, role permissions, and file storage are added.

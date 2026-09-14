# Campbell's Crew live portal

This Worker is deliberately separate from the existing public-site hosting.  It
will intercept only these routes when deployed:

- `/volunteer` — public volunteer opportunities and future-alert signup
- `/apply` — public recipient application
- `/login` — private organizer sign-in
- `/organizer` — authenticated organizer workspace
- `/portal-api/*` — browser-to-Worker API, never a public data export

## What is ready in this first production foundation

- D1 schema for events, volunteers, households, individual children, roles,
  audit history, and email jobs.
- Private R2 boundary for child photos and packet templates. Browser code never
  receives a public storage URL for those files.
- Password hashing with PBKDF2 (310,000 iterations), signed HttpOnly sessions,
  login throttling, and server-side role checks.
- Closed-by-default public status. Email is represented as a draft/queue only;
  the Worker does not send email until the Cloudflare Email Service is enabled.

## Before first deployment

1. Create the D1 database and replace `database_id` in `wrangler.jsonc`.
2. Create the private R2 bucket.
3. Create the Worker rate limiter and replace its namespace id.
4. Apply `migrations/0001_initial.sql` to D1.
5. Set `PORTAL_SESSION_SECRET` and a one-time `BOOTSTRAP_TOKEN` as Worker
   secrets. Do not commit either value.
6. Create the initial owner through the protected bootstrap endpoint using a
   strong password. A four-digit PIN is not sufficient protection for family
   contact information in the live portal.
7. Deploy with public forms still in `closed` mode, then exercise the complete
   workflow against the real domain before opening a real event.

## Backup plan

- Source code is protected by this Git branch until reviewed and merged.
- D1 data should be exported on a schedule before accepting real applications.
- The private R2 bucket should be copied to a separate backup bucket on a
  schedule, retaining enough history to recover an accidental change.
- Worker secrets are intentionally not in Git; keep their names and rotation
  procedure in the organization password manager.

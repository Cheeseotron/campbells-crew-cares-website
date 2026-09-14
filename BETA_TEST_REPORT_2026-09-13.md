# Protected Test Site Beta Pass — 2026-09-13

## Scope

Live test of the protected `/test-site` organizer portal using fictional data only. Covered organizer navigation, food bag versus shopping event behavior, public volunteer entry, check-in safeguards, role restrictions, badge controls, and email controls.

## Reproduced and fixed

1. Food Bag Events showed a children check-in tab even though those events have no recipients.
2. Food Bag dashboard showed recipient status and child/application metrics from the shopping workflow.
3. Food Bag badge page offered child-badge controls and downloads.
4. Food Bag email center showed recipient/application email templates and recipient audiences.
5. Public volunteer signup could render the organizer-selected event rather than the one open for volunteer signup when only one eligible event existed.
6. Shopping event close-out could count checked-in volunteers and children from another active event.

## Verification completed

- All organizer routes opened without browser console errors.
- Check-In Staff saw only Check-in; a direct dashboard route stayed locked.
- Check-in required a second confirmation and Cancel returned without recording attendance.
- Food Bag navigation hid recipient applications, recipient history, and packets.
- Live protected deployment confirmed Food Bag check-in, dashboard, badges, and communications are now event-appropriate.
- Public volunteer view correctly returned to the single eligible open shopping event.
- Automated checks passed: Worker session/PIN/rate-limit tests and XLSX generation test.

## Remaining prototype limits (not bugs)

- This is still fictional browser-stored data. It is not the production database, real account system, real email delivery, or real document/photo storage.
- Browser print actions still use the local browser’s print dialog; printer alignment needs a physical-sheet test before event day.

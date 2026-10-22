@AGENTS.md

# Project rules (IQ POS)

These apply to every change, by anyone, every time — a change is not done until all three are.

1. **Update the FAQ / Help Center.** Every user-facing change (new feature, changed screen,
   moved button, renamed label, new setting) gets its how-to added or updated in
   `src/app/help-center/faq.ts`, which feeds both the in-app Help Center and the public `/faq`
   page. If the screen looks different, re-capture its marked screenshot in `public/help/` so the
   numbered markers still match the steps. Check older answers that mention what changed too.
2. **Log it in the Developer Guide.** Add a dated entry to `docs/DEVELOPER_GUIDE.md` §14
   Changelog (newest on top) and update the numbered section that describes the thing changed.
   The guide is the project document the final handover documentation is built from, so it
   must always describe the system as it is now.
3. **Schema changes:** give the SQL to run on Turso in the changelog entry; changes to existing
   tables must be run before the code is pushed.

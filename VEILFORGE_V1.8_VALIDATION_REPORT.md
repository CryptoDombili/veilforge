# VeilForge v1.8.10 Validation Report

## Scope
- Soft pulse animation for the hero badge dot next to “VeilForge v1.8 · Privacy Mission Control”.
- Visual refinement for the Triage filter dropdowns: **All severities** and **All policies**.

## Files Updated
- `apps/web/styles.css`
- `scripts/build-web.mjs`
- `package.json`
- `package-lock.json`
- `dist/*` (rebuilt)

## Validation
- `npm run build:web` ✅
- `npm test` ✅ (22/22 passing)
- `npm run typecheck` ✅

## Notes
- The version badge dot now uses a subtle pulse designed to avoid eye strain.
- Dropdown controls now have a more polished control surface, stronger readability, improved hover/focus treatment, and a custom chevron while keeping the existing dark VeilForge visual language.

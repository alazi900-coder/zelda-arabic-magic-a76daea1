---
name: Version bump triple sync
description: Every release must bump three files together — APP_VERSION, index.html meta, and CHANGELOG entry
type: preference
---
On every user-visible change, bump ALL three in the same commit:

1. `src/lib/version.ts` → `APP_VERSION`
2. `index.html` → `<meta name="app-version" content="X.Y.Z" />` (used by the runtime version-drift check to force cache-busting reloads)
3. `src/lib/changelog.ts` → new entry at the top

**Why:** The stale-cache fix (v1.6.2+) fetches `/index.html` with `no-store` and compares its `app-version` meta against the loaded APP_VERSION. If they drift out of sync the check breaks (either infinite reloads or silent staleness).

**How to apply:** Treat the meta tag as canonical for what the server is serving; APP_VERSION is what the current bundle thinks it is. They must always match after a release.

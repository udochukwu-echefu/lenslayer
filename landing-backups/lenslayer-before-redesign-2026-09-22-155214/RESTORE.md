# Restore the previous LensLayer landing page

Original project: `/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/landing`
Snapshot: 2026-09-22T15:52:14.739634+01:00
Branch: `main`
Commit: `35880d9a3ed358cf7510b107b3cd322b685230c5`
Node: `v24.15.0`

This is a filesystem snapshot, including untracked files and local environment configuration. Git status is retained separately. No backend or dashboard files were changed. Dependencies, build outputs, caches and Git internals are excluded. Keep this backup private; environment configuration may contain secrets.

## Run this snapshot separately

```sh
cd '/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/landing-backups/lenslayer-before-redesign-2026-09-22-155214/landing'
npm ci
npm run dev -- --host 127.0.0.1 --port 5175
npm run check
npm run build
```

## Restore exactly

Stop the landing dev server first. **Back up the redesigned version before restoring.** These commands preserve it by moving the entire active directory aside. Choose a new archive name if the one below already exists. Do not overwrite an existing archive.

```sh
cd '/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer'
test ! -e landing-redesigned-before-restore && mv landing landing-redesigned-before-restore
# Continue only if the move above succeeded and landing no longer exists.
test ! -e landing && cp -a '/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/landing-backups/lenslayer-before-redesign-2026-09-22-155214/landing' landing
cd landing
npm ci
npm run check
npm run build
npm run dev -- --host 127.0.0.1 --port 5173
```

The repository's other uncommitted work remains untouched. `SHA256-MANIFEST.json` records every backed-up source/config/asset file. `visual-references/` contains desktop, mobile, and interactive-state screenshots.

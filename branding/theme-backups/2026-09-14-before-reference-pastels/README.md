# Before the reference pastel theme · 14 September 2026

Exact working-file backups taken before the redesign, including pre-existing uncommitted dashboard styles. The previous dashboard used green-gray neutrals (`#F4F4F1`, `#FDFDFB`, `#657958`); the landing page also contained blue and green accents. Both light and dark styles are preserved.

From the Lenslayer project root:

```sh
python3 branding/theme-backups/2026-09-14-before-reference-pastels/restore.py --check
python3 branding/theme-backups/2026-09-14-before-reference-pastels/restore.py
```

The restore script first validates every affected file. It removes only the exact appended theme blocks, preserving unrelated CSS changes outside those blocks. It restores the prior logos, product screenshot and DESIGN.md only if they still match the applied version. If any affected content has been edited since the redesign, it stops before writing anything so those changes can be reconciled manually. The extracted palette JSON remains available for future use.

Original CSS snapshots are `dashboard-globals.css` and `landing-index.css`. Do not blindly replace whole stylesheets after further feature work. Existing older theme backups are untouched.

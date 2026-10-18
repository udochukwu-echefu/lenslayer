# Landing page release

The public landing page at `lenslayer.online` and `www.lenslayer.online` uses the existing Cloudflare Pages project **lenslayer**. It is a manual-upload project, without a connected Git provider. Merging source does not publish the landing page. The dashboard is a separate Worker at `app.lenslayer.online`.

From a clean, reviewed checkout with the installed landing and dashboard dependencies:

```sh
npm --prefix landing run check
npm --prefix landing run test:cta
npm --prefix landing run build
cd landing
../dashboard/node_modules/.bin/wrangler pages deploy dist --project-name lenslayer --branch main --commit-hash "$(git rev-parse HEAD)"
```

Record the preceding production deployment ID before upload. Verify the new deployment and both public domains after upload: the current page copy, theme control, responsive image variants, locally served fonts, and the actual app-link destinations. Production app links always use `https://app.lenslayer.online`, including when an obsolete `VITE_APP_URL` remains in deployment settings. The CI regression check covers absent, retired-host and localhost overrides.

The old `/sample` tour redirects to the workspace. Anonymous visitors enter the existing read-only fictional workspace; signed-in users retain their own workspace. There is no separate introductory wizard.

The historical Netlify configuration is not this deployment target. Do not create a new hosting project, change DNS, enable the retired dashboard `workers.dev` address or upload the dashboard artifact to the landing project. A landing rollback uses its recorded previous Pages deployment; dashboard/backend rollback is separate.

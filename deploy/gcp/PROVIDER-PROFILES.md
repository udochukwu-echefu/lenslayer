# Reviewed production provider profiles

Deployment support only; no production provider acceptance is implied. The human
selected **DeepSeek, USD1 total, no refill**, and **Calendar as one private owner
pilot**. Companion backend USD/pilot controls are still pending integration and
acceptance in this source export. Enabled execution refuses missing source fields;
the release operator must also qualify actual enforcement, consent and provider behavior.

## Inputs and review

1. The release operator alone obtains the approved credentials, numeric Secret Manager versions
   and owner UUID. Do not commit credentials, actual IDs or review files. No new IAM
   grants or secret access commands are provided here.
2. After separately authorizing metadata reads, capture a **new** local snapshot:

   ```sh
   python3 -m scripts.production_provider_release --capture-snapshot /review/provider-snapshot.json
   ```

   Capture reads existing API/worker revision names, optional nonsecret flags and
   secret **references**, never Secret Manager payloads. Unsupported fields, literal
   provider credentials, unready revisions, traffic splits, volumes or sidecars
   abort. It uses service describe projections plus filtered service list output
   for nonsecret flags (`--filter` is not a describe flag); metadata-read permissions
   are required, but no IAM grants are added. Review the snapshot; do not edit it
   to hide existing configuration.
   Projections constrain gcloud process output, **not server-side API responses**.
   Repeated containers/env paths use `[]` explicitly. Neither metadata path requests
   Secret Manager payloads; the infrastructure preflight also selects only its
   exact nonsecret queue/recovery/worker/IAM fields.
3. For disabled services, omit the profile (`NONE` in Cloud Build). Defaults are
   false, zero calls, USD0 and no pilot IDs/provider bindings. Any existing
   non-default optional value or binding requires a reviewed profile even if its
   enabled flag is false. Such unsupported dormant configurations must be reviewed
   separately, not silently removed by deployment.
4. For explicitly approved enablement/preservation, supply this closed JSON shape:

   ```json
   {
     "schema_version": 1,
     "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
     "snapshot_sha256": "SHA256_OF_CANONICAL_REVIEWED_SNAPSHOT",
     "env": {},
     "secrets": {}
   }
   ```

   Compute the digest with `scripts.production_provider_profile.snapshot_digest`
   on the parsed snapshot, **not** the pretty-printed file bytes. Copy
   `DEFAULTS` into `env`; enable only the selected provider(s) using the exact
   suffix keys below (the renderer adds `LENSLAYER_PLATFORM_`). This is an explicit
   reviewed input, not an auto-discovery/auto-enable mechanism. Unknown keys fail.

| Provider | Required nonsecret `env` values | Required `secrets` references |
| --- | --- | --- |
| DeepSeek | `HOSTED_MODEL_ENABLED=true`, `HOSTED_MODEL_PROVIDER=deepseek`, `HOSTED_MODEL_LIFETIME_USD_LIMIT=1.00`, `HOSTED_MODEL_LIFETIME_CALL_LIMIT=3`, `HOSTED_MODEL_TIMEOUT_SECONDS=30`, `HOSTED_MODEL_MAX_OUTPUT_TOKENS=2048` | `HOSTED_MODEL_API_KEY=lenslayer-hosted-model-api-key:7` |
| Calendar | `GOOGLE_CALENDAR_ENABLED=true`, `GOOGLE_CALENDAR_PILOT_ENABLED=true`, `GOOGLE_CALENDAR_PILOT_USER_IDS=<one canonical owner UUID>`, `GOOGLE_CALENDAR_REDIRECT_URI=https://app.lenslayer.online/calendar/oauth-return` | `GOOGLE_CALENDAR_CLIENT_ID=lenslayer-google-calendar-client-id:8`, `GOOGLE_CALENDAR_CLIENT_SECRET=lenslayer-google-calendar-client-secret:8`, `CONNECTOR_ENCRYPTION_KEY=lenslayer-connector-encryption-key:8`, `CONNECTOR_STATE_SIGNING_KEY=lenslayer-connector-state-signing-key:8`, `CALENDAR_SESSION_BINDING_KEY=lenslayer-calendar-session-binding-key:8` |

All env values are **strings**. Versions 7/8 above are synthetic examples, not
production versions. Use distinct actual credential material for the connector,
state and session keys; the renderer can check references, not secret contents.
The pilot field is a comma-delimited string restricted here to **one** UUID; root
must verify it belongs to the authorized owner. This helper cannot prove membership.
Disabled providers require zero/default flags and no unused bindings. Models other
than DeepSeek, arbitrary model URLs, refill flags and `latest`/cross-project/staging
secret references are rejected. Lower positive model limits are allowed only when
the selected call count fits the budget at fixed **USD0.319488 per reservation**
(three reserve USD0.958464). These are lifetime limits, never a reset/refund.

## Render, then execute only after release approval

Pure rendering makes no cloud calls:

```sh
python3 scripts/prepare-production.py --source-commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --output /review/rendered --provider-snapshot /review/provider-snapshot.json \
  --provider-profile /review/provider-profile.json
```

A render without a snapshot is only a disabled **proposal**, not permission to
replace an existing service. Inspect `runtime-env.json`, `api-env.json`,
`review-env.json` and `plan.json`. Use the guarded helper (not batch execution of
`commands.md`) for deployments. It rechecks original target revisions and provider
metadata immediately before each service change; stale/mismatched profiles abort.
Existing non-default settings must match the approved target exactly. Deliberate
rotation, disabling or other changes to active provider settings need a separate
reviewed operation and fresh snapshot; this preservation path refuses them.

Cloud Build uses the **same renderer and argv** through
`scripts.production_provider_release`, not a second env/secret template. Supply
`_SOURCE_COMMIT` equal to Cloud Build's `$COMMIT_SHA`, `_AGENT_WORKER_ORIGIN`,
`_PROVIDER_SNAPSHOT_FILE` and optional `_PROVIDER_PROFILE_FILE` (default `NONE`).
Paths must refer to operator-reviewed nonsecret input files available in the build
workspace. Stage them under `output/provider-review/` (already Docker-excluded),
or outside the source tree; the guarded CLI rejects other in-tree review paths.
Rendered files go under `output/provider-release/`, also Docker-excluded. This
matters because the image uses `COPY . .`: do not bake reviewed IDs into an image
or include them in a public commit. The release operator must arrange reviewed input availability
in the build workspace; this pipeline does not fetch private review files.
Core pins come exclusively from
reviewed `production-release.json`; old per-secret/authority substitutions are no
longer supported. Builds without a matching commit identity fail closed; do not
bypass this for an unbound archive/manual build.

Before either migration step, the release operator must separately validate backup, staging and
migration path evidence, then supply
`_MIGRATION_APPROVAL=backup+staging+path-reviewed:<exact source commit>`. This is
an explicit approval assertion, not automated proof of recovery acceptance. The
existing worker/queue/recovery/private-IAM preflight remains required. API deployment
is **no-traffic**; there is no automatic queue/recovery activation, scheduler update,
traffic promotion or IAM grant. The release operator performs those separately only if authorized.

The API and agent worker receive the full selected profile. The document-only job,
bootstrap and migration receive **no optional provider credentials**; the document
job drains and exits. Service min0/max1, request-billed CPU, private worker and
120-second bounded drain remain pinned. One image digest is resolved after the
build and used for every runtime, never a mutable deployment tag.

Cloud Run [`--set-env-vars`, `--env-vars-file` and `--set-secrets`](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)
replace their respective state: omission is **not preservation**. The full validated
configuration is therefore rendered before replacement. See also the official
[format/filter/flatten reference](https://docs.cloud.google.com/sdk/gcloud/reference/topic/formats).
Metadata checks reduce stale-review risk but are not a transactional cloud lock:
the release operator must serialize deployments/config edits for the entire rollout. A failed
deployment may have external effects; inspect revisions rather than blindly retry.

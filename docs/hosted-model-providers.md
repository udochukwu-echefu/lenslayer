# Optional product model providers and evaluation

Updated 17 October 2026 from public combined source and supplied release facts,
not new live verification. **Production providers remain disabled**; activation
and acceptance remain operator-owned. See [current release status](deployment/current-release-status.md),
[production provider activation](deployment/production-provider-activation.md) and
[source/snapshot-reviewed profiles](../deploy/gcp/PROVIDER-PROFILES.md).

This is product API code, not developer coding subscription access. The closed
**adapter registry** contains these entries; registry presence is not permission
for paid admission:

| Selection | Fixed model | Fixed Responses endpoint | Reasoning |
| --- | --- | --- | --- |
| `deepseek` | `deepseek-flash` (currently DeepSeek-V4.1-Flash) | `https://api.deepseek.com/responses` | `high` |
| `openai` | `gpt-6.1-sol` | `https://api.openai.com/v1/responses` | `high` |

**Only DeepSeek is admitted by the paid product budget gate.** OpenAI's registry
entry is not an approved product path and does not justify OpenAI API/subscription
setup. There is no default provider, endpoint/model override, automatic retry,
provider fallback or tools. Missing selection fails closed. The release operator alone supplies
separate product credentials; never reuse development subscription/session access.

## Current bounded production pilot (not activation)

All settings below have prefix `LENSLAYER_PLATFORM_`:

| Suffix | Default / integrated bound | Approved pilot target |
| --- | --- | --- |
| `HOSTED_MODEL_ENABLED` | `false` | `true` only after release approval/configuration |
| `HOSTED_MODEL_PROVIDER` | unset; paid admission DeepSeek only | `deepseek` |
| `HOSTED_MODEL_LIFETIME_CALL_LIMIT` | `0`; range 0..3 | `3`, counting existing admissions |
| `HOSTED_MODEL_LIFETIME_USD_LIMIT` | Decimal `0`; finite range 0..1.00 | `1.00` **total, no automatic refill** |
| `HOSTED_MODEL_TIMEOUT_SECONDS` | `30`; range 1..30 | `30` in the reviewed deployment profile |
| `HOSTED_MODEL_MAX_OUTPUT_TOKENS` | `2048`; range 1..4096 | `2048` in the reviewed deployment profile |
| `HOSTED_AGENT_LEASE_SECONDS` | `180` | Strictly greater than `3 * timeout + 15` |

Both lifetime ceilings must be explicitly nonzero for admission. Each burns a
fixed **US$0.319488** reservation before HTTP; three reserve **US$0.958464**. The
US$1 authorization is global and lifetime, not per task/day/organization. A task
has at most **one HTTP model call**; charge/crash uncertainty fails closed without
retry. Reservations are never refunded on failure, cancellation, deletion or lower
actual usage. Unknown/inconsistent history blocks admission; do not reset the
counter, change the budget ID or reprice historical rows to regain capacity.

The integrated pilot uses the existing counter/ledger at current `c7a4e9d2b630`
head and requires **no new migration**. Ordinary process restarts and tenant deletion
do not release spending, but privileged database/backup rollback can erase history.
Recovery must preserve monotonic budget usage and never restore spent funds;
reconcile durable spending evidence before resuming. This is not an invoice or a
claim of immunity to privileged destruction of the counter and ledger.

Deploy only through the reviewed source/snapshot flow above: exact numeric secret
references, matching API/agent-worker profile and stale-state refusal, disabled
fresh defaults, no optional model/Calendar credentials for document-only jobs.
Calendar remains a separately approved **private owner pilot**, not general
provider availability. Settings and merged source do not establish consent or
production acceptance. Production execution uses private min0/requestCPU/max1
on-demand workers with drain <=120 seconds; continuous workers are local development
only, not the production model path.

## Historical release evidence (not the production US$1 allowance)

Supplied release facts record the [ten-case DeepSeek evaluation](architecture/deepseek-live-evaluation-2026-10-14.md)
at **US$3.1678476 reserved**, plus the separate completed single staging product
canary at **US$0.319488**, for **US$3.4873356 burned of the old aggregate US$5**.
See the dated [acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md).
These are historical bounded proofs, not new verification or production acceptance.
The new production **US$1 total** is separate, never a refund/reset of that old
allowance. Do not rerun the evaluation/canary or infer new paid-call authorization.

The only accepted result is exactly one completed assistant output containing one JSON object with a single `decision` field (`proceed`, `needs_input`, `decline`). Duplicate JSON keys, extra decision fields, refusal content, empty/malformed/truncated output, wrong models, incomplete/error envelopes and tool calls fail closed. Reasoning is discarded. Provider envelope metadata is not mistaken for decision-schema fields. HTTP redirects, credentials failures and timeouts are never retried; error bodies are not reported. Input JSON is limited to 32 KiB, response bytes to 64 KiB, retained excerpt to 1,000 characters, output to 4,096 tokens maximum, and HTTP timeout to 30 seconds per phase with a checked elapsed stream deadline. No cookies, proxy environment, subscription OAuth store or `.env` is used by these helpers.

The model cannot create a tool/action, change a supplied identity/date, grant permission, approve a write or verify completion. Even an injection-induced valid `proceed` merely advances to the existing fixed proposal and immutable human approval. Semantic immunity to all prompt injections is **not** claimed. Fake HTTP workflow tests demonstrate authority containment, not live model intelligence.

## Official DeepSeek contract checked 2026-10-14

- [Create response](https://api-docs.deepseek.com/api/create-response/): `reasoning: {"effort":"high"}`; `max_output_tokens` includes reasoning; `text.format: {"type":"json_schema","name":...,"schema":...}`.
- [Responses compatibility](https://api-docs.deepseek.com/guides/responses_api): instructions are a system message; developer input is treated as user input; `store` is unsupported/ignored. We omit `store` and unverified `strict` for DeepSeek. No chat-completions `response_format` is substituted for Responses `text.format`.
- [List models](https://api-docs.deepseek.com/api/list-models/): authenticated `GET https://api.deepseek.com/models`. The evaluator requires exactly one `deepseek-flash` with name `DeepSeek-V4.1-Flash`, supported high effort/text modalities and bounded context/output metadata. Missing or differently formatted metadata stops evaluation; no guessed aliases.
- [Pricing](https://api-docs.deepseek.com/quick_start/pricing/): currently `deepseek-flash` resolves to V4.1 Flash; conservative peak cache-miss input **US$0.30/M**, output **US$1.20/M**. Discounts are never required.
- [JSON output guide](https://api-docs.deepseek.com/guides/json_mode/): warns of empty output. Empty results are errors, not implicit proceed.

Discovery confirms declared availability/version, not actual response capability. Each Responses call must still succeed and validate. The production adapter accepts only the fixed response model ID; it does not add a discovery GET or cache a claim of version availability. The model alias can change over time: re-evaluate and review official pricing before any paid run or product release.

## Retention and disclosure

Both providers receive the exact supplied facts and up to 1,000 characters of retained source. These can be sensitive. Server keys must be separate product API credentials, never OpenCode/Codex/subscription OAuth. Neither `store:false` on OpenAI nor DeepSeek's stateless Responses interface establishes zero provider retention, zero caching or absence of safety logs. Account-specific retention, jurisdiction, data-processing terms and permission to send source must be reviewed separately. No provider compensation/deletion of created Calendar events is implemented or claimed.

## Capped synthetic evaluation (coordinator only)

**Historical procedure retained below:** the ten-case evaluation is complete.
The commands, rates and amounts document that dated evidence; they are not a
request to rerun it, a fresh US$5 grant or a way to exercise production admission.

The CLI reads only one explicitly named process environment variable; it never searches key stores or loads `.env`. It requires `--ack-product-api-credential` for paid work. Do not pass keys in command arguments or record a credential-bearing terminal. Ten authorized paid synthetic calls have been completed by the release operator; the implementation agents made no product API calls.

Offline command, no secret or HTTP:

```sh
.venv/bin/python scripts/evaluate-hosted-model.py --provider deepseek --usd-cap 5 --output evaluation-dry-run.jsonl --dry-run
```

After the coordinator supplies an approved product secret via server-side secret injection, reviews today's official rates and ensures remaining approval budget:

```sh
.venv/bin/python scripts/evaluate-hosted-model.py --provider deepseek --usd-cap 5 --output evaluation-live-new.jsonl --secret-env LENSLAYER_EVALUATION_API_KEY --ack-product-api-credential
```

Use a **new, private ledger**; an existing file is rejected, not resumed. Each POST's reservation is flushed and `fsync`ed before dispatch. Reserve the entire 1,048,576-token published maximum input context **plus** bounded output at peak rates, rather than estimating tokens from bytes. Discovery rejects a larger context. Reservations never refund, even for known low usage, failed HTTP, malformed responses, timeout, cancellation or unknown charged outcomes. Ten fixed cases reserve **US$3.1678476** at the current rates (nine 2,048-output calls and one 1-output truncation probe). Hard cap is at most US$5, request count at most 12, concurrency exactly one. If insufficient budget remains, the next POST is not sent. Usage is validated against reserved limits and reported at peak rates, including reasoning in output; cache discounts are ignored. No automatic retries/fallback.

The cap covers this invocation, not concurrent external jobs or separate ledgers. After crash/unknown outcomes, account for the full old reservations against the coordinator's **aggregate approved US$5** before any new invocation; never rerun with a fresh US$5 allowance. Prices are not contractual guarantees: stop if published rates/context/capabilities change. OpenAI live evaluation is intentionally refused until its current fixed-model rates/context have been independently established; its explicit adapter remains available.

Cases cover exact fixed plans, literal Unicode offsets, missing identities/dates, conflicting dates, adversarial source/tool authority, an unauthorized goal and a one-token truncation probe. The probe must be rejected as incomplete, not accepted as a decision. Fake tests additionally exercise refusal/error wire shapes and real local immutable workflow decisions. Live metrics report only case name, enum decision, pass/fail, safe error code, latency, numeric usage/cost and reservations—never raw prompts, responses, reasoning, excerpts, keys or provider error bodies.

An unavailable/failed/incomplete suite exits nonzero and records `evaluation_passed:false`. A successful synthetic suite still records **`production_ready:false`**: it is a narrow decision evaluation, not live Calendar acceptance, production consent/session verification or statistically adequate semantic safety proof. Adversarial cases allow any valid bounded decision; they test containment, not whether a particular injected string is recognized.

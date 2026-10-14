# Optional product model providers and evaluation

Explicit selection and source disclosure are wired to a durable lifetime gate that defaults to zero calls. The [ten-case live DeepSeek evaluation](architecture/deepseek-live-evaluation-2026-10-14.md) passed and reserved US$3.1678476 of the aggregate US$5 authorization. Do not rerun it or refund that reservation. A single staged product canary and real browser acceptance remain pending; see the [acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md).

This is product API code, not development subscription access. Explicit server-side selection permits only:

| Selection | Fixed model | Fixed Responses endpoint | Reasoning |
| --- | --- | --- | --- |
| `deepseek` | `deepseek-flash` (currently DeepSeek-V4.1-Flash) | `https://api.deepseek.com/responses` | `high` |
| `openai` | `gpt-6.1-sol` | `https://api.openai.com/v1/responses` | `high` |

There is no default, endpoint/model override, automatic retry, provider fallback or tools. Missing provider selection fails closed. Immutable selection, accurate disclosure and the zero-default lifetime gate are integrated. Production stays model-disabled. A staged canary must set `LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED=true`, provider `deepseek`, and lifetime call limit `1`, with the separate product key bound only to the staging runtime. Admission reserves US$0.319488 before HTTP and is never refunded, including failure or an unknown charged outcome. The spent ledger survives process restarts, tenant deletion and migration rollback. Values above one are rejected.

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

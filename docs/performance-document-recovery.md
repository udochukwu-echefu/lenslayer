# Exhausted document lease recovery

## Demonstrated defect

On integration baseline `18f851679`, a document worker that died on its final admitted attempt left a stale `running` job and `processing` contract forever. `claim_next_job` excluded attempts at the maximum, and an otherwise empty documents-only drain exited without changing them. This is a local code-level reliability defect, not a measured production dispatch or scanner delay.

## Change

Existing document maintenance now terminalizes at most 100 exhausted stale leases per activation. It does not retry the provider or reset the attempt budget. Each transition is fenced by status, attempt and lease identity. PostgreSQL locks the contract before updating the job, matching completion/retention order; SQLite reserves its writer before reading. Only the winner emits the existing safe failure/audit/notification/webhook effects. Retention expiry/unavailable sources suppress ordinary failure effects. A late worker cannot publish a recovered job as successful.

The recovery pass runs once during an existing document drain, never in the agents-only lane. Further chunks wait for another legitimate activation. No schedule, IAM, queue, CPU, instance minimum, keepalive or idle polling changes are introduced. A fully idle drain still exits. Missing/locked contracts are not spun on.

## Tests

`python -m unittest tests.test_document_lease_recovery -q` covers final crashes, bounded/zero/negative limits, live/retryable leases, source expiry/unavailability, concurrent recovery, exactly-once transition effects, late dispatch denial and an empty drain without provider initialization or sleep.

`python scripts/test-agent-generalization-postgres-local.py tests.test_document_lease_recovery.PostgresDocumentLeaseRecoveryTests` repeats the same five tests in a newly created credential-free local PostgreSQL cluster/UUID schema, not production. Existing source-retention tests remain part of combined verification.

## Rollout and limits

No schema migration or resource activation. Deploy only after owner code/release review. Rollback is the preceding reviewed worker source/image, without reverting unrelated security changes. Rolling back code does not undo already-terminal failure records or notifications; never reset attempts or replay a provider write to manufacture recovery.

This fixes an exhausted lease when an existing document worker is legitimately activated. It does not prove a failed upload-trigger request will receive a prompt future activation. Cloud dispatch latency, natural cold starts and recovery schedule targeting remain separately measurable operational questions.

# Production agent invocation permissions

Prepared on 14 October 2026 for project `lenslayer`, region `europe-west1`.
The production invocation identity and empty queue now exist. The queue is
paused. The worker service has not been deployed or granted invocation access.
No production schema migration or API traffic switch has occurred.

The three required grants are deliberately scoped to individual resources:

| Recipient | Role | Resource |
| --- | --- | --- |
| `lenslayer-runtime@lenslayer.iam.gserviceaccount.com` | `roles/cloudtasks.enqueuer` | `projects/lenslayer/locations/europe-west1/queues/lenslayer-agent-work` |
| `lenslayer-runtime@lenslayer.iam.gserviceaccount.com` | `roles/iam.serviceAccountUser` | `lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com` |
| `lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com` | `roles/run.invoker` | Cloud Run service `lenslayer-agent-worker`, project `lenslayer`, region `europe-west1` |

These grants let the existing API enqueue a wake, identify that wake as the
distinct invoker, and invoke the private worker. The worker reads the durable
ledger and dispatches only actions that pass source, delegation, approval and
lease checks. Task payloads contain no goal, source text or agent credential.
The permissions persist until explicitly removed. The invoker has no new
database, object-storage, secret-management or human-administration grants.

The worker release uses service/revision minimum instances zero, request-based
CPU, maximum instances one, concurrency one and a bounded drain. The queue has
one concurrent dispatch, one dispatch per second and eight bounded attempts.
It stays paused until private-worker and staging acceptance pass. Hourly
authenticated recovery restores missed wakes without an idle polling process.

The plan renderer is [`prepare-production.py`](../../scripts/prepare-production.py).
Its checked constraints reject staging targets, unpinned secrets, arbitrary
worker hosts and mutable image references. It renders commands and executes
nothing. Actual rollout also requires an immutable tested image, staging
acceptance, a recovery point, private invocation and OIDC checks.

Automatic approval review initially required explicit approval of the exact
production IAM scope. The user then approved all three grants in the table.
The queue-enqueue and invocation-identity-use grants have been applied. The
worker-invocation grant will be applied to the private service after it is
created. The queue remains paused pending acceptance.

# Bounded workspace read API

Additive to `/api/v1`. Existing array endpoints, public API and SDK contracts are unchanged and are **not silently truncated**. These new human-workspace routes require the same membership/role/retention boundaries as existing register reads. Responses are `private, no-store`; never CDN-cache them.

## Lists

`GET /organizations/{organization_id}/query/contracts`
`GET /organizations/{organization_id}/query/tasks`
`GET /organizations/{organization_id}/query/lifecycle`

Envelope: `{ "items": [...], "total": 123, "offset": 0, "limit": 25 }`.
Items use the existing ContractResponse / TaskResponse / LifecycleItemResponse schemas. Contracts load only their latest job, not all historical jobs. No review/source body is included.

Common parameters:

| Parameter | Rules |
| --- | --- |
| `limit` | 1–100; default 25 |
| `offset` | 0–1,000,000; default 0 |
| `q` | At most 200 characters / eight whitespace-separated terms; case-insensitive literal substring matching; terms ANDed across allowed fields |
| `status` | Comma-separated existing statuses; omit for all |
| `sort` | Allowlisted below, never raw SQL |
| `descending` | Boolean |

- Contracts: sort `updated_at` (default), `created_at`, `title`, `counterparty`, `contract_type`, `status`. Descending by default. Search title, filename, party, type and status.
- Tasks: sort `due_at` (default), `created_at`, `title`, `status`, `priority`. Ascending by default. Filter `assigned_to_user_id`, `contract_id`, `category`, `due_before`, `due_after`. Search title, related contract title/party, assignee and ISO date.
- Lifecycle: sort `due_at` (default), `created_at`, `title`, `status`, `kind`. Ascending by default. Filter `contract_id`, `due_before`, `due_after`. Search title, contract title/party and ISO date.
- Date bounds include the boundary and must include a timezone. Null task deadlines sort last in either direction.
- All ordering has a unique ID tie-breaker in the same direction. Filtering and sorting cover the complete authorized dataset before pagination.

Pages are **live offset views**, not cross-request immutable snapshots. Insertions, deletions or edits between requests can move records between pages. Out-of-range pages return empty items and the current count, not a fabricated last page. Clients must offer restart/back navigation and not interpret partial pages as total counts. Nonempty pages use a SQL window count so rows and total share one statement snapshot, including under PostgreSQL READ COMMITTED. Empty/out-of-range pages use a separate current count because no window row exists. Cancel superseded requests, partition query keys by account/workspace/filter/page, and invalidate lists and summaries after mutation. A future cross-request snapshot/cursor contract would be a separate opt-in change, not a claim made by this API.

## Workspace search

`GET /organizations/{organization_id}/query/search?q=Supplier&limit=10`

`q`: 2–200 characters, at most eight terms. `limit`: 1–20. Returns `{items,query}`; each item has `{id,kind,title,meta,href}` where kind is `contract` or `task`. Results interleave the two kinds; each underlying SQL query has an explicit limit. Metadata is navigation-level title/party/status/assignee/date, never retained text, prompts or document excerpts. Search remains available without first downloading arrays.

SQL evaluates scoped predicates against the authorized workspace; result transfer and ORM materialization are bounded. Substring matching may still scan rows inside that workspace. This is not a claim of constant database execution work: obtain disposable PostgreSQL query plans before choosing search/composite indexes.

## Overview

`GET /organizations/{organization_id}/query/overview?day_start=2026-10-18T00:00:00Z&week_end=2026-10-26T00:00:00Z`

Counts are SQL aggregates, independent of preview lengths. Contract counts include all contracts, ready, failed, processing and attention (ready/failed). Task counts include active, completed, overdue, upcoming and due-soon. Lifecycle notice/renewal count uses active future items. Previews are at most five recent contracts, five attention contracts, five tasks assigned to the caller, four upcoming tasks and four upcoming notice/renewal items. Response contains `as_of`.

`day_start` defaults to current UTC midnight. Clients can supply local midnight converted to ISO UTC to retain date-only overdue semantics. `week_end` defaults to eight days after start; range must be positive and at most 32 days. These are display filters, not security or authorization inputs. Every query is still membership-scoped.

## Verification and rollback

Run `python -m unittest tests.test_workspace_queries -v` and `python -m tests.test_workspace_queries --benchmark --output /approved/path/query-results.json` using the repository's Python environment. The fixture compares old/new routes on the same 1,000 synthetic records per collection, one warmup and five samples. It separates decoded JSON size from calculated gzip size (not observed HTTP transfer).

No schema migration or external resource is required. Roll back dashboard/API together to their prior reviewed source if needed; legacy JSON routes remain available throughout. Rollback must not revert unrelated owner or security changes.

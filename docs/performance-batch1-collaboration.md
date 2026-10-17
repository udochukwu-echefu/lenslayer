# Batch 1: collaboration N+1 evidence

Local verification: 18 October 2026, baseline `18f851679478d0b63fc54526031e558095fcb16f`, branch `perf/collaboration-loading`.

Scope: eager-load comment authors, decision reviewers, and approval requesters,
assignees and resolvers. Scalar `joinedload` options use left joins, retaining
approvals with null assignees/resolvers without multiplying list rows. Existing
authorization, organization/contract filters, serializers and ordering are
unchanged. Contract/task/lifecycle loading is untouched.

## Measured SELECT counts

Full local HTTP requests, including authentication, membership authorization,
contract lookup and response serialization. Each request has a fresh ORM session;
each row/relationship has a distinct participant, none the requesting owner.

| List | Records | Baseline | After |
| --- | ---: | ---: | ---: |
| Comments | 1 / 20 / 100 | 5 / 24 / 104 | 4 / 4 / 4 |
| Decisions | 1 / 20 / 100 | 5 / 24 / 104 | 4 / 4 / 4 |
| Approvals (three distinct users per row) | 1 / 20 / 100 | 7 / 64 / 304 | 4 / 4 / 4 |
| Approvals (all four null/non-null combinations) | 4 | 12 | 4 |

The new tests failed on the original implementation with the baseline counts
above. They assert exact complete JSON responses and order, four total SELECTs,
and only one standalone user SELECT (authentication). Additional cases cover
empty lists, unrelated contracts, a second tenant, deliberately mismatched
organization/contract fixture rows, non-member 403s and scoped/missing-contract
404s. Alternating oldest/newest insertion makes both sort directions meaningful.

## Validation

Use the existing local virtualenv Python. From the worktree root, run each:

```sh
python -m unittest discover -s tests -p test_collaboration_query_performance.py -v
python -m unittest discover -s tests -p test_query_performance.py -v
python -m unittest discover -s tests -p test_platform_api.py -v
python -m unittest discover -s tests -p test_security.py -v
```

Results: **6 + 5 + 26 + 4 = 41 tests passed**. The first suite includes nine
distinct-participant scale cases (three list types times three sizes).
The existing query suite confirms efficient contract/task/lifecycle/member/report
loading remains intact. A separate diff/test review checked scalar-join cardinality,
nullable relationships, serializer coverage and unchanged security predicates.
In-memory mutation checks independently replaced each of the five eager loads
with lazy loading: every omission was detected at all three sizes (15/15 cases).
No mutation was written to source. `git diff --check` passed.

Synthetic disposable SQLite only; no production database, PostgreSQL query-plan
or production latency claims. No paid/provider calls, secret copies, deployment,
merge or infrastructure/resource changes. An existing Starlette/httpx deprecation
warning is emitted by the API test suites.

# <area> QA session, YYYY-MM-DD

Scope and running log. Findings live in `findings.json` in this directory, not here.
Nothing in this file is evidence. Evidence is `sweep.json`, `shots/`, and a query result.

## Under test

| | |
|---|---|
| Surfaces | e.g. inventory list, asset detail, dashboard |
| PRs | repo#0000, repo#0000 (merged / open) |
| Tickets | PROJ-000 |
| Environment | production / staging / local |
| Account | `<account placeholder>`, confirmed in the UI before the first probe |
| States in scope | e.g. tier A, tier B, tier C, tier D |
| States out of scope | and why in one clause |

## Baseline numbers

The reference figures this session compares against. Record them before probing, with where each
came from, so a later disagreement is a measurement conflict and not a memory conflict.

| Number | Value | Source |
|---|---|---|
| e.g. inventory total | | API response / SQL, account set on the session |
| e.g. rows at default page size | | sweep.json |
| e.g. slowest call observed | | network panel |

## Fixed identifiers

Asset uids and deep links used by every job and every screenshot. Verify each one resolves in
this account before use: an id borrowed from another account renders an error page and voids every
shot taken with it.

| Label | Id | Verified in account |
|---|---|---|
| | `<uid placeholder>` | yes / no |

## Preconditions

- [ ] Account confirmed in the UI, not read off a token.
- [ ] Entitlement judged by behaviour: the override actually changes the UI.
- [ ] Feature flags recorded, and frozen for the run.
- [ ] Chrome on :9222 answers, tab pool at the agreed size.

## Log

Append only, newest at the bottom. One line per action or observation, with the time. Note dead
ends: a route that was checked and was fine is worth as much as one that was not.

```
HH:MM  what was done, what was seen, which artefact holds the proof
```

## Open questions

Things that need an environment, an owner, or a decision, not more keyboard.

## Wrap

- Rows by status: fix __, unproven __, verified __, known __
- Follow-ups filed:
- Reusable output: which job, probe or query is worth keeping for the next session

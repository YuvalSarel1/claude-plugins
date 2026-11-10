# Evidence rules

Verification discipline for a QA review. A claim that reaches an engineer is a measurement, not a memory.

## 1. Nothing is a finding until it is confirmed against the authoritative live source

Default every claim to **suspected**. Promote it only after a probe against the surface that actually
ships: the signed-in app, the production read replica, the merged diff. Reason: a plausible claim that
turns out false costs more trust than the bug was worth.

Scale verification to consequence:

| Claim | Minimum before it ships |
|---|---|
| Cosmetic wording, copy | One live read of the surface |
| A control is missing or a tab is mislabelled | One live probe, quoted from the sweep JSON |
| A plan or role sees data it should not | Two surfaces, two states, plus a data-side check |
| A defect that changes a release decision | Live probe, data check, and a named code path |

Say **suspected** in the row until the gate is passed. An unverified row carries a link, never a verdict.

## 2. Assert what you are looking at before you report on it

Every probe checks its own identity before it reads anything, and fails loudly when the check fails.
Reason: an id copied from the wrong account renders an error page, and every screenshot, deep link and
matrix row built on it is void while looking perfectly clean.

```js
if(!/<EXPECTED HEADING>/.test(document.body.innerText))
  return {ok:false, reason:'wrong page, expected /<EXPECTED HEADING>/ in the body'};
```

Assert on a breadcrumb, an `h1`, or the record name. Never on the URL alone: the URL is what was asked
for, not what rendered. A failed assertion is a MISS in the report, never a silent skip. Both drivers
take this as `expect`.

## 3. Settle before probing

Settled means: a ready marker is present **and** `document.body.innerText.length` is identical across
two consecutive reads. The drivers poll at 2.5 s and give up after 40 polls. Reason: slow list calls are
normal, and a verdict read at second 5 describes a loading skeleton.

Both drivers take a `ready` expression (shots) or `settleMarker` (sweep), and it is not optional in
practice. Name the deepest thing only the finished page has. Gating on a tab strip returns a page whose
table rows are still grey placeholders, which photographs exactly like an empty table; gating on
`document.querySelectorAll('table tbody tr').length > 3` does not. Make the marker match the finished
error page too, or a wrong id costs the full 100 s timeout. A probe that never settled is PARTIAL and
its row stays suspected.

A settled page can still be junk: a fully rendered error page has a ready marker and stable text. Give
every surface an `expect` so identity is checked as well as readiness.

**Hidden text is still text.** `innerText` and the accessibility tree both include elements at
`opacity: 0`. Component libraries often keep their empty state ("No results") in the DOM next to loaded
rows. Never call a screen empty from text or a snapshot alone: count rows, or check the computed style.
`demo/app.html` reproduces this.

## 4. Judge entitlement and role state by behaviour, never by a token

Ask the surface what it renders. Never decode the auth cookie and call that the answer. Reason: the
token goes stale against server-side state, so it will happily tell you a role you no longer have, or
hide one you do.

Run the sweep with one state per plan or role and read the verdict from `probe.tabs`, `probe.columns`
and `probe.buttons` per state. If the gate does not move when the state moves, the state was never
applied and no row from that run is usable.

## 5. Scope the query before believing an empty result, and stay read-only

An empty result set is a claim, and it needs the same gate as any other. Reason: row level security,
per-account schemas and wrong-region hosts all return zero rows with no error.

Before reporting "no rows", confirm all three:

1. The session is scoped to the account on screen (schema, session variable, or tenant header).
2. The same query returns rows for an account known to have data.
3. The table exists on that host at all.

All data access during a review is read-only: read replicas, read-only users, no DDL, no writes. No flag
toggles and no account switches while a parallel run is in flight, because flags and the active account
are usually server-side and shared by every tab.

## 6. Live measurement beats an agent opinion, including a critic agent

When a critic, a reviewer or a summary disagrees with the sweep JSON, the JSON wins, or a fresh probe is
run to settle it. Reason: a critic with no browser is guessing, and a confident guess reads exactly like
a fact in a review row.

```bash
jq '.cells["projects@free"].probe.buttons' <session>/sweep.json
jq -r '.cells | to_entries[] | select(.value.status != "ok")
       | "\(.value.status) \(.key) \(.value.reason // "")"' <session>/sweep.json
```

Cells are keyed `surface@state`. The second command lists every cell that is not a measurement, which
is the list of things no row may cite.

## 7. Retract fast and visibly

A finding that does not survive verification is corrected in place, in the same artefact, with the
reason. Do not delete it quietly, and do not leave it hedged. Reason: an engineer who finds one
unretracted false row re-checks every other row by hand.

Retraction is one line: what was claimed, what the live source says, what changed. Any screenshot,
deep link or matrix row that depended on the retracted claim is regenerated or removed in the same pass.

## Case notes

One line each, from real reviews.

- A record id copied from another account rendered "Unable to load". Around thirty shots and every deep
  link taken with it were void, and the matrix built on them looked clean.
- Gating verdicts were read off pages that had not finished loading.
- Entitlement was judged by decoding the auth cookie. The token was stale, the UI was not.
- A production table looked empty. Row level security was on and the session had no account set.
- A verified row claimed a tab label the live sweep contradicted. A critic agent had inverted it.
- Eight subagents each opened their own tabs: 24 tabs, twelve duplicated page loads, and a browser too
  busy to settle. One connection, a small fixed pool of tabs, one rich probe per page state.
- Two screenshots were of a local dev showcase, not the product. They proved nothing and read as proof.
- A browser MCP snapshot listed "No results" on a table with 793 loaded rows: an opacity-0 empty state.

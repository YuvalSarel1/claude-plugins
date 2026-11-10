# Parallelism rules for a QA sweep

Applies to a sweep run by subagents and to a sweep run by one driver script. The browser is a
single shared machine with server-side state, so parallelism is a budget, not a free speedup.

## The arithmetic that produced these rules

| Shape | Tabs | Windows | Page loads for the same matrix |
|---|---|---|---|
| 8 subagents, each opening its own tabs | 24 | 3 | 12 duplicated |
| 1 driver script, fixed tab pool | 4 | 1 | 12 total |

Same coverage, a third of the tabs, no duplicated loads, and one JSON file at the end instead of
eight transcripts to reconcile. Duplicated loads are not just slow: two agents loading the same
state at different moments produce two different answers to the same question.

## Rules

1. One CDP connection per run. Connect once to `localhost:9222`, attach sessions from it. Parallel
   connections fight over target attachment and lose events.
2. A small fixed pool of reusable tabs, 3 or 4. Create the pool up front, navigate tabs between
   jobs, close everything else first. Never a tab per worker, never a tab per job, because every
   extra tab is another page load competing for the same renderer, and a throttled background tab
   never settles and never raises a hover tooltip.
3. Never toggle a feature flag during a parallel run. Flags are server-side and shared, so a flip
   in one tab silently changes what every other tab is measuring, including tabs already mid-probe.
4. Never switch account during a parallel run. The active account is often server-side session state,
   not a URL parameter. Split the run by account instead: finish one, switch, start the next.
5. One rich probe per page state. One `Runtime.evaluate` that returns tabs, columns, row types,
   badges, buttons, banner text and flags together, rather than ten round trips that each see a
   slightly later page.
6. Settle before probing. Poll until `innerText` length is stable across two reads and a ready
   marker is present. Slow list calls have been seen to take 43 seconds, and a verdict read off a
   half-loaded page is a fabricated verdict.
7. Assert identity before reporting. Every probe checks a breadcrumb or heading regex and fails
   loudly on mismatch, so a wrong id produces an error and not a clean-looking row.
8. Serialise anything that writes. Approvals, quarantine, saved filters, anything that mutates
   state runs alone, after the read-only matrix is complete, because a mutation lands in shared
   server-side state and silently changes what every read-only cell still in flight is measuring.
9. Live measurement beats agent opinion. When a subagent, including a critic, disagrees with the
   sweep JSON, the sweep JSON wins or the state is re-probed. Do not edit a measured value to
   match an argument.
10. Fail a job, not the run. A job that cannot find its target reports MISS and continues. Partial
    coverage with an honest gap list beats a full matrix with invented cells.

Both drivers implement rule 2 by closing every page target that is not one of their pool tabs. Pointing
either of them at a browser holding work someone is reading will close those tabs without asking.

## Where subagents still pay

Agents are good at the parts with no shared browser state.

| Use agents for | Keep in one script |
|---|---|
| Writing and rewriting rows over disjoint slices | Every page load |
| Accuracy and consistency critics over a finished draft | Every screenshot |
| Independent proposals for a design question, then judges | Any flag or account change |
| Reading code or tickets in parallel | Anything that writes |

Every agent shape needs one owned fact source, the sweep JSON, that outranks all of them on a
conflict. Without it, critics argue and the loudest wins.

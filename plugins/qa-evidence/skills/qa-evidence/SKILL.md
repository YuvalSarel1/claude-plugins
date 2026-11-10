---
name: qa-evidence
description: Evidence-first exploratory QA of a signed-in web app over Chrome DevTools Protocol. Findings stay suspected until a live measurement confirms them. Use when QA-ing a web app screen or flow, checking a feature across plans, roles or flags, capturing annotated screenshots for a bug or PR, or writing up QA findings for engineers. Ships a state-matrix sweeper, an annotated screenshot driver that refuses to produce misleading images, a review page, and the rules that keep findings honest.
---

# qa-evidence

A QA review checks four things at once: is the screen complete, do the flows work, do the numbers
match the source of truth, and is anything on screen impossible.

**The one rule: nothing is a finding until it is confirmed against the live source.** Default every
claim to suspected, name its evidence inline, and scale verification to consequence. A wrong finding
costs more than a missing one.

All paths below are relative to this skill's folder. Node 22+, no dependencies; `jq` only for the optional one-liners in `rules/`.

## Prove the kit works first

```bash
node demo/check.mjs        # headless Chrome on its own port and profile, ~1 min
```

It sweeps and shoots `demo/app.html`, a fake product page carrying the traps below, and asserts each
verdict: settled past the skeleton, plan gate measured, wrong page refused (MISS), off-screen evidence
refused (OFFSCREEN), real-hover tooltip captured, invisible empty state detected. If it fails, fix that
before trusting a run on a real app.

## First use in a project: find or create the knowledge folder

Everything this skill learns in a project lives in one folder, `$QA_HOME`. The tools read it from the
environment; you read it at the start of every session.

**Find it, in this order:** the `QA_HOME` environment variable; a line `QA knowledge: <path>` in the
project's `CLAUDE.md` or `AGENTS.md`; an existing `qa/` at the project root. Use the first that exists.

**If none exists, create it yourself** (no script does this):

1. Ask the user where it should live. Default `qa/` at the project root; a folder outside the repo
   (say `~/qa/<project>`) avoids git entirely.
2. Create `$QA_HOME/AGENTS.md` (house knowledge, sections below), `$QA_HOME/rules/` (retro rules and
   case notes, one short file per task or trap), and `$QA_HOME/sessions/`. If the agent reads
   `CLAUDE.md`, add `$QA_HOME/CLAUDE.md` holding the single line `@AGENTS.md`, so every agent reads one file.
   Optional: `$QA_HOME/templates/{jobs.mjs,sweep.config.mjs,NOTES.md}` replace the demo ones in new sessions.
3. **Record the location in settings**, so the next session and the tools find it without asking:
   - Claude Code: `"env": {"QA_HOME": "<absolute path>"}` in the project's `.claude/settings.local.json`
     (local, not committed). Other agents: their project-level environment setting.
   - And one line in the project's `CLAUDE.md` or `AGENTS.md`: `QA knowledge: <path> (qa-evidence skill)`.
4. **Keep it out of git** when it is inside a repo, because sessions carry account ids, screenshots and
   customer data: add it to `.gitignore`, then confirm with `git check-ignore -q "$QA_HOME/sessions" && echo ignored`.
   If the user wants the rules shared with the team, ignore only `sessions/` and tell the user; never
   commit sessions.
5. Seed `$QA_HOME/AGENTS.md` with three empty tables: environments and repos, where the truth lives for
   each number on screen, state that is invisible in the URL. Add a `## Rules` table indexing
   `$QA_HOME/rules/*.md` with a "read it when" column.

Every later session: read `$QA_HOME/AGENTS.md` first and the rules it points to when their moment comes;
at the end, write back what the session taught (next section but one). Never write learned knowledge
into this skill's folder: it is replaced on update.

## A session

```bash
./launch-chrome.sh https://app.example.com    # dedicated profile, CDP on :9222; sign in by hand once
./new-session.sh <slug>                       # $QA_HOME/sessions/<date>-<slug>/
$EDITOR $QA_HOME/sessions/<date>-<slug>/sweep.config.mjs $QA_HOME/sessions/<date>-<slug>/jobs.mjs
node tools/sweep.mjs $QA_HOME/sessions/<date>-<slug>/sweep.config.mjs $QA_HOME/sessions/<date>-<slug>/sweep.json
node tools/shots.mjs $QA_HOME/sessions/<date>-<slug>/jobs.mjs --list    # then without --list
node tools/review.mjs $QA_HOME/sessions/<date>-<slug>/findings.json -o $QA_HOME/sessions/<date>-<slug>/review.html
```

Write rows into `findings.json` after reading `sweep.json` and the shots, quoting both. `NOTES.md` is
scope and running log, never evidence. The human ticks rows on the review page and copies the report.

| Tool | What it does |
|---|---|
| `tools/sweep.mjs` | Surfaces x states matrix (plans, roles, flags as URL variants). One rich probe per cell, `expect` identity gate, settle gate. Cells keyed `surface@state`. |
| `tools/shots.mjs` | Annotated capture: settle, assert identity, optional pre-step and real-mouse hover, locate, centre, box, verify in viewport, shoot. Statuses OK, MISS, OFFSCREEN, ERR. |
| `tools/review.mjs` | Self-contained review page from `findings.json`, ticks and notes in localStorage, Copy report. |
| `tools/lib/cdp.mjs` | The raw CDP client both drivers use. |

The drivers open their own tabs and close them at the end. `OWN_TABS=1` reuses tabs and closes every
other tab, for a dedicated QA browser nobody else is reading. `CDP_PORT` picks the port.

## Rules

Read the rule when the moment comes; do not restate it.

| File | Read it when |
|---|---|
| `rules/evidence.md` | Before promoting anything to a finding. The gate, identity assertion, settling, hidden text, entitlement by behaviour, scoping before believing an empty query. |
| `rules/screenshots.md` | Before any capture. What deserves an image, the six-step sequence, statuses, captions. |
| `rules/taxonomy.md` | When sorting rows: Fix, Unproven, Verified, Known. What the tick means. |
| `rules/findings-writing.md` | When writing a row. Titles, word caps, definitive statements, merging. |
| `rules/parallelism.md` | Before running anything in parallel or spawning subagents. |

## Build house knowledge for the app you are testing

The kit is the generic half. What makes reviews hold up on a real product is the half only your team
knows: where the traps are, which source is the truth, which internal APIs answer faster than the UI.
Grow it deliberately in `$QA_HOME/AGENTS.md` and `$QA_HOME/rules/` (see First use), not in this skill.

1. **Write down the environment once.** A table of every environment URL, every repo and what it owns,
   and how a console error names its host. Then how to launch and sign in, and which port maps to which
   browser profile when several debug browsers run.
2. **Name where the truth lives for each number on screen.** For every count a review will check, the
   API response or read-only query that produces it, with the exact scoping (account header, schema,
   session variable, region host). A UI number is checked against that, never against another screen.
3. **Record the state that is invisible in the URL.** Active account, plan overrides, feature flags,
   roles. How to read each one from the app's own responses, how to switch it, and how to confirm the
   switch actually happened. Two identical URLs showing two customers' data is the classic miss.
4. **Turn every false finding into a rule.** When a claim is retracted, add one line: what looked
   true, what the live source said, how to tell next time. Put it under a `Case notes` heading in the
   relevant rule. The folder this kit came from has more false-positive notes than bug notes, and they
   are worth more.
5. **Write a retro rule for every slow task.** When something took an hour and should have taken
   fifteen minutes (a deploy check, a PR, a rerun), write the order that would have made it one pass:
   the wrong first step, the right trigger, the check that proves it worked. Name the rule file after
   the task and index it in `CLAUDE.md` with a "read it when" line.
6. **Wrap the internal APIs you keep reaching for.** A small CLI that runs from the signed-in browser
   tab (sniff the bearer over CDP, call the admin or flag API, print a short table) beats re-deriving
   the request every session. Read-diff-write-verify for anything that writes, with `--dry-run`.
7. **Keep an anomaly list, and label it clues.** States that should be impossible on your product:
   counts that do not reconcile, timestamps out of order, orphans, duplicates, something empty that
   cannot be. Each is worth chasing, none is a finding until verified, and note the ones that turned out
   to be by design.
8. **Keep customer data out of the shared files.** Account ids, customer names and incident detail
   live in `$QA_HOME/sessions/` and private memory. `$QA_HOME/AGENTS.md` and `rules/` use placeholders, so they can be shared if the user chooses.
9. **Re-check by re-running, not by remembering.** A recheck reuses the earlier session's config:
   same account, same ids, same states. Synthesize missing state in place rather than switching to an
   account where the bug happens not to show.

Start with 1 to 3 on the first session; 4 and 5 accumulate on their own if every retraction and every
slow task leaves a line behind.

## Known limits

- The drivers need a Chromium browser with a debug port. Sign-in is manual, once per profile.
- `review.mjs` output embeds the findings; keep it out of public places when the rows carry customer data.
- Browser MCPs (Chrome DevTools MCP, Playwright MCP) are fine for one-off pokes, but their snapshots
  include hidden text and their network tools print auth headers inline. Use the drivers for evidence.

# Row taxonomy

Four categories. A category earns its existence only by implying a **different next action**.
Two labels with the same next action get merged. One label with two next actions gets split.
Everything below follows from that single rule.

## The four

| Key | Label on the page | Membership test, must be yes | Next action | Who acts |
|---|---|---|---|---|
| `fix` | Fix | The behaviour is wrong and the change can be named: one condition, one map entry, one CSS property, one missing check | Paste into the PR thread. | The PR authors |
| `unproven` | Unproven | There is no verdict and the blocker is an environment that does not exist yet, not more time at the keyboard | Book the named environment, rerun the probe. | Whoever owns that environment |
| `verified` | Verified | The gate could have failed and a measurement exists that would have caught the failure | Read, tick, move on. | The reviewer |
| `context` | Known, not filed | Already decided or understood outside the review, or an artefact of the test rig. No checkbox, no progress weight | None. Read only to stop it being raised again. | Nobody |

This file owns those four test strings. `DEFAULT_CATEGORIES` in `tools/review.mjs` and the
`categories` block in `templates/findings.example.json` copy them verbatim, and the page prints
them in the group header. Change this table first, then those two files, or the page states a rule the
rulebook does not.

Failing the test does not mean the row is weaker, it means the row is in the wrong column:

- Wrong behaviour, change not nameable, but measured: stays **Fix** and the body names the shape of the change (add a combined tier, move the check inside the component).
- Wrong behaviour, not measured, and one more probe would settle it: not a row yet. Go and measure it.
- A gate that could not have failed: not a row. Verified is for gates with a plausible failure, not for inventory of everything that looked normal.
- One row that passes both the Fix and the Verified test: split it into two rows that point at each other. Example from the tier review: the agent tab set is Verified at three tiers and Fix at the fourth, and each row ends by naming the other.

## What the tick means

The box cycles empty, tick, cross, empty. Known rows carry no box.

| Mark | Paste marker | Meaning |
|---|---|---|
| Tick | `[x]` | Agreed with the row as written. |
| Cross | `[!]` | Disputed. The note says why. A cross is not a resolution, it escalates. |
| Empty | `[ ]` | Not looked at. |

Progress counts a row as handled once it carries **either** mark, so a disputed row still moves the
bar. Known rows carry no progress weight, which is why they can be as many as the truth needs.

## What Copy report does with each

Section headings are the category labels upper-cased, so they follow the labels above.

| Category | In the paste |
|---|---|
| Fix | Every row in full under `FIX`: area, title, body, your note, whatever its mark. This is the section engineers read. |
| Any non-Fix row crossed | Repeated in full under `FAILED ON REVIEW`, so a disputed Verified row cannot be lost inside a count. |
| Verified | One line: `VERIFIED: N of M ticked, list on the page`. Nobody pastes 16 passing gates into Slack. |
| Unproven | Every row in full, under `UNPROVEN`. |
| Known, not filed | Title only, one line each, under `KNOWN, NOT FILED`. |

Those strings are produced by the `report()` function in `templates/review.template.html`, not
by a spec anything enforces. Nothing tests this table. Reread that function before trusting it.

The asymmetry is the point. Fix and Unproven are work, so they travel whole. Verified is
reassurance, so it travels as a number with the detail one click away. Known travels as a list of
things not to raise.

## The failed alternative, do not reinvent it

An earlier draft used five labels: **Issue**, **Needs your call**, **Open question**,
**Known open**, **Verified**. It collapsed under review because the labels described the
reviewer's feeling about a row, not the next action:

| Old label | Why it failed | Where its rows went |
|---|---|---|
| Issue | Mixed defects with a nameable code change against behaviour nobody had reproduced. Two next actions in one label. | Split into Fix and Unproven |
| Needs your call | Same next action as Open question, different tone. | Fix, once the body named the change and the reviewer's tick became the call |
| Open question | Half were answerable by one more probe, so they were not rows at all. | Measured and promoted to Fix or Verified, or dropped |
| Known open | Indistinguishable from Open question in the paste, and it carried progress weight for work nobody would do. | Known, not filed, with no checkbox |
| Verified | Survived unchanged. | Verified |

Three symptoms to watch for, each of which means the taxonomy is drifting back:

1. A reader asks "so what do I do with this row?" after reading the label.
2. Two categories produce the same section in the paste.
3. A category grows a subtype ("Issue, minor"). That is a split trying to happen, or a row that
   should not exist.

Severity is deliberately absent. Order inside Fix carries it, and a severity field only ever
started arguments that the body already settled with numbers.

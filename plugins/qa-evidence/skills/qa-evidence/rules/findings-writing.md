# How a row reads

A row is a title plus a body. The title is what a busy engineer reads in a Slack paste with every
body collapsed. The body is what convinces them. Categories are defined in `taxonomy.md`.

## Title

| Rule | Check |
|---|---|
| Nine words maximum | Count them. |
| States the finding, not the topic | It carries a verdict, not an area of investigation. |
| No code identifiers | No symbol names, flags, endpoints, file names, casing that only exists in the repo. |
| Stands alone | No "same as above", no "also", no pronoun pointing at the previous row. |

**1. Length and verdict.**
Before: `Investigate whether the inventory page still shows capability assets on partial tiers`
After: `Hidden capability assets still show in table, counts, charts`

**2. No code identifiers.**
Before: `ENTERPRISE_ONLY_KEYS not applied when planTier is below ENTERPRISE`
After: `All three Enterprise-only filters disappear together below Enterprise`

**3. Stands alone when collapsed.**
Before: `Same as the agent row, but for applications`
After: `Application tabs correct at Free, Pro and Enterprise`

## Body

Open with **one bold plain sentence** saying what a user sees or why it matters. Then at most two
evidence sentences, and those carry the numbers and the symbol names. Never the other way round.

**4. Plain opener, identifiers demoted to the evidence.**
Before: `The inventory BFF response mapper omits the gate that AuthZ middleware applies elsewhere.`
After: `**The gate is rendering only: anyone on a partial tier can read the locked data from devtools.**`

**5. Evidence sentences carry numbers.**
Before: `Counts look wrong on the partial tiers and the chart is affected.`
After: `The total reads 342 while visible tabs account for 27 + 61 + 3 + 12 = 103, and the missing 239 skew the By Source chart.`

Every number and every label in an evidence sentence must be traceable to the session's sweep JSON
(`<session>/sweep.json`) or to a shot taken on the surface under test (`<session>/shots/`), where
`<session>` is `$QA_HOME/sessions/<date>-<slug>/`. A critic agent's wording never overrides a
measurement.

**6. Measured, not remembered.**
Before: `On the Team plan the tab is still labelled End Users.`
After: `Applications show Exposure on both Team and Enterprise, and no End Users tab exists anywhere.`

## Word caps

Caps count the body only. A code string in backticks counts as one word.

| Category | Cap |
|---|---|
| Verified | 35 |
| Known, not filed | 35 |
| Unproven | 55 |
| Fix | 90 |

Over the cap means one of three things: two findings are wearing one row, the detail belongs in a
screenshot or a deep link, or the opener is explaining rather than asserting.

**7. Cap forces the assertion.**
Before: `We checked the tab strip at each tier and on the partial tiers the Integrations tab was not present, whereas at Enterprise it was, which appears to confirm the intended behaviour of the gating logic introduced in the PR.` (39 words, Verified)
After: `5 tabs on Free, Pro and Team, 6 on Enterprise.` (12 words)

## Defects are stated definitively

No hedging on a row that is real. Banned in Fix bodies: "latent, not live", "appears to",
"may be", "could potentially", "seems", "we think", "if I understand correctly". If the behaviour
is uncertain, the row is Unproven and says exactly which environment settles it.

**8. No hedge on a real defect.**
Before: `This looks latent rather than live, and it may become a problem if the component is ever reused.`
After: `**The gate is implicit and it needs to be explicit.** Reuse it, move it, or render it from anywhere else and unentitled customers get an Actions menu.`

## No jargon without its plain translation

Internal verbs ("falls back", "short-circuits", "hydrates", "flag resolution") only appear next to
what actually happens to a person.

**9. Translate.**
Before: `The tier resolver falls back to the posture branch when both legacy flags are set.`
After: `The tier is one value picked by first match, so posture wins and runtime is dropped: they lose the runtime half, which is Alerts and Exposure on applications, with no error and nothing on screen to show it.`

## No em dashes

Comma, colon, parentheses or a full stop. This applies to titles, bodies and notes. Reason: the em dash
reads as a pause the writer felt rather than a relationship the reader can act on, and choosing the
substitute forces the sentence to declare whether it is explaining, aside-ing or stopping.

**10. Punctuation.**
Before: `Risk is dropped, not locked [em dash] widget and column are absent on all three partial tiers.`
After: `**Risk is dropped, not locked.** Widget and column are absent on all three partial tiers and present at Enterprise.`

(The before is written with a placeholder because the character does not appear in these files.)

## Merge rows that are one finding sliced by tier or surface

One gate, checked in several places, is one row. Three rows saying the same sentence about three
surfaces waste three ticks and hide the fact that the gate is single.

When merging, **name every tier or surface in the body**, so a cross still says which one failed.
A merged row with a vague body turns a cross into a mystery.

**11. Merge by surface.**
Before: three rows, `Approval Status column hidden on inventory`, `Approval badge hidden on agent page`, `Change Approval Status button hidden`
After: one row, `Approval status gone on inventory and agent page below Enterprise`, body: `**One gate, three surfaces, no leaks.** On the three partial tiers the inventory Approval Status column, the agent page approval badge and the Change Approval Status button are all absent. All three present at Enterprise.`

**12. Merge by tier, tiers still named.**
Before: `Agent tabs correct at Free` and `Agent tabs correct at Pro` and `Agent tabs correct at Enterprise`
After: one row whose body reads `Free 1: Overview. Pro 4: Overview, Issues, Data, Knowledge, and Graph is a modal now, so four is right. Enterprise 8, the only tier that carries Activity.`

Do not merge across the taxonomy. If one tier of a merged set is broken, that tier leaves as its
own Fix row and both rows name each other.

## Before you paste

1. Read the titles alone, top to bottom. Does each one state a finding?
2. Count the words in the longest body against its cap.
3. Search the file for hedges, for untranslated jargon, and for the em dash character.
4. Confirm every number in a body came from a sweep JSON or a shot, not from an earlier draft.

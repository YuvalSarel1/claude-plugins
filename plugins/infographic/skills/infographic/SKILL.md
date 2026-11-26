---
name: infographic
description: Make an infographic that tells a story at a glance instead of dumping a reference sheet. Use when asked for an infographic, an explainer picture, a visual of a model or concept, or to make a diagram page "more visual". Covers the story structure, drawn examples, what to cut, label placement, phone width, both themes and iterating on comments.
---

# infographic

An infographic tells one story. A reader who looks for ten seconds should be able to retell it.
The failure mode is a **dashboard dump**: cards of chips, counts, hashes, status pills and rule boxes, all true and none
of it read.

## 1. Write the story first

Before drawing, write 4 to 6 steps, top to bottom, each one claim in a few words:

1. who the actors are
2. what kinds of things exist
3. how each kind is structured (levels, stages, parts)
4. how the actors pass things between them
5. why it is built this way (what you would lose by giving everything)
6. the goal

Each step gets a short heading (a numeral plus 3 to 6 words) and **one drawing**. Cut anything that does not serve
the story, even when it is true and was asked for in an earlier brief. The *why* and the *goal* steps are what turn a
diagram into an explanation: always include them.

## 2. Thread one example through everything

Pick one concrete scene from the domain and show every level or part of it through that scene, using the domain's
real names and numbers (for a game: one boss fight; for a pipeline: one request). Use real data where it exists:
read the source before trusting the brief, and fix the drawing where they differ. When an example is illustration
rather than data, say so when you hand the page over.

## 3. Draw the examples, don't write them

- Draw the thing itself: the screen, the card, the grid of tiles, the badge, the speech bubble holding the real tip.
- Test every icon for "what is this". If an icon needs explaining (two rings and an arrow), replace it with the
  concrete thing, or a bubble with the real words.
- Keep icons small and the same weight. A big card next to small glyphs reads as the important part.
- Draw the actors as icons with a role word underneath (a clipboard for the designer, a controller for the player),
  not as bare labelled circles.
- Draw a structure once in full. When it appears again, use a small glyph of it (a five-step mini stair), not a
  second labelled copy.

## 4. What to cut

- hashes, ids, node and edge counts, totals rows
- status pills ("on main", "we choose"); one small "in progress" tag where it matters
- rule cards and legends that restate the drawing
- rotated or vertical text
- explanatory sentences; labels and numbers only, no "a · b" dot-joined strings
- a label that repeats a nearby name ("advice" beside "4 Advice")
- an arrow label that repeats the step heading ("Coach picks" under "The Coach writes the Policy")

## 5. Layout and labels

- Words: big, few, lots of whitespace.
- **No label may touch another label or shape.** Work out text widths (about 0.6 × font size per character),
  give every label its own row, and leave arrow labels clear of the circles they connect. Widen the viewBox
  before squeezing.
- A staircase reads as levels: 0 at the bottom, each rung a number, a name and a drawing; colour the rungs on one
  scale (exact → interpreted → advice) instead of adding a trust legend.
- Things that are never given go on a dashed rung above the top, struck through with a thin line (1.5px, partly
  transparent) so the text stays readable. Off-by-default levels get a dashed outline.
- Arrows mean "needs" or "flows to"; label only the ones whose meaning isn't obvious.

## 6. Build

- Publish as a page (claude.ai Artifact) and keep republishing to the same URL.
- One inline SVG per step, viewBox about 640 to 800 wide, so text stays 12px or more on a phone. Stack sections at
  phone width rather than scaling one giant SVG down.
- Theme with CSS tokens defined for light and dark; style SVG shapes with classes from the page CSS. **Every class
  you use needs a rule**: an unstyled rect fills black.
- Marker ids are page-global; give each SVG's arrowhead its own id or reuse one on purpose.
- Generate repetitive drawings (rungs, grids, mini screens) with a short script that writes the SVG, so a layout
  change is one number.

## 7. Iterate on comments

The reader comments on specific shapes ("what is this", "slop", "too big", "strike too heavy"). For each: fix the
drawing, reply with what you actually changed (auto-replies may have promised something else), and resolve the
thread. Feedback that changes the underlying model, not just the drawing, goes to whoever owns the model.

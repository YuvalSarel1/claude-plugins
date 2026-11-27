---
name: walkthrough
description: Explain how a mechanism works with a step-through visual page, one diagram built up step by step that the reader drives with Back and Next, captions carrying the reasoning, and a small example whose numbers really compute. Use when someone wants to understand how or why something works (attention, a cache, a loss, a protocol, a scheduling algorithm), asks follow-up "but how" questions, or says a text explanation is hard to follow. For a story told at a glance, use the infographic skill instead.
---

# walkthrough

An infographic tells a story in ten seconds. A walkthrough lets the reader rerun a mechanism in their head. It
answers "how does this actually work", and it is done when the reader could compute the next step themselves.

| | infographic | walkthrough |
|---|---|---|
| Question | what is this, and why is it built this way | how does it compute, step by step |
| Time | ten seconds | minutes, at the reader's pace |
| Picture | one drawing per step, all on the page at once | one diagram per chapter that changes with each step |
| Words | labels only | a 2 to 3 sentence caption per step carries the reasoning |
| Numbers | real names and counts | a small example whose arithmetic adds up, plus the real system's numbers |
| Reader | looks | drives: Back, Next, clicks a row to see what it does |

## 1. Start from the reader's question

Write down the question in the reader's words ("why does a value mean what I hand over?") and what they already
know. Start one step past what they know; do not reteach it. Each follow-up question they ask becomes new steps or a
new chapter, never a paragraph appended below.

## 2. One chapter, one diagram, one change per step

- A chapter is one diagram that stays on screen. Each step adds or changes exactly one thing in it: a new row, a
  number filled in, a highlight moved, a mark struck out. The reader should see what changed without reading.
- 5 to 10 steps per chapter. Number them. Each caption opens with a bold step title (a numeral plus a claim), then
  one or two sentences of why.
- Build the picture before naming it. Show the formula only once the steps have drawn every part of it, then point
  each term at its mark.
- Explain a role by where the thing is used ("q and k only ever meet inside the dot product, so they can only decide
  how much"), not by analogy alone. An analogy is a caption aid, never the explanation.

## 3. The whole page stays on the path

Every section is a chapter in the same format. No prose sections, standalone tables or static figures between
chapters: a reader who likes the stepper and then hits a wall of text stops reading there. Detail that does not fit a
step goes in a later step, a later chapter, or a collapsed box the reader opens on purpose. Page structure:
title, a one-sentence lead naming the chapters, the chapters, sources.

## 4. Numbers that compute

- Use one small example the whole page shares (a five-token sentence, a three-node cluster), with the domain's
  real names.
- Generate the example's numbers in the script from their inputs (scores, then softmax, then the weighted sum), so
  every figure shown in a caption or a cell is consistent with the others. Say "illustrative" once.
- Put the real system's measured numbers in their own step, with the source. Mark inference as inference, and say
  what the source does not document.
- When the reader asks "how do these numbers work out", answer with a chapter that builds the number from its
  factors, one factor per step (128, then × 8 heads, then × 2, then × 28 layers, then × 2 bytes).

## 5. Interaction only where it answers a question

Back, Next and clickable step dots on every chapter. Add a click only when it shows something the steps cannot:
click a row to see what that token reads, toggle a mask on and off. No hover-only information, no sliders that
change nothing a caption depends on.

## 6. Drawing

Follow the infographic skill's layout and label rules: labels never touch other labels or shapes, colours on one
scale, arrows only where they carry meaning. In addition:

- Keep a colour for each role across every chapter (blue for the reader, red for keys, green for values). A colour
  that changes meaning between chapters breaks the path.
- viewBox about 1060 wide, text 18px or more inside it, captions in HTML above the SVG at 20px or more.
- Hand-drawn look (Caveat for titles, Kalam for labels) on a paper background, light theme, unless the host
  product has its own design system.

## 7. Build and check

- Use `assets/stepper.html`: a working page with the stepper engine (`stepper(id, steps)`, each step a `cap` and a
  `draw()` returning SVG markup) and drawing helpers. Copy it and replace the chapters.
- One script error stops every chapter on the page. After each edit, extract the script and run
  `node --check`. When generating JS from Python, write it with a plain string, not a raw string with `\\"`.
- Screenshot every step of every chapter, not just the first: in a copy of the page, click Next n times, move the
  chapter to the top, take a headless Chrome screenshot, and put the shots on one contact sheet. Fix overlaps,
  text running off the right edge, and empty frames before showing the page.
- Open the page for the reader when it is ready, and say which numbers are illustrative.

## 8. Iterate on questions

Treat every follow-up question as a missing step. Add the steps where the question arose, rerun the step
screenshots, and reply with what changed and where.

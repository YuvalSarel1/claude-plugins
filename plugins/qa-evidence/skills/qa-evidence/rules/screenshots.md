# Screenshot rules

A screenshot is evidence only if it shows the finding. Anything else is decoration, and decoration in a
review page is read as proof.

## The test, before any capture

Answer both, or take no image:

1. Is the finding visible in a static picture of this surface?
2. Is the surface under test the product, not a dev harness or a stand-in?

If either answer is no, the row carries a deep link and no image.

## The capture sequence

Never screenshot a page and hope. Run the six steps in order, in one pass.

| # | Step | Why |
|---|---|---|
| 1 | Navigate, then settle | A skeleton screenshots cleanly and proves nothing |
| 2 | Assert page identity | The wrong account or the wrong record renders an error page that photographs fine |
| 3 | Locate the target element | The claim is about an element, not a page |
| 4 | `scrollIntoView({block:'center'})` | Evidence 600px below the fold is not in the shot |
| 5 | Draw a labelled box, dim the rest when there is one target | The reader must not hunt |
| 6 | Verify the box is inside the viewport, then capture | An off-screen box is a failed job, not a picture |

```js
el.scrollIntoView({block:'center',inline:'nearest'});
const r = el.getBoundingClientRect(); const inView = r.top > -2 && r.bottom <= innerHeight+2 && r.height > 0;
```

Reference implementation: `tools/shots.mjs`, driven by a jobs file shaped like `demo/jobs.mjs`. Red box for the primary target, blue for a second, text label on the
box, viewport 1680x1000 at `deviceScaleFactor: 2`. On a hover job the scroll step is skipped, because
scrolling moves the page under the mouse and closes the tooltip.

## Fail loudly

Every job returns one of four statuses, and the run writes a JSON report.

| Status | Meaning | What to do |
|---|---|---|
| OK | Target found, boxed, in viewport | Use it |
| MISS | Target not found, or the page identity assertion failed | Fix the locator or the id, do not ship the row |
| OFFSCREEN | Boxed but outside the viewport | Fix the scroll, re-run |
| ERR | The locator threw | Fix the locator |

```bash
node tools/shots.mjs <session>/jobs.mjs --list      # what would run, nothing launched
node tools/shots.mjs <session>/jobs.mjs [filter]    # filter matches file, tier or url
jq -r '.[] | select(.status != "OK")
       | "\(.status)\t\(.file)\t\(.reason // (.offscreen|join(", ")))"' <session>/shots-report.json
```

The report is written as `<out>-report.json`, beside the output directory named by the jobs file's `out`
key. With the session layout, `out: './shots'` puts it at `<session>/shots-report.json`.

A non-OK job never produces a file that reaches the review page. A pretty-but-empty picture is the exact
failure this sequence exists to prevent. One MISS reason is not evidence of absence: a `find` that pages
a large table can outrun the 120s call timeout and report `timeout Runtime.evaluate`. Read the reason
string, and rerun a timeout with a filter or `tabs: 1` before believing the row does not exist.

## No image at all for these

- Findings that live in a **response body**. Quote the field and the value, link the request.
- Findings that live in an **address bar or a redirect**. State the requested URL and the landed URL.
- Findings that live in a **code path**. Name the file and the symbol.
- Findings on a **dev showcase, a local harness or a stand-in account**. Not the surface under test.

Never pad a row with a picture of a normal-looking page. An image on a row is a promise that the defect
is in the frame.

## Thumbnails must not crop the evidence

A thumbnail with `object-fit: cover` cuts the boxed area out of the very row it illustrates. Use
`object-fit: contain` on the thumbnail, keep the full image behind a lightbox, and confirm the box is
still visible at thumbnail size before shipping the page.

## Caption every image

One line under every image, saying what to look at, in plain words. Not the filename, not the tier code.
Captions are part of the findings schema: write a shot as `{"file": "...", "caption": "..."}`. A bare
file name still works and falls back to showing the file name, which is the bad case below, so
`tools/review.mjs` warns for every uncaptioned shot.

- Good: "The Alerts column shows License Required at the lowest tier."
- Bad: "x-locked-cell-tooltip-limited.png"
- Bad: "Screenshot of the list page."

Two boxes means two clauses in the caption, in the order the boxes are numbered. Hover states get the
trigger named: real mouse movement opens tooltips, synthetic DOM events do not, so a tooltip shot that
cannot be reproduced by hand is a broken shot.

## Case notes

- Shots captured at page top while the evidence sat 600px below the fold. The reviewer could not see the
  claim and had to open the app anyway.
- A thumbnail cropped by `object-fit: cover` removed the boxed cell from a row that was about that cell.
- Two shots turned out to be the local dev showcase, not the product. Both looked
  entirely convincing.
- A record id from another account rendered "Unable to load asset", and every shot taken with it was void.

## Hover targets

- Hover the target's **top-left corner plus 2px**, not its centre, when a tooltip will not open: an
  inner text span can swallow the pointer. `shots.mjs` hovers the centre, so for such a target return
  a small corner element from `hover`, or open the tooltip in `pre`.
- A hover job can MISS on a background tab: tooltips that animate in never finish on a hidden tab. Run
  those with `tabs: 1`, and the driver brings its tab to front before the mouse moves.
- Without `OWN_TABS=1` the drivers leave other tabs alone, so another tab can hold focus. `AFTER_HOVER=<ms>`
  overrides the 1.6 s hover wait.

## Labels must not sit on content

A label placed on the tooltip it annotates, or on the neighbouring chip, reads worse than no label.
`shots.mjs` now keeps labels off every other target rect (above by default, below when above would
cover one). Per entry `pos: 'below' | 'right'` overrides it when the default lands on untargeted
text. A boxed tooltip needs no label at all: `label: ''` draws the box only. A truncated chip
("Attributes = O...") is fixed in `pre` by clearing `max-width` / `text-overflow` on the
chip subtree before the capture, not by a longer label.

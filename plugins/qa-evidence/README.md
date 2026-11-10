# qa-evidence

A skill for agents doing exploratory QA on a signed-in web app. Browser MCPs let an agent click
around; this adds the part that makes a QA finding worth sending to an engineer: it stays **suspected**
until a live measurement confirms it.

- **Sweeps.** Surfaces x states (plans, roles, flags as URL variants), one probe per cell, each cell
  gated on page identity and on the page having finished loading. One JSON matrix, keyed `surface@state`.
- **Annotated shots that refuse to mislead.** Settle, assert the page, locate, centre, box, check the
  box is in view, then shoot. A wrong page is a MISS and off-screen evidence is OFFSCREEN, never a
  clean-looking picture.
- **A review page.** Findings sorted into Fix, Unproven, Verified and Known; a person ticks rows and
  copies the report.
- **The rules.** Short files on evidence, screenshots, taxonomy, writing and parallelism, built from
  real false findings.

```
/plugin marketplace add YuvalSarel1/claude-plugins
/plugin install qa-evidence@yuvalsarel1
```

Then, from the skill folder, `node demo/check.mjs` runs both drivers against a bundled fake app in a
throwaway headless Chrome and asserts every verdict. `SKILL.md` has the session flow and how to build
house knowledge for your own product.

Node 22+, no dependencies, Chrome or Chromium.

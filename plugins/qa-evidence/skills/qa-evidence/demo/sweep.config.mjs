// Sweep the demo app: 2 surfaces x 2 plans = 4 cells.
//   node tools/sweep.mjs demo/sweep.config.mjs demo/out/sweep.json
// The `broken` surface fails its expect, so its cells are invalid, not probed.
const here = new URL('.', import.meta.url).href;

export default {
  base: here,
  tabs: 2,
  settleMarker: /Atlas|Unable to load/,  // finished page or finished error page
  states: [
    { id: 'free', params: { plan: 'free' } },
    { id: 'pro', params: { plan: 'pro' } },
  ],
  surfaces: [
    { id: 'projects', path: 'app.html', expect: /Projects/ },
    { id: 'broken', path: 'app.html?id=missing', expect: /Projects/ },
  ],
  probe: {
    extend: `(()=>({
      exportButton: [...document.querySelectorAll('button')].some(b => /^Export/.test(b.innerText)),
      // innerText still holds the opacity:0 empty state next to five loaded rows
      emptyTextPresent: /No projects found/.test(document.body.innerText),
      emptyTextVisible: [...document.querySelectorAll('p')].some(p => /No projects found/.test(p.textContent) && getComputedStyle(p).opacity !== '0'),
    }))()`,
  },
};

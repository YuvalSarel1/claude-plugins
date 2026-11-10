// Annotated shots of the demo app, one job per status the driver can return.
//   node tools/shots.mjs demo/jobs.mjs
// Expected: table-pro OK, tooltip OK, wrong-id MISS, split-boxes OFFSCREEN.
const app = new URL('app.html', import.meta.url).href;
// finished page or finished error page, so a wrong id fails fast instead of timing out
const ready = "document.querySelectorAll('tbody tr:not(.skel)').length > 0 || /Unable to load/.test(document.body.innerText)";

export default {
  out: './out/shots',
  viewport: { width: 1280, height: 800, scale: 1 },
  tabs: 2,
  ready,
  jobs: [
    { file: 'table-pro.png', tier: 'pro', url: `${app}?plan=pro`, expect: 'Projects',
      find: "[{el: byText('button', /^Export CSV/), label: 'Export is available on pro'}, {el: mainTable(), label: 'Five projects'}]" },
    { file: 'tooltip.png', tier: 'free', url: `${app}?plan=free`, expect: 'Projects',
      hover: "document.getElementById('risk-info')",
      find: "{el: document.querySelector('[role=tooltip]').offsetParent && document.querySelector('[role=tooltip]'), label: ''}" },
    { file: 'wrong-id.png', tier: 'free', url: `${app}?id=missing`, expect: 'Projects',
      find: 'mainTable()' },
    { file: 'split-boxes.png', tier: 'free', url: `${app}?plan=free`, expect: 'Projects',
      find: "[{el: mainTable(), label: 'Table'}, {el: document.getElementById('audit'), label: 'Audit log, 2400px lower'}]" },
  ],
};

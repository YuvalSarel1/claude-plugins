#!/usr/bin/env node
// Annotated capture driver. One job = navigate, settle until the page stops
// changing, assert identity, run a pre-step, hover with a real mouse, locate the
// target, scroll it to centre, draw labelled boxes over it, screenshot.
//
// A job that cannot find its target FAILS loudly (MISS/ERR) instead of producing
// a pretty but empty picture. That is the point of the tool.
// On a hover job the scroll is skipped, since the hover step has already centred
// the target and scrolling again would close the tooltip.
//
//   node tools/shots.mjs <jobs-file.mjs> [filter-substring]
//   node tools/shots.mjs <jobs-file.mjs> --list
//
// Flags:  --list           print the job table and exit, nothing is launched
//         --port=9222      CDP port (env CDP_PORT, default 9222)
//
// Exit:   0 every job OK, 1 any job MISS/ERR/OFFSCREEN, 2 bad usage or bad jobs file.
//
// Writes one png per job under out, plus <out>-report.json beside that directory.
// By default the pool is new tabs, closed again at the end, and nothing else in the
// browser is touched. OWN_TABS=1 reuses tabs already on a job origin and CLOSES every
// other tab, which keeps a dedicated QA browser lean: only use it on a browser
// nobody is reading.
//
// Needs a Chrome already signed into the app and listening on the CDP port:
//   ./launch-chrome.sh <start-url>
//
// Node 22+ (global WebSocket, AbortSignal.timeout). No dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const USAGE = `usage: node tools/shots.mjs <jobs-file.mjs> [filter-substring] [--list] [--port=9222]

The jobs file default-exports { out, viewport, tabs, jobs }:
  out       output directory for the png files (~ and paths relative to the jobs file are fine)
  viewport  { width, height, scale }        default 1680 x 1000, scale 2
  tabs      size of the reusable tab pool   default 3
  jobs      [{ file, url, expect, pre, hover, find, tier }]
              file    png name, written under out
              url     page to navigate to
              expect  optional, regex source, body text must match or the job MISSes
              pre     optional, JS run after settle (may await), e.g. open a menu
              hover   optional, JS returning one element, hovered with a real mouse
              find    JS returning an element, {el,label,pos?}, or an array of those (may await); pos: above|below|right
              tier    optional label, also matched by the filter argument
See demo/jobs.mjs.`;

const die = (code, msg) => { console.error(msg); process.exit(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const untilde = s => (s.startsWith('~/') ? join(homedir(), s.slice(2)) : s);
const tilde = s => (s.startsWith(homedir() + '/') ? '~' + s.slice(homedir().length) : s);

// ---- timings (every wait in the run, in one place) -------------------------
const POLL = 2500;        // settle poll interval
import { connect, CdpDown, errmsg } from './lib/cdp.mjs';

const POLL_MAX = 40;      // settle gives up after POLL * POLL_MAX
const STABLE = 2;         // consecutive equal body lengths that count as settled
const AFTER_SETTLE = 1000;
const AFTER_PRE = 1400;
const AFTER_HOVER = Number(process.env.AFTER_HOVER) || 1600;
const BEFORE_SHOT = 400;
const CALL_TIMEOUT = 120000;
const JOB_TIMEOUT = 200000;

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('-'));
const pos = argv.filter(a => !a.startsWith('-'));
const LIST = flags.includes('--list');
if (flags.includes('-h') || flags.includes('--help') || !pos[0]) die(pos[0] ? 0 : 2, USAGE);
const bad = flags.find(f => !['--list', '-h', '--help'].includes(f) && !f.startsWith('--port='));
if (bad) die(2, `unknown flag ${bad}\n\n${USAGE}`);
const PORT = Number(flags.find(f => f.startsWith('--port='))?.slice(7) || process.env.CDP_PORT || 9222);
if (!Number.isInteger(PORT) || PORT < 1) die(2, `bad port: ${PORT}`);

// ---- jobs file -------------------------------------------------------------
const jobsPath = resolve(process.cwd(), untilde(pos[0]));
let cfg;
try {
  cfg = (await import(pathToFileURL(jobsPath).href)).default;
} catch (e) {
  die(2, `cannot load jobs file ${tilde(jobsPath)}\n  ${errmsg(e)}`);
}
if (!cfg || typeof cfg !== 'object') die(2, `${tilde(jobsPath)} must default-export an object, see --help`);
if (!Array.isArray(cfg.jobs) || !cfg.jobs.length) die(2, `${tilde(jobsPath)} exports no jobs array`);
if (typeof cfg.out !== 'string' || !cfg.out) die(2, `${tilde(jobsPath)} exports no out directory`);

const OUT = resolve(dirname(jobsPath), untilde(cfg.out));
const REPORT = join(dirname(OUT), basename(OUT) + '-report.json');
const W = cfg.viewport?.width ?? 1680;
const H = cfg.viewport?.height ?? 1000;
const SCALE = cfg.viewport?.scale ?? 2;
const TABS = Math.max(1, cfg.tabs ?? 3);

const seen = new Set();
cfg.jobs.forEach((j, i) => {
  const at = `job ${i} (${j?.file ?? 'no file'})`;
  if (!j || typeof j !== 'object') die(2, `${at}: not an object`);
  for (const k of ['file', 'url', 'find']) if (typeof j[k] !== 'string' || !j[k]) die(2, `${at}: missing ${k}`);
  for (const k of ['pre', 'hover', 'tier', 'ready']) if (j[k] != null && typeof j[k] !== 'string') die(2, `${at}: ${k} must be a string`);
  if (j.expect != null && typeof j.expect !== 'string' && !(j.expect instanceof RegExp)) die(2, `${at}: expect must be a string or RegExp`);
  if (j.file.startsWith('/') || j.file.split('/').includes('..')) die(2, `${at}: file must stay inside out`);
  if (seen.has(j.file)) die(2, `${at}: duplicate file name, the second capture would overwrite the first`);
  seen.add(j.file);
});

const only = pos[1];
const jobs = only ? cfg.jobs.filter(j => j.file.includes(only) || j.tier === only || j.url.includes(only)) : cfg.jobs;
if (!jobs.length) die(2, `no job matches "${only}", run with --list to see the job table`);

if (LIST) {
  for (const j of jobs) console.log(`${j.file.padEnd(34)} ${(j.tier || '-').padEnd(10)} ${j.url}`);
  console.log(`\n${jobs.length}/${cfg.jobs.length} jobs, out ${tilde(OUT)}`);
  process.exit(0);
}
// ---- CDP -------------------------------------------------------------------
// The client lives in lib/cdp.mjs. Screenshots are written here, because only
// this tool knows where a job's file belongs.
const shot = async (sid, file) => {
  const p = join(OUT, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, await c.screenshot(sid));
};

// ---- in-page helpers, injected into pre, hover and find --------------------
// T(sel, root)     querySelectorAll as a real array, root defaults to document
// tx(el)           trimmed innerText, safe on null
// byText(sel, re)  first element matching sel whose text matches re
// mainTable()      the table with the most tbody rows, the datatable on the page
// header()         the main table's header row, for boxing the column set
// tabbar()         the tablist that owns the first [role=tab], for boxing a tab set
// rows()           the main table's tbody rows, [] when there is no table
// nextPage()       the datatable's next-page control, by aria-label or text
// findRow(re)      await: scan rows, click next page, up to 18 pages, null if never matched
// widgets(re)      the widget strip whose caption matches re, walked up to the first wide ancestor
const HELPERS = String.raw`
const T=(s,root)=>[...(root||document).querySelectorAll(s)];
const tx=e=>((e&&e.innerText)||'').trim();
const byText=(sel,re)=>T(sel).find(e=>re.test(tx(e)));
const mainTable=()=>T('table').sort((a,b)=>b.querySelectorAll('tbody tr').length-a.querySelectorAll('tbody tr').length)[0];
const header=()=>{const t=mainTable();return t&&(t.querySelector('thead tr')||t.querySelector('thead'));};
const tabbar=()=>{const t=T('[role=tab]')[0];return t&&(t.closest('[role=tablist]')||t.parentElement);};
const rows=()=>mainTable()?T('tbody tr',mainTable()):[];
const nextPage=()=>T('button,[role=button]').find(b=>/next page/i.test(b.getAttribute('aria-label')||tx(b)));
const findRow=async re=>{
  for(let p=0;p<18;p++){
    const r=rows().find(x=>re.test(x.innerText||''));
    if(r) return r;
    const n=nextPage(); if(!n||n.disabled||n.getAttribute('aria-disabled')==='true') return null;
    n.click(); await new Promise(x=>setTimeout(x,1800));
  }
  return null;
};
const widgets=(re)=>{const w=re&&byText('*',re); if(!w) return null;
  let e=w; for(let i=0;i<8&&e.parentElement;i++){e=e.parentElement; if(e.getBoundingClientRect().width>900) break;} return e;};
`;

// wrap a find expression into a highlight-and-report call.
// scroll is skipped on hover jobs: the hover step already centred the target and
// scrolling now moves the page out from under the mouse, which closes the tooltip.
const HILITE = (find, expect, scroll = true) => `(async()=>{
${HELPERS}
try{
  ${expect ? `{const __re=new RegExp(${JSON.stringify(expect)});
    if(!__re.test(document.body.innerText))
      return {ok:false,reason:'wrong page, expected '+__re+' in the body'};}` : ''}
  let t = await (async()=>(${find}))();
  if(!t) return {ok:false,reason:'target not found'};
  const list = (Array.isArray(t)?t:[t]).filter(Boolean);
  if(!list.length) return {ok:false,reason:'empty target list'};
  const el0 = list[0].el || list[0];
  if(!el0 || !el0.getBoundingClientRect) return {ok:false,reason:'not an element'};
  ${scroll ? `el0.scrollIntoView({block:'center',inline:'nearest'});
  await new Promise(r=>setTimeout(r,800));` : ''}
  document.querySelectorAll('.__hl').forEach(e=>e.remove());
  const dim = list.length===1;
  const out=[], placed=[];
  const rects = list.map(it=>{const e=it.el||it; return e&&e.getBoundingClientRect?e.getBoundingClientRect():null;});
  const hits=(x,y,w,h,skip)=>rects.some((q,k)=>k!==skip&&q&&x<q.right+6&&q.left-6<x+w&&y<q.bottom+6&&q.top-6<y+h);
  for(const [i,it] of list.entries()){
    const el = it.el||it, label = it.label||'';
    if(!el || !el.getBoundingClientRect) return {ok:false,reason:'entry '+i+' is not an element'};
    const r = rects[i];
    const col = it.color || (i===0 ? '#ff2d55' : '#0a84ff');
    const b=document.createElement('div'); b.className='__hl';
    b.style.cssText='position:fixed;left:'+(r.left-5)+'px;top:'+(r.top-5)+'px;width:'+(r.width+10)+'px;height:'+(r.height+10)+'px;'
      +'border:3px solid '+col+';border-radius:6px;z-index:2147483646;pointer-events:none;'
      +(dim?'box-shadow:0 0 0 9999px rgba(15,17,26,.35);':'box-shadow:0 0 0 2px rgba(255,255,255,.9);');
    document.body.appendChild(b);
    if(label){
      const l=document.createElement('div'); l.className='__hl';
      const lw = Math.min(900, label.length*7.5+18);
      // above by default; below when above would cover another target; never on top of a target
      let ly = r.top-34, lx = r.left-5;
      if(it.pos==='right' && r.right+lw+14 < innerWidth){ lx = r.right+12; ly = r.top+r.height/2-12; }
      else if(it.pos==='below' || ly < 0 || hits(lx,ly,lw,24,i)) ly = r.top+r.height+8;
      if(hits(r.left-5,ly,lw,24,i)) ly = Math.min(...rects.filter(Boolean).map(q=>q.top))-34;
      // nudge down until this label does not sit on an already-placed one
      while(placed.some(p=>Math.abs(p.y-ly)<24 && r.left < p.x+p.w && p.x < r.left+lw)) ly += 26;
      placed.push({x:lx,y:ly,w:lw});
      l.style.cssText='position:fixed;left:'+lx+'px;top:'+ly+'px;'
        +'background:'+col+';color:#fff;font:600 13px/1.6 -apple-system,system-ui,sans-serif;padding:2px 9px;'
        +'border-radius:5px;z-index:2147483647;pointer-events:none;white-space:nowrap;max-width:900px;overflow:hidden';
      l.textContent=label; document.body.appendChild(l);
    }
    out.push({label,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
      inView: r.top>-2 && r.bottom<=innerHeight+2 && r.height>0 && r.right>0 && r.left<innerWidth});
  }
  return {ok:true,boxes:out,title:document.title,
    heading: tx(document.querySelector('h1,h2')||{}).slice(0,80)};
}catch(e){ return {ok:false,reason:String(e && e.message || e)}; }
})()`;

const wrap = expr => `(async()=>{${HELPERS}
  try{ return await (async()=>(${expr}))(); }catch(e){ return {__err:String(e && e.message || e)}; }})()`;

// ---- browser ---------------------------------------------------------------
let c;
try { c = await connect({ port: PORT }); }
catch (e) { die(2, e instanceof CdpDown ? e.message : errmsg(e)); }   // connect first, so a dead port leaves no empty out dir
mkdirSync(OUT, { recursive: true });
const origins = new Set(jobs.map(j => { try { return new URL(j.url).origin; } catch { return null; } }).filter(Boolean));
const OWN = !!process.env.OWN_TABS;
const reusable = !OWN ? [] : (await c.pages())
  .filter(p => /^https?:/.test(p.url))
  .sort((a, b) => Number(origins.has(orig(b.url))) - Number(origins.has(orig(a.url))));
function orig(u) { try { return new URL(u).origin; } catch { return null; } }

const workers = [];
const NW = Math.min(TABS, jobs.length);
for (let i = 0; i < NW; i++) {
  const tid = reusable[i]?.targetId || (await c.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const sid = await c.attach(tid);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: SCALE, mobile: false }, sid).catch(() => {});
  // only one tab of the pool is visible, so the rest would be throttled: keep every
  // tab live and focused, otherwise hover tooltips never animate in and jobs MISS
  await c.send('Page.setWebLifecycleState', { state: 'active' }, sid).catch(() => {});
  await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sid).catch(() => {});
  workers.push({ tid, sid });
}
// OWN_TABS=1: a fixed pool, everything else closed, so no stray tab steals focus or
// memory. Without it foreign tabs are left alone; hover jobs may then MISS if another
// tab holds focus, so run those with tabs: 1 and the pool tab in front.
if (OWN) {
  for (const p of await c.pages()) {
    if (!workers.some(w => w.tid === p.targetId)) await c.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
  }
}

// settle: poll the body text length until it stops changing.
//
// Text stability alone settles on a skeleton screen, which is how a half-loaded
// page gets photographed and read as an empty state. Give the job or the config
// a `ready` expression naming something only the finished page has, and both
// conditions must hold. Default: the page is not loading and has some text.
const settleExpr = ready => `(()=>{const b=document.body;
  const base=document.readyState!=='loading' && !!b && b.innerText.trim().length>0;
  let extra=true; ${ready ? `try{extra=!!(${ready});}catch(e){extra=false;}` : ''}
  return {len:((b&&b.innerText)||'').length, ready: base && extra};})()`;

const settle = async (sid, ready) => {
  const expr = settleExpr(ready);
  let last = -1, st = 0;
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL);
    const r = await c.ev(sid, expr).catch(() => null);
    if (!r || r.__err) continue;
    if (r.ready && r.len === last) { st++; if (st >= STABLE) return true; } else st = 0;
    last = r.len;
  }
  return false;
};

// ---- run -------------------------------------------------------------------
const withTimeout = (p, ms, what) => {
  let t;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`job timeout after ${ms / 1000}s: ${what}`)), ms); t.unref(); }),
  ]);
};

const one = async (w, j) => {
  const base = { file: j.file, tier: j.tier, url: j.url };
  await c.send('Page.navigate', { url: j.url }, w.sid);
  const settled = await settle(w.sid, j.ready ?? cfg.ready);
  await sleep(AFTER_SETTLE);

  let preOk;
  if (j.pre) {
    const pr = await c.ev(w.sid, wrap(j.pre)).catch(e => ({ __err: errmsg(e) }));
    preOk = !(pr && pr.__err) && pr !== false;   // recorded, not fatal, find() is the judge
    await sleep(AFTER_PRE);
  }
  // real mouse move, tooltips ignore synthetic DOM events. The approach point
  // matters: some tooltips only open on a move that crosses into the element.
  const doHover = async () => {
    const pt = await c.ev(w.sid, `(()=>{${HELPERS}
      const e=(${j.hover}); if(!e||!e.getBoundingClientRect) return null;
      e.scrollIntoView({block:'center'});
      const r=e.getBoundingClientRect();
      return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`).catch(() => null);
    if (!pt || pt.__err) return false;
    // a hidden tab never animates a tooltip in (Mantine transitions stall); bring it to front first
    await c.send('Target.activateTarget', { targetId: w.tid }).catch(() => {});
    await c.mouse(w.sid, pt.x - 40, pt.y - 40);
    await sleep(200);
    await c.mouse(w.sid, pt.x, pt.y);
    await sleep(120);
    await c.mouse(w.sid, pt.x + 1, pt.y + 1);   // the jiggle hover.mjs does; some tooltips need a second move
    await sleep(AFTER_HOVER);
    return true;
  };

  const expect = j.expect instanceof RegExp ? j.expect.source : j.expect;
  const hilite = () => c.ev(w.sid, HILITE(j.find, expect, !j.hover)).catch(e => ({ ok: false, reason: errmsg(e) }));

  if (j.hover && !(await doHover())) return { ...base, status: 'MISS', reason: 'hover target not found', settled, preOk };
  let r = await hilite();
  // a tooltip that never opened, or closed while the page was still moving, is
  // the common flake on a busy tab: hover once more before calling it a MISS
  if (j.hover && (!r || (!r.ok && !r.__err))) {
    await sleep(1000);
    if (await doHover()) r = await hilite();
  }
  if (r && r.__err) return { ...base, status: 'ERR', reason: String(r.__err).slice(0, 160), settled, preOk };
  if (!r || !r.ok) return { ...base, status: 'MISS', reason: (r && r.reason) || 'no result', settled, preOk };

  await sleep(BEFORE_SHOT);
  await shot(w.sid, j.file);
  const hidden = r.boxes.filter(b => !b.inView).map(b => b.label || '(unlabelled)');
  return { ...base, status: hidden.length ? 'OFFSCREEN' : 'OK', settled, preOk, boxes: r.boxes.length, offscreen: hidden };
};

const report = [];
const run = async (w, list) => {
  for (const j of list) {
    const t0 = Date.now();
    let rec;
    try { rec = await withTimeout(one(w, j), JOB_TIMEOUT, j.file); }
    catch (e) { rec = { file: j.file, tier: j.tier, url: j.url, status: 'ERR', reason: errmsg(e).slice(0, 160) }; }
    // a long find (findRow paging a big table) can outlast the CDP call timeout
    if (/^timeout Runtime.evaluate/.test(rec.reason || '')) rec.reason += ` (find ran past ${CALL_TIMEOUT / 1000}s, rerun it alone or with tabs: 1)`;
    rec.ms = Date.now() - t0;
    report.push(rec);
  }
};
const chunks = Array.from({ length: workers.length }, () => []);
jobs.forEach((j, i) => chunks[i % workers.length].push(j));
await Promise.all(workers.map((w, i) => run(w, chunks[i])));

report.sort((a, b) => a.file.localeCompare(b.file));
for (const r of report) {
  const note = r.reason || (r.offscreen?.length ? 'offscreen: ' + r.offscreen.join(', ') : '');
  console.log(`${r.status.padEnd(9)} ${r.file}  ${note}`);
}
const okCount = report.filter(r => r.status === 'OK').length;
writeFileSync(REPORT, JSON.stringify(report, null, 1));
if (!OWN) for (const w of workers) await c.send('Target.closeTarget', { targetId: w.tid }).catch(() => {});
console.log(`\n${okCount}/${report.length} OK   shots ${tilde(OUT)}   report ${tilde(REPORT)}`);
process.exit(okCount === report.length ? 0 : 1);

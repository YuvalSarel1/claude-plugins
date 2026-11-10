#!/usr/bin/env node
// State-matrix prober. Loads every surface once per state, runs one probe per
// cell, and writes a JSON matrix plus a compact stderr table.
//
// A "state" is a URL variant (a licence tier, a feature-flag preview parameter,
// an impersonation query). A "surface" is a page (path plus an optional expect
// assertion). The matrix is surfaces x states, so a gating or flag change can be
// read as a shape, not as 12 separate page loads.
//
// usage: node tools/sweep.mjs <config.mjs> [out.json]     (default out: ./sweep.json)
//        CDP_PORT=9222   CDP port, same default as the shots driver
//
// Requires a debug Chrome, e.g. ./launch-chrome.sh (node >= 22 for the global WebSocket).
// By default the pool is new tabs, closed again at the end, and nothing else in the
// browser is touched. OWN_TABS=1 reuses tabs already on a job origin and CLOSES every
// other tab, which keeps a dedicated QA browser lean: only use it on a browser
// nobody is reading.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connect, CdpDown, errmsg } from './lib/cdp.mjs';

const die = (code, msg) => { console.error(msg); process.exit(code); };
const tilde = p => p.replace(process.env.HOME, '~');
const PORT = Number(process.env.CDP_PORT || 9222);
if (!Number.isInteger(PORT) || PORT < 1) die(2, `bad port: ${PORT}`);

// ---- config ----------------------------------------------------------------
const [cfgArg, outArg] = process.argv.slice(2);
if (!cfgArg) die(2, 'usage: node tools/sweep.mjs <config.mjs> [out.json]');

const CFG_PATH = resolve(process.cwd(), cfgArg);
let cfg;
try { cfg = (await import(pathToFileURL(CFG_PATH).href)).default; }
catch (e) { die(2, `cannot load config ${tilde(CFG_PATH)}\n  ${errmsg(e)}`); }
const OUT = resolve(process.cwd(), outArg || 'sweep.json');

const bad = m => die(2, 'config: ' + m);
if (!cfg || typeof cfg !== 'object') bad(`${tilde(CFG_PATH)} has no default export object`);
if (!cfg.base) bad('base is required, for example https://app.example.com');
if (!Array.isArray(cfg.states) || !cfg.states.length) bad('states must be a non-empty array');
if (!Array.isArray(cfg.surfaces) || !cfg.surfaces.length) bad('surfaces must be a non-empty array');

const BASE = cfg.base.replace(/\/$/, '');
// state: 'id' | { id, params } | { id, url(base, surface) }
const STATES = cfg.states.map(s => (typeof s === 'string' ? { id: s, params: {} } : { params: {}, ...s }));
const SURFACES = cfg.surfaces.map(s => ({ ...s }));
for (const s of STATES) if (!s.id) bad('every state needs an id');
for (const s of SURFACES) if (!s.id || !s.path) bad('every surface needs an id and a path');

const urlFor = (st, sf) => {
  if (typeof st.url === 'function') return st.url(BASE, sf);
  const u = new URL(sf.path, BASE + '/');
  for (const [k, v] of Object.entries({ ...st.params, ...sf.params })) u.searchParams.set(k, v);
  return u.href;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- probe ------------------------------------------------------------------
// The default probe: one round trip, one flat object, nothing product-specific.
// Override it with `probe: '<expr>'` or `probe: { replace: '<expr>' }`.
// Extend it with `probe: { extend: '<expr>' }` (the extension wins on key clash).
// Either expression may be async and must evaluate to a plain object.
const DEFAULT_PROBE = String.raw`(()=>{
  const T=(s,r)=>[...(r||document).querySelectorAll(s)];
  const tx=e=>(((e&&e.innerText)||'').replace(/\s+/g,' ')).trim();
  const uniq=(a,n)=>[...new Set(a.filter(Boolean))].slice(0,n);
  const body=document.body.innerText;
  const table=T('table').sort((a,b)=>b.querySelectorAll('tbody tr').length-a.querySelectorAll('tbody tr').length)[0];
  const columns=table?T('thead th',table).map(tx).filter(Boolean):[];
  const rows=table?T('tbody tr',table):[];
  let ti=columns.findIndex(h=>/type|kind|category/i.test(h));
  if(ti<0) ti=columns.length>1?1:0;
  const rowTypes={};
  rows.forEach(r=>{const c=T('td',r).map(tx); const k=((c[ti]||'').slice(0,40))||'?'; rowTypes[k]=(rowTypes[k]||0)+1;});
  const tabEls=T('[role=tab]');
  const sel=tabEls.find(e=>e.getAttribute('aria-selected')==='true');
  return {
    url: location.href,
    title: document.title,
    tabs: tabEls.map(tx),
    selectedTab: sel?tx(sel):null,
    columns,
    renderedRows: rows.length,
    rowTypeColumn: columns[ti]||null,
    rowTypes,
    buttons: uniq(T('button').map(tx),25),
    badges: uniq(T('[role=status],[class*="badge" i],[class*="chip" i],[class*="pill" i],[class*="tag" i]')
      .map(tx).filter(s=>s.length>0&&s.length<=32),25),
    banners: uniq(T('[role=alert],[class*="banner" i],[class*="alert" i],[class*="callout" i],[class*="notice" i]')
      .map(e=>tx(e).slice(0,160)),5),
    supportLinks: uniq(T('a[href]').map(a=>a.getAttribute('href'))
      .filter(h=>h&&/support|help|docs?\./i.test(h)),10),
    bodyLen: body.length
  };
})()`;

const pr = cfg.probe;
const MAIN = typeof pr === 'string' ? pr : (pr && pr.replace) || DEFAULT_PROBE;
const EXTEND = pr && typeof pr === 'object' ? pr.extend : null;

const reLit = r => {
  if (!r) return null;
  const src = r instanceof RegExp ? r.source : String(r);
  const flags = r instanceof RegExp ? r.flags : '';
  return `new RegExp(${JSON.stringify(src)},${JSON.stringify(flags)})`;
};
const reSrc = r => (r instanceof RegExp ? r.source : r == null ? null : String(r));

// expect gate and probe in one evaluate: a failed assertion never pays for a probe
const cellExpr = expect => `(async()=>{try{
  const t=document.body.innerText;
  ${expect ? `if(!${reLit(expect)}.test(t)) return {__expect:false,__sample:t.replace(/\\s+/g,' ').slice(0,140)};` : ''}
  const base=await (async()=>(${MAIN}))();
  ${EXTEND ? `const more=await (async()=>(${EXTEND}))(); return {__expect:true,...base,...more};` : 'return {__expect:true,...base};'}
}catch(e){return {__err:String((e&&e.message)||e)};}})()`;

// ---- settle -----------------------------------------------------------------
// Ready when the marker matches, or (no marker) when the page has tabs or real text.
const MARKER = reLit(cfg.settleMarker);
const SETTLE = `(()=>{const t=document.body.innerText;return{len:t.length,
  ready:${MARKER ? `${MARKER}.test(t)` : `document.querySelectorAll('[role=tab]').length>0||t.length>200`}};})()`;

// ---- driver -----------------------------------------------------------------
const JOBS = [];
for (const sf of SURFACES) for (const st of STATES)
  JOBS.push({ surface: sf.id, state: st.id, url: urlFor(st, sf), expect: sf.expect, expr: cellExpr(sf.expect) });

let c;
try { c = await connect({ port: PORT }); }
catch (e) { die(2, e instanceof CdpDown ? e.message : errmsg(e)); }
const settle = async sid => {
  let last = -1, stable = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(2500);
    const r = await c.ev(sid, SETTLE).catch(() => null);
    if (!r || r.__err) continue;
    if (r.ready && r.len === last) { stable++; if (stable >= 2) return true; } else stable = 0;
    last = r.len;
  }
  return false;
};

// Tab pool: new tabs, or with OWN_TABS=1 reuse open ones (job origin first), top up to `tabs`.
const orig = u => { try { return new URL(u).origin; } catch { return null; } };
const origins = new Set(JOBS.map(j => orig(j.url)).filter(Boolean));
const OWN = !!process.env.OWN_TABS;
const reusable = !OWN ? [] : (await c.pages())
  .filter(p => /^https?:/.test(p.url))
  .sort((a, b) => Number(origins.has(orig(b.url))) - Number(origins.has(orig(a.url))));

const workers = [];
const NW = Math.min(cfg.tabs || 4, Math.max(1, JOBS.length));
for (let i = 0; i < NW; i++) {
  const tid = reusable[i]?.targetId || (await c.send('Target.createTarget', { url: 'about:blank' })).targetId;
  workers.push({ tid, sid: await c.attach(tid) });
}
// OWN_TABS=1: a fixed pool, everything else closed, so no stray tab steals focus or memory
if (OWN) for (const p of await c.pages()) {
  if (!workers.some(w => w.tid === p.targetId)) await c.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
}
console.error(`${workers.length} tabs${OWN ? ', closed the rest' : ''}: ${SURFACES.length} surfaces x ${STATES.length} states = ${JOBS.length} cells`);

const cells = {};
const run = async (w, list) => {
  for (const j of list) {
    const key = `${j.surface}@${j.state}`;
    const cell = { surface: j.surface, state: j.state, url: j.url, settled: false,
      expect: { pattern: reSrc(j.expect), ok: j.expect ? null : true }, valid: false, status: 'error' };
    // one dead cell must not cost the whole matrix
    try {
      await c.send('Page.navigate', { url: j.url }, w.sid);
      cell.settled = await settle(w.sid);
      await sleep(1200);
      const r = await c.ev(w.sid, j.expr).catch(e => ({ __err: errmsg(e) }));
      if (!r || r.__err) {
        cell.reason = String((r && r.__err) || 'no result').slice(0, 200);
      } else if (r.__expect === false) {
        cell.status = 'invalid';
        cell.expect.ok = false;
        cell.reason = `body does not match /${reSrc(j.expect)}/, saw: ${r.__sample}`;
      } else {
        const { __expect, __sample, ...probe } = r;
        cell.status = 'ok'; cell.valid = true; cell.expect.ok = true; cell.probe = probe;
      }
    } catch (e) {
      cell.reason = errmsg(e).slice(0, 200);
    }
    cells[key] = cell;
    console.error(`${cell.status.padEnd(7)} ${cell.settled ? '     ' : 'PART '} ${key}${cell.reason ? '  ' + cell.reason.slice(0, 90) : ''}`);
  }
};
const chunks = Array.from({ length: workers.length }, () => []);
JOBS.forEach((j, i) => chunks[i % workers.length].push(j));
await Promise.all(workers.map((w, i) => run(w, chunks[i])));

// ---- output -----------------------------------------------------------------
const out = { base: BASE, config: CFG_PATH, ranAt: new Date().toISOString(),
  states: STATES.map(s => s.id), surfaces: SURFACES.map(s => s.id), cells };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));

// Compact matrix, one line per surface-state, so the shape is readable without
// opening the JSON. Booleans print as bare flags, arrays and maps as counts.
const summarise = o => Object.entries(o)
  .filter(([k]) => !['url', 'title'].includes(k))
  .map(([k, v]) => {
    if (typeof v === 'number') return `${k}=${v}`;
    if (typeof v === 'boolean') return v ? k : '';
    if (Array.isArray(v)) return `${k}=${v.length}`;
    if (v && typeof v === 'object') return `${k}=${Object.keys(v).length}`;
    if (typeof v === 'string' && v) return `${k}="${v.slice(0, 18)}"`;
    return '';
  }).filter(Boolean).join(' ').slice(0, 150);

const wS = Math.max(...SURFACES.map(s => s.id.length));
const wT = Math.max(...STATES.map(s => s.id.length));
console.error(`\nmatrix  ${BASE}  (${tilde(OUT)})`);
for (const sf of SURFACES) for (const st of STATES) {
  const cl = cells[`${sf.id}@${st.id}`];
  if (!cl) continue;
  const body = cl.status === 'ok' ? summarise(cl.probe) : cl.reason || '';
  console.error(`${cl.status.padEnd(7)} ${sf.id.padEnd(wS)}  ${st.id.padEnd(wT)}  ${(cl.settled ? 'settled' : 'PARTIAL').padEnd(7)}  ${body}`);
}
if (!OWN) for (const w of workers) await c.send('Target.closeTarget', { targetId: w.tid }).catch(() => {});
const notValid = Object.values(cells).filter(c => c.status !== 'ok').length;
console.error(`${Object.keys(cells).length} cells, ${notValid} not valid, ${tilde(OUT)}`);
process.exit(0);

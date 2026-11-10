#!/usr/bin/env node
// Build a self-contained QA review page from a findings JSON file.
//
//   node tools/review.mjs <findings.json> [-o out.html]
//
// Output is one HTML file with no network calls. Put the screenshots in a
// shots/ directory next to it and it works from file://.
//
// findings.json
//   title       string, page and report heading
//   subtitle    string, one line under the title, inline <b> <i> <em> <code> <br> allowed
//   storageKey  string, localStorage key for ticks and notes, unique per review
//   categories  optional, defaults to the four below
//               { id, label, sub, order, tick }
//               sub is the membership test, printed in the group header
//               tick:false means no checkbox and no progress weight
//   items       [{ category, area, title, evidence, shots:[], links:[[label,url]] }]
//               evidence takes the same inline tags as subtitle
//               shots are file names inside shots/, either "name.png" or
//               { file, caption }. A caption is required by rules/screenshots.md,
//               and a bare string falls back to the file name as its caption.
//               links are [label, url] pairs
//
// Nothing from the data is trusted: the JSON is embedded with <, > and & escaped
// so it cannot end the script block, and the page escapes every value again
// before it reaches the DOM.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '../templates/review.template.html');

// The four categories that survived review. sub is the membership test, and the
// four strings below are copied verbatim from rules/taxonomy.md, which
// owns them. Change the rule file first, then these, then findings.example.json.
const DEFAULT_CATEGORIES = [
  { id: 'fix', label: 'Fix', order: 1, tick: true,
    sub: 'The behaviour is wrong and the change can be named: one condition, one map entry, one CSS property, one missing check' },
  { id: 'unproven', label: 'Unproven', order: 2, tick: true,
    sub: 'There is no verdict and the blocker is an environment that does not exist yet, not more time at the keyboard' },
  { id: 'verified', label: 'Verified', order: 3, tick: true,
    sub: 'The gate could have failed and a measurement exists that would have caught the failure' },
  { id: 'context', label: 'Known, not filed', order: 4, tick: false,
    sub: 'Already decided or understood outside the review, or an artefact of the test rig. No checkbox, no progress weight' },
];

function die(msg) {
  process.stderr.write('review.mjs: ' + msg + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const rest = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') return { help: true };
    else rest.push(argv[i]);
  }
  return { src: rest[0], out, help: false };
}

// JSON safe to sit inside a <script> block. Apostrophes and quotes are already
// handled by JSON.stringify; these five characters are the ones that are not.
const embed = (o) =>
  JSON.stringify(o).replace(/[<>&\u2028\u2029]/g, (c) => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026',
    '\u2028': '\\u2028', '\u2029': '\\u2029',
  }[c]));

const comment = (s) => String(s).replace(/--+/g, '-').replace(/[<>]/g, '');

function normalise(data, srcPath) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) die('findings must be a JSON object');
  const title = data.title;
  if (typeof title !== 'string' || !title.trim()) die('title is required');
  const storageKey = data.storageKey;
  if (typeof storageKey !== 'string' || !storageKey.trim()) die('storageKey is required');

  let categories = Array.isArray(data.categories) && data.categories.length
    ? data.categories
    : DEFAULT_CATEGORIES;
  categories = categories.map((c, n) => {
    if (!c || typeof c.id !== 'string' || !c.id) die(`categories[${n}] needs an id`);
    return {
      id: c.id,
      label: typeof c.label === 'string' && c.label ? c.label : c.id,
      sub: typeof c.sub === 'string' ? c.sub : '',
      order: Number.isFinite(c.order) ? c.order : n + 1,
      tick: c.tick !== false,
      ...(c.color ? { color: String(c.color) } : {}),
      ...(c.groupByArea === undefined ? {} : { groupByArea: c.groupByArea === true }),
      ...(c.report ? { report: String(c.report) } : {}),
    };
  });
  const ids = new Set(categories.map((c) => c.id));
  if (ids.size !== categories.length) die('duplicate category id');

  const items = Array.isArray(data.items) ? data.items : die('items must be an array');
  const seen = new Set();
  const out = items.map((it, n) => {
    if (!it || typeof it !== 'object') die(`items[${n}] must be an object`);
    if (!ids.has(it.category)) die(`items[${n}] has unknown category ${JSON.stringify(it.category)}`);
    if (typeof it.title !== 'string' || !it.title.trim()) die(`items[${n}] needs a title`);
    const key = it.category + '|' + (it.area || '') + '|' + it.title;
    if (seen.has(key)) die(`two rows share category, area and title, so they would share one tick: ${key}`);
    seen.add(key);
    const links = (it.links || []).map((l, m) => {
      if (!Array.isArray(l) || l.length < 2) die(`items[${n}].links[${m}] must be [label, url]`);
      return [String(l[0]), String(l[1])];
    });
    return {
      category: it.category,
      area: typeof it.area === 'string' ? it.area : '',
      title: it.title,
      evidence: typeof it.evidence === 'string' ? it.evidence : '',
      shots: (it.shots || []).map((s, m) => {
        if (typeof s === 'string') return { file: s, caption: '' };
        if (!s || typeof s !== 'object' || typeof s.file !== 'string' || !s.file) {
          die(`items[${n}].shots[${m}] must be a file name or { file, caption }`);
        }
        return { file: s.file, caption: typeof s.caption === 'string' ? s.caption : '' };
      }),
      links,
    };
  });

  return {
    title,
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
    storageKey,
    categories,
    items: out,
    source: srcPath,
  };
}

function main() {
  const { src, out, help } = parseArgs(process.argv.slice(2));
  if (help || !src) {
    process.stdout.write('usage: node tools/review.mjs <findings.json> [-o out.html]\n');
    process.exit(help ? 0 : 1);
  }
  const srcPath = resolve(process.cwd(), src);
  if (!existsSync(srcPath)) die(`no such file: ${srcPath}`);
  if (!existsSync(TEMPLATE)) die(`missing template: ${TEMPLATE}`);

  let raw;
  try { raw = JSON.parse(readFileSync(srcPath, 'utf8')); }
  catch (e) { die(`${src} is not valid JSON: ${e.message}`); }

  const data = normalise(raw, src);
  const outPath = out ? resolve(process.cwd(), out) : join(dirname(srcPath), 'review.html');

  // The membership tests travel with the page, so the next reader can sort rows
  // without going back to the generator.
  const doc = [
    '<!--',
    '  Generated by tools/review.mjs. Edit the findings JSON and rebuild, not this file.',
    '  Category membership tests:',
    ...data.categories.map((c) => `    ${comment(c.id)}${c.tick ? '' : ' (no tick)'}: ${comment(c.sub || 'no test recorded')}`),
    '  A row belongs to the first category whose test it passes.',
    '-->',
  ].join('\n');

  // Replacements are functions, so a $ or $& in a title cannot rewrite the output.
  const html = readFileSync(TEMPLATE, 'utf8')
    .replace('{{TITLE}}', () => data.title.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])))
    .replace('{{DOC}}', () => doc)
    .replace('{{DATA}}', () => embed({
      title: data.title,
      subtitle: data.subtitle,
      storageKey: data.storageKey,
      categories: data.categories,
      items: data.items,
    }));

  if (/\{\{(TITLE|DOC|DATA)\}\}/.test(html)) die('template placeholder left unfilled');
  writeFileSync(outPath, html);

  // Missing screenshots are a warning, not a failure: the page still opens.
  const shotDir = join(dirname(outPath), 'shots');
  const missing = [...new Set(data.items.flatMap((i) => i.shots.map((s) => s.file)))]
    .filter((f) => !existsSync(join(shotDir, f)));
  const uncaptioned = data.items.flatMap((i) => i.shots).filter((s) => !s.caption.trim());
  if (missing.length) {
    process.stderr.write(`warning: ${missing.length} shot(s) not found in ${shotDir}\n`);
    missing.slice(0, 10).forEach((f) => process.stderr.write('  ' + f + '\n'));
  }
  if (uncaptioned.length) {
    process.stderr.write(`warning: ${uncaptioned.length} shot(s) have no caption, the file name is showing instead\n`);
    uncaptioned.slice(0, 10).forEach((s) => process.stderr.write('  ' + s.file + '\n'));
  }

  const tickable = data.items.filter((i) => data.categories.find((c) => c.id === i.category).tick).length;
  process.stdout.write(`${outPath}\n${data.items.length} rows, ${tickable} tickable, ${data.categories.length} categories\n`);
}

main();

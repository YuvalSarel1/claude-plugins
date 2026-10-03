// Checks fleet against the real agents view: draws `claude agents` in a scratch tmux,
// reads its rows, and compares them with what fleet's own logic makes of
// `claude agents --json --all` and the job files. Run it after a Claude Code update:
//
//   bun assets/compare.ts            # from the folder whose view you want compared
//
// It reads your sessions and starts nothing but the view itself. Exit 1 on a difference.
import { execFileSync } from 'child_process'
import { readFileSync, statSync } from 'fs'
import { plugin } from 'bun'

// register.tsx draws with JSX that only Claude Code runs; its runtime stays a stub here.
plugin({ name: 'jsx stub', setup: b => void b.module('react/jsx-dev-runtime', () => ({ exports: { jsxDEV: () => null, Fragment: null }, loader: 'object' })) })
const { age, groups, launchDir, repoRoot, toRows } = await import('../plugins/fleet/hooks/register.tsx')

const home = process.env.HOME!
const config = process.env.CLAUDE_CONFIG_DIR ?? `${home}/.claude`
const claude = process.env.CLAUDE_BIN ?? `${home}/.local/bin/claude`
const socket = `fleet-compare-${process.pid}`
const tmux = (...args: string[]) => execFileSync('tmux', ['-L', socket, ...args]).toString()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// The view, wide enough that names and ages are never clipped.
tmux('-f', '/dev/null', 'new-session', '-d', '-x', '220', '-y', '80', '-c', process.cwd(), claude, 'agents')
let screen = ''
try {
  for (let i = 0; i < 40 && !/awaiting input · /.test(screen); i++) {
    await sleep(250)
    screen = tmux('capture-pane', '-p')
  }
  await sleep(1000)
  screen = tmux('capture-pane', '-p')
} finally {
  execFileSync('tmux', ['-L', socket, 'kill-server'])
}
const capturedAt = Date.now()

// Fleet's reading of the same moment.
const agents = JSON.parse(execFileSync(claude, ['agents', '--json', '--all']).toString())
const jobs: Record<string, any> = {}
for (const a of agents) {
  try { jobs[a.id] = JSON.parse(readFileSync(`${config}/jobs/${a.id}/state.json`, 'utf8')) } catch {}
}
const read = async (p: string) => { try { return readFileSync(p, 'utf8') } catch { return null } }
const isDir = async (p: string) => { try { return statSync(p).isDirectory() } catch { return null } }
const rows = toRows(agents, jobs)
for (const r of rows) r.group = (await repoRoot(r.group, read, isDir)) ?? r.group
const here = (await repoRoot(launchDir(undefined, process.cwd()), read, isDir)) ?? process.cwd()

const WORDS: Record<string, string> = { blocked: 'Needs input', working: 'Working', idle: 'Idle', done: 'Done', failed: 'Failed', stopped: 'Stopped' }
const SPIN = '·✢✳✶✻✽'
const glyph = (g: string, working: boolean) => (working && SPIN.includes(g) ? 'spinner' : g)
const want: string[] = []
for (const g of groups(rows, here, home)) {
  want.push(g.dir)
  for (const r of g.rows) {
    want.push([glyph(r.icon || '✻', r.state === 'working'), r.name, WORDS[r.state], age(r, capturedAt)].join(' | '))
  }
}

// The view's rows: folder headers, then `<glyph> <name>  <Word>[ · line]  <age>`.
const ROW = new RegExp(`^.?\\s?(\\S) (.+?)\\s{2,}(${Object.values(WORDS).join('|')})(?: · .*?)?\\s+(\\d+[smhd])\\s*$`)
const got: string[] = []
const lines = screen.split('\n')
const start = lines.findIndex(l => /awaiting input · /.test(l)) + 1
for (const l of lines.slice(start)) {
  if (/^[~/]\S*\s*$/.test(l)) got.push(l.trim())
  const m = l.match(ROW)
  if (m) got.push([glyph(m[1]!, m[3] === 'Working'), m[2]!.trim(), m[3], m[4]].join(' | '))
  if (/^─/.test(l)) break
}

// An age can tick over between the two readings, so ages one step apart in the same unit pass.
const near = (x = '', y = '') => x.slice(-1) === y.slice(-1) && Math.abs(parseInt(x) - parseInt(y)) <= 1
const same = (a: string, b: string) => {
  const [x, y] = [a.split(' | '), b.split(' | ')]
  return a === b || (x.slice(0, 3).join() === y.slice(0, 3).join() && near(x[3], y[3]))
}
let differ = want.length !== got.length
for (let i = 0; i < Math.max(want.length, got.length); i++) {
  const ok = want[i] !== undefined && got[i] !== undefined && same(want[i]!, got[i]!)
  if (!ok) differ = true
  console.log(`${ok ? ' ' : '✗'} fleet: ${want[i] ?? '—'}\n${ok ? ' ' : '✗'} view:  ${got[i] ?? '—'}`)
}
console.log(differ ? '\nfleet differs from the agents view' : `\nfleet matches the agents view (${rows.length} sessions)`)
process.exit(differ ? 1 : 0)

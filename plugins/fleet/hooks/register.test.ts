import { test, expect } from 'claude-code/testing'

import { EXTRAS, age, cell, clip, counts, detail, groups, icon, label, launchDir, nameWidth, repoRoot, settle, spin, toRows, viewState } from './register'

test('rows come from claude agents, oldest first, with the job line and the view folder order', () => {
  const agents = [
    { id: 'd', name: 'mod', cwd: '/h/cones', state: 'working', startedAt: 4, pid: 1, status: 'busy' },
    { id: 'a', name: 'old ask', cwd: '/h/cones', state: 'blocked', startedAt: 1, pid: 2 },
    { id: 'b', name: 'b', cwd: '/h/trip', state: 'blocked', startedAt: 2, pid: 3 },
    { id: 'c', name: 'sync', cwd: '/h/a-work', state: 'done', startedAt: 3 },
  ]
  const jobs = {
    a: { detail: 'say go', createdAt: '2026-10-01T00:00:00Z' },
    c: { state: 'done', tempo: 'idle', detail: 'short', output: { result: 'published' } },
  }
  const rows = toRows(agents, jobs)
  expect(rows.map(r => [r.name, r.detail])).toEqual([
    ['new session', ''], ['sync', 'published'], ['mod', ''], ['old ask', 'say go'],
  ])
  // Folders sort by their full path, not as written with ~.
  expect(groups(rows, '/h/cones', '/h').map(g => [g.dir, g.rows.map(r => r.id)])).toEqual([
    ['~/cones', ['d', 'a']], ['~/a-work', ['c']], ['~/trip', ['b']],
  ])
})

test('ages are how long a job ran: to its first finish, or until now', () => {
  const t = Date.parse('2026-09-22T07:46:09.907Z')
  // Two sessions from the live machine on 2026-10-03: the view showed 1m and 1h.
  const [short, long] = toRows([
    { id: 'x', name: 'n', cwd: '/', status: 'idle', pid: 1 },
    { id: 'y', name: 'n', cwd: '/' },
  ], {
    x: { state: 'done', tempo: 'idle', createdAt: '2026-09-22T07:46:09.907Z', firstTerminalAt: '2026-09-22T07:47:24.048Z', updatedAt: '2026-10-03T12:39:46.411Z' },
    y: { state: 'done', tempo: 'idle', createdAt: '2026-09-22T12:54:25.215Z', firstTerminalAt: '2026-09-22T14:28:41.530Z' },
  })
  expect([age(short!, Date.now()), age(long!, Date.now())]).toEqual(['1m', '1h'])
  expect([short!.icon, long!.icon]).toEqual(['✻', '∙'])
  const at = (ms: number) => age({ start: t, end: null }, t + ms)
  expect([at(59_000), at(9 * 60_000), at(2 * 3600_000), at(11 * 86400_000)]).toEqual(['59s', '9m', '2h', '11d'])
  // Seconds round, so 59m 59.6s is an hour, as the view's duration reads.
  expect(at(3_599_600)).toBe('1h')
})

test('names are the session name, else the first three words of its request', () => {
  expect(label({ name: 'tool hooks\nperformance' }, 'f')).toBe('tool hooks performance')
  expect(label({ intent: 'retry delay should back off' }, 'f')).toBe('retry delay should…')
  expect(label({ intent: 'supercalifragilistic expialidocious' }, 'f')).toBe('supercalifragilistic exp…')
  expect(label({}, 'new session')).toBe('new session')
})

test('a dead job is shown failed, or blocked if it was waiting, as the view settles it', () => {
  const old = '2026-10-01T00:00:00Z'
  expect(settle({ state: 'working', tempo: 'active', createdAt: old, detail: 'x; respawning' }, false, Date.now()))
    .toMatchObject({ state: 'failed', tempo: 'idle', detail: 'x' })
  expect(settle({ state: 'blocked', tempo: 'idle', createdAt: old, respawnFlags: [] }, false, Date.now())).toMatchObject({ tempo: 'blocked' })
  expect(settle({ state: 'working', createdAt: old }, true, Date.now()).state).toBe('working')
  expect(settle({ state: 'working', createdAt: new Date().toISOString() }, false, Date.now()).state).toBe('working')
})

test('the line is one line: notices and tags out, a bare link result falls back to the progress', () => {
  expect(detail({ state: 'working', detail: 'a\n<system-reminder>x</system-reminder>  b' })).toBe('a b')
  expect(detail({ state: 'done', detail: 'opened PR', output: { result: 'https://x/pr/1' } })).toBe('opened PR')
})

test('clip keeps a name to its column with an ellipsis', () => {
  expect(clip('session not working discrepancy', 12)).toBe('session not…')
  expect(clip('short', 12)).toBe('short')
})

test('names shrink before the status drops below its minimum', () => {
  const names = ['session not working discrepancy'] // 31
  expect(nameWidth(names, 80, 20, 0)).toBe(31) // room 49
  expect(nameWidth(['ab'], 80, 20, 0)).toBe(12) // the view's column is at least 12
  expect(nameWidth(['x'.repeat(60)], 150, 20, 0)).toBe(50) // and at most 40 or a third
  expect(nameWidth(names, 62, 20, 0)).toBe(31) // room 31
  expect(nameWidth(names, 52, 20, 0)).toBe(21) // room 21
  expect(nameWidth(names, 52, 20, 11)).toBe(10) // a model column takes 11
  expect(nameWidth(names, 20, 20, 0)).toBe(4) // never below 4
})

test('extra columns read the job: model and effort from its flags, tokens in thousands', () => {
  const [row] = toRows(
    [{ id: 'a', name: 'n', cwd: '/', state: 'working', kind: 'background' }],
    { a: { respawnFlags: ['--effort', 'medium', '--model', 'opus[1m]'], tokens: 32893, fan: [1, 2, 3], intent: 'fix it' } },
  )
  expect(EXTRAS.slice(0, 6).map(x => x.cell(row!))).toEqual(['opus[1m]', 'medium', '32.9k', '3', 'bg', 'fix it'])
})

test('cones columns read the statusLine report and ps, formatted as cones does', () => {
  const agents = [
    { id: 'a', sessionId: 'sa', pid: 7, name: 'n', cwd: '/', state: 'working' },
    { id: 'b', sessionId: 'sb', name: 'gone', cwd: '/', state: 'done' },
  ]
  const reports = {
    sa: {
      context_window: { context_window_size: 1_000_000, current_usage: { input_tokens: 2, cache_creation_input_tokens: 1198, cache_read_input_tokens: 164430 } },
      cost: { total_cost_usd: 3.9634 },
    },
  }
  const [live, done] = toRows(agents, {}, reports, { 7: { cpu: 12.6, rss: 512 * 1_048_576 } })
  const cones = EXTRAS.slice(6)
  expect(cones.map(x => x.cell(live!))).toEqual(['165k/1.0M', '$3.96', '13%', '512M'])
  expect(cones.map(x => x.cell(done!))).toEqual(['-', '-', '-', '-'])
})

test('the working spinner runs its frames there and back', () => {
  expect(spin(['·', '✢', '✳']).join('')).toBe('·✢✳✳✢·')
})

test('states follow the agents view, not the json state', () => {
  // Each case is a session from the live machine on 2026-10-03, json state in the comment.
  expect(viewState({ state: 'working', tempo: 'idle' }, 'idle')).toBe('idle') // json: working
  expect(viewState({ state: 'blocked', tempo: 'active' }, 'busy')).toBe('working') // json: working
  expect(viewState({ state: 'working', tempo: 'idle' }, 'busy')).toBe('working')
  expect(viewState({ state: 'blocked', tempo: 'blocked' }, undefined)).toBe('blocked')
  expect(viewState({ state: 'done', tempo: 'idle' }, undefined)).toBe('done')
  expect(viewState({}, 'waiting')).toBe('blocked')
  // A recurring job that finished a run is waiting for the next one, not done.
  expect(viewState({ state: 'done', tempo: 'idle', intent: '/loop 5m check' }, undefined)).toBe('idle')
  expect(viewState({ state: 'done', tempo: 'active' }, 'busy')).toBe('working')
  expect([icon({ state: 'done', tempo: 'idle', intent: '/loop x' }, 'idle'), icon({}, 'busy')]).toEqual(['✢', ''])
})

test('a waiting job shows its question, as the view does', () => {
  const [row] = toRows([{ id: 'a', name: 'n', cwd: '/', state: 'blocked' }], {
    a: { state: 'blocked', tempo: 'blocked', detail: 'awaiting go-ahead', needs: "Say go and I'll do it" },
  })
  expect([row!.state, row!.detail]).toEqual(['blocked', "Say go and I'll do it"])
})

test('the header counts as the view does: idle is working, every finish is completed', () => {
  const row = (state: string) => ({ state }) as any
  expect(counts(['blocked', 'blocked', 'working', 'working', 'working', 'idle', 'done', 'done', 'failed'].map(row)))
    .toBe('2 awaiting input · 4 working · 3 completed')
})

test('a spinner cell packs one glyph, gray on the default background', () => {
  const words = new Uint32Array(Uint8Array.from(atob(cell('✻')), c => c.charCodeAt(0)).buffer)
  expect([...words]).toEqual([0x273b, 0x949494, 0x01000000])
})

test('worktree sessions are filed under the repository they were launched from', async () => {
  expect(launchDir(undefined, '/h/cones/.claude/worktrees/fix-x')).toBe('/h/cones')
  expect(launchDir(undefined, '/h/cones/.claude/worktrees/fix-x/src')).toBe('/h/cones')
  expect(launchDir('/h/origin', '/h/cones/.claude/worktrees/fix-x')).toBe('/h/origin')
  expect(launchDir(undefined, '/h/cones')).toBe('/h/cones')
  // A subfolder joins its repository; a linked worktree elsewhere joins its main checkout.
  const files: Record<string, string> = { '/h/wt/.git': 'gitdir: /h/cones/.git/worktrees/wt\n' }
  const dirs = new Set(['/h/cones/.git'])
  const read = async (p: string) => files[p] ?? null
  const isDir = async (p: string) => (dirs.has(p) ? true : p in files ? false : null)
  expect(await repoRoot('/h/cones/src/deep', read, isDir)).toBe('/h/cones')
  expect(await repoRoot('/h/wt/src', read, isDir)).toBe('/h/cones')
  expect(await repoRoot('/h/plain', read, isDir)).toBe(null)
})

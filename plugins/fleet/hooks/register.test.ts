import { test, expect } from 'claude-code/testing'

import { EXTRAS, ago, cell, clip, counts, groups, nameWidth, spin, toRows, viewState } from './register'

test('rows come from claude agents, with the job line and the view folder order', () => {
  const agents = [
    { id: 'a', name: 'old ask', cwd: '/h/cones', state: 'blocked', startedAt: 1 },
    { id: 'b', name: 'b', cwd: '/h/trip', state: 'blocked', startedAt: 2 },
    { id: 'c', name: 'sync', cwd: '/h/a-work', state: 'done', startedAt: 3 },
    { id: 'd', name: 'mod', cwd: '/h/cones', state: 'working', startedAt: 4 },
  ]
  const jobs = {
    a: { detail: 'say go', createdAt: '2026-10-01T00:00:00Z' },
    c: { state: 'done', detail: 'short', output: { result: 'published' } },
  }
  const rows = toRows(agents, jobs)
  expect(rows.map(r => [r.name, r.detail])).toEqual([
    ['old ask', 'say go'], ['new session', ''], ['sync', 'published'], ['mod', ''],
  ])
  expect(rows[0]!.since).toBe(Date.parse('2026-10-01T00:00:00Z'))
  expect(groups(rows, '/h/cones', '/h').map(g => [g.dir, g.rows.map(r => r.id)])).toEqual([
    ['~/cones', ['a', 'd']], ['~/a-work', ['c']], ['~/trip', ['b']],
  ])
  expect([ago(59_000), ago(9 * 60_000), ago(2 * 3600_000), ago(11 * 86400_000)]).toEqual(['59s', '9m', '2h', '11d'])
})

test('clip keeps a name to its column with an ellipsis', () => {
  expect(clip('session not working discrepancy', 12)).toBe('session not…')
  expect(clip('short', 12)).toBe('short')
})

test('names shrink before the status drops below its minimum', () => {
  const names = ['session not working discrepancy'] // 31
  expect(nameWidth(names, 80, 20, 0)).toBe(31) // room 49
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

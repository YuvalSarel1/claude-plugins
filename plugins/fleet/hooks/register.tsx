import type { Register } from 'claude-code'

export type Row = {
  id: string; name: string; cwd: string; group: string; state: string; detail: string; since: number
  model: string; effort: string; tokens: number | null; tasks: number | null; kind: string; prompt: string
  cpu: number | null; rss: number | null; cost: number | null; contextTokens: number | null; contextWindow: number | null
}

const PANE = 'fleet'

// Claude Code's spinner: these frames there and back, one per 120 ms (Ghostty's set ends on ✻ twice).
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽']
const GHOSTTY = ['·', '✢', '✳', '✶', '✻', '✻']
export const spin = (frames: string[]) => [...frames, ...[...frames].reverse()]

// One spinner cell as a Raster's cells: code point, gray foreground, default background.
export function cell(glyph: string) {
  const words = Uint32Array.of(glyph.codePointAt(0)!, 0x949494, 0x01000000)
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

// Glyphs, words and 256-colour indexes as `claude agents` draws them (220, 114, 246).
const GRAY_DIM = '#6c6c6c'
const LOOK: Record<string, { icon: string; word: string; color?: string }> = {
  blocked: { icon: '✻', word: 'Needs input', color: '#ffd700' },
  working: { icon: '✶', word: 'Working' },
  done: { icon: '∙', word: 'Done', color: '#87d787' },
  idle: { icon: '✻', word: 'Idle', color: GRAY_DIM },
  failed: { icon: '∙', word: 'Failed', color: '#ff6b80' },
  stopped: { icon: '∙', word: 'Stopped', color: GRAY_DIM },
}
const GRAY = '#949494'

// The word the agents view shows, by its own rule: a finished job first, then the live
// process (busy or shell is working), then a job or process waiting on the person, else idle.
// `claude agents --json` reports `working` for an idle live session, so its `state` is not used.
export function viewState(job: any, status: string | undefined) {
  if (job.state === 'done') return 'done'
  if (job.state === 'failed') return 'failed'
  if (job.state === 'stopped' || job.state === 'killed') return 'stopped'
  if (status === 'busy' || status === 'shell') return 'working'
  if (job.tempo === 'blocked' || status === 'waiting') return 'blocked'
  return 'idle'
}

export type Usage = { cpu: number; rss: number }

// `claude agents --json --all` is the list and its states; the job's state.json adds
// the line and age the view shows beside each row. The cones columns read what cones
// reads: the statusLine's saved report per session, and `ps` per pid.
export function toRows(
  agents: any[],
  jobs: Record<string, any>,
  reports: Record<string, any> = {},
  usage: Record<number, Usage> = {},
): Row[] {
  return agents.map(a => {
    const job = jobs[a.id] ?? {}
    const report = reports[a.sessionId] ?? {}
    const now = report.context_window?.current_usage
    const state = viewState(job, a.status)
    return {
      id: a.id,
      name: a.name && a.name !== a.id ? a.name : 'new session',
      cwd: a.cwd ?? '',
      group: launchDir(job.originCwd, a.cwd ?? ''),
      state,
      // The view's line: a finished job's result, a waiting job's question, else its progress.
      detail: (state === 'done' && job.output?.result) || (state === 'blocked' && job.needs) || job.detail || '',
      since: Date.parse(job.createdAt ?? '') || a.startedAt || 0,
      model: flag(job.respawnFlags, '--model'),
      effort: flag(job.respawnFlags, '--effort'),
      tokens: typeof job.tokens === 'number' ? job.tokens : null,
      tasks: Array.isArray(job.fan) ? job.fan.length : null,
      kind: a.kind === 'background' ? 'bg' : a.kind ?? '',
      prompt: job.intent ?? '',
      cpu: usage[a.pid]?.cpu ?? null,
      rss: usage[a.pid]?.rss ?? null,
      cost: typeof report.cost?.total_cost_usd === 'number' ? report.cost.total_cost_usd : null,
      contextTokens: now ? (now.input_tokens ?? 0) + (now.cache_creation_input_tokens ?? 0) + (now.cache_read_input_tokens ?? 0) : null,
      contextWindow: report.context_window?.context_window_size ?? null,
    }
  })
}

function flag(flags: unknown, name: string) {
  const i = Array.isArray(flags) ? flags.indexOf(name) : -1
  return i >= 0 ? String((flags as unknown[])[i + 1] ?? '') : ''
}

// Optional columns after the status, off by default so the row reads as `claude agents` does.
export const EXTRAS = [
  { option: 'showModel', width: 10, cell: (r: Row) => r.model },
  { option: 'showEffort', width: 6, cell: (r: Row) => r.effort },
  { option: 'showTokens', width: 6, cell: (r: Row) => (r.tokens === null ? '' : r.tokens < 1000 ? `${r.tokens}` : `${(r.tokens / 1000).toFixed(1)}k`) },
  { option: 'showTasks', width: 3, cell: (r: Row) => (r.tasks ? `${r.tasks}` : '') },
  { option: 'showKind', width: 3, cell: (r: Row) => r.kind },
  { option: 'showPrompt', width: 24, cell: (r: Row) => r.prompt },
  // As cones formats them (fleet.rs `cost`, `context_values`, `bytes`).
  { option: 'showContext', width: 10, cell: (r: Row) => (r.contextTokens === null ? '-' : r.contextWindow ? `${short(r.contextTokens)}/${short(r.contextWindow)}` : short(r.contextTokens)) },
  { option: 'showCost', width: 7, cell: (r: Row) => (r.cost === null ? '-' : r.cost < 0.01 ? `$${r.cost.toFixed(4)}` : `$${r.cost.toFixed(2)}`) },
  { option: 'showCpu', width: 4, cell: (r: Row) => (r.cpu === null ? '-' : `${Math.round(r.cpu)}%`) },
  { option: 'showMemory', width: 5, cell: (r: Row) => (r.rss === null ? '-' : bytes(r.rss)) },
] as const

function short(n: number) {
  return n < 1000 ? `${n}` : n < 1_000_000 ? `${Math.floor(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`
}

function bytes(n: number) {
  return n < 1_048_576 ? `${Math.floor(n / 1024)}K` : n < 1_073_741_824 ? `${Math.floor(n / 1_048_576)}M` : `${(n / 1_073_741_824).toFixed(1)}G`
}

// The name column: as wide as the longest name, less whatever the status needs to keep
// `statusMin` columns; the view's margin of one each side, icon 2, gap 2, age 5,
// and one space before each extra.
export function nameWidth(names: string[], body: number, statusMin: number, extras: number) {
  const room = body - 2 - 2 - 2 - 5 - extras - statusMin
  return Math.max(4, Math.min(Math.max(0, ...names.map(n => n.length)), room))
}

// The folder a session is filed under, as the agents view files it: where it was
// launched, so a session in `<repo>/.claude/worktrees/<name>` sits with `<repo>`.
export function launchDir(origin: string | undefined, cwd: string) {
  return origin || (cwd.match(/^(.+?)[/\\]\.claude[/\\]worktrees[/\\]/)?.[1] ?? cwd)
}

// Then, as the view does, the main checkout of the git repository that folder is in:
// a subfolder joins its repository's root, and a linked worktree its main checkout.
// Read from `.git` itself, no git process; ponytail: no cache eviction, a few dozen folders.
export async function repoRoot(dir: string, read: (path: string) => Promise<string | null>, isDir: (path: string) => Promise<boolean | null>) {
  for (let d = dir; d && d !== '/'; d = d.slice(0, d.lastIndexOf('/')) || '/') {
    const kind = await isDir(`${d}/.git`)
    if (kind === true) return d
    if (kind === false) {
      const pointer = (await read(`${d}/.git`))?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim() ?? ''
      return pointer.includes('/.git/worktrees/') ? pointer.split('/.git/worktrees/')[0]! : d
    }
  }
  return null
}

// Groups by folder, this session's own first, the rest by path; rows keep the CLI's order.
export function groups(list: Row[], here: string, home: string) {
  const tilde = (p: string) => (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p)
  const by = new Map<string, Row[]>()
  for (const r of list) by.set(r.group, [...(by.get(r.group) ?? []), r])
  return [...by]
    .sort(([a], [b]) => (a === here ? -1 : b === here ? 1 : tilde(a).localeCompare(tilde(b))))
    .map(([cwd, rs]) => ({ dir: tilde(cwd), rows: rs }))
}

// The header's count line, as the view words it: idle sessions count as working.
export function counts(list: Row[]) {
  const n = (...states: string[]) => list.filter(r => states.includes(r.state)).length
  return `${n('blocked')} awaiting input · ${n('working', 'idle')} working · ${n('done', 'failed', 'stopped')} completed`
}

export function clip(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`
}

export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export const register: Register = (on, options) => {
  const extras = EXTRAS.filter(x => options[x.option] === true)
  const statusMin = typeof options.statusMin === 'number' ? options.statusMin : 20
  let poll = async (_force?: boolean) => {}
  let spinner = spin(FRAMES)
  let frame = 0
  let rows: Row[] = []
  let here = ''
  // The spinners the last drawing mounted; the timer repaints only these cells.
  let spinners: string[] = []

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'fleet', description: 'Turn the `claude agents` side pane on or off' })
    const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const jobsDir = `${home}/jobs`
    const wantsReports = extras.some(x => x.option === 'showContext' || x.option === 'showCost')
    const wantsUsage = extras.some(x => x.option === 'showCpu' || x.option === 'showMemory')
    // `claude agents` is a whole CLI start, so it runs only when a session's registry
    // entry or job file changed, or every 30 s for ages and exits nothing rewrites.
    const roots = new Map<string, string>()
    const root = async (dir: string) => {
      if (!roots.has(dir)) {
        const found = await repoRoot(dir,
          path => $.fs.read(path).then(t => t as string).catch(() => null),
          path => $.fs.stat(path).then(st => st.kind === 'dir').catch(() => null))
        roots.set(dir, found ?? dir)
      }
      return roots.get(dir)!
    }
    here = await root(launchDir(undefined, await $.session.cwd()))
    let seen = ''
    let lastRun = 0
    const changes = async () => {
      const sessions = await $.fs.list(`${home}/sessions`).catch(() => [])
      const jobs = await $.fs.list(jobsDir).catch(() => [])
      const stamps = await Promise.all(jobs.map(j =>
        $.fs.stat(`${jobsDir}/${j.name}/state.json`).then(s => `${j.name}:${s.mtimeMs}`).catch(() => j.name)))
      return [...sessions.map(f => `${f.name}:${f.mtimeMs}`), ...stamps].join(',')
    }
    // Runs nothing while the pane is closed, waiting undrawn or behind another tab.
    poll = async (force = false) => {
      const panes = await $.ui.panes()
      if (!panes.some(p => p.id === PANE && p.isPlaced && p.isShown)) return
      const now = await $.clock.now()
      const stamp = await changes()
      if (!force && stamp === seen && now - lastRun < 30_000) return
      seen = stamp
      lastRun = now
      const run = await $.process.run(['claude', 'agents', '--json', '--all'], { timeoutMs: 10000 }).catch(() => null)
      if (!run || run.exitCode !== 0) return
      const agents: any[] = JSON.parse(run.stdout)
      const jobs: Record<string, any> = {}
      await Promise.all(agents.map(a =>
        $.fs.read(`${jobsDir}/${a.id}/state.json`).then(t => { jobs[a.id] = JSON.parse(t as string) }).catch(() => {}),
      ))
      // Written by the person's statusLine command, as cones expects (~/.claude/statusline/<session>.json).
      const reports: Record<string, any> = {}
      if (wantsReports) await Promise.all(agents.map(a =>
        $.fs.read(`${home}/statusline/${a.sessionId}.json`).then(t => { reports[a.sessionId] = JSON.parse(t as string) }).catch(() => {}),
      ))
      const usage: Record<number, Usage> = {}
      const pids = agents.map(a => a.pid).filter(Number.isInteger)
      if (wantsUsage && pids.length) {
        // A fixed command line, filtered here to the sessions' pids.
        const ps = await $.process.run(['ps', '-A', '-o', 'pid=,%cpu=,rss=']).catch(() => null)
        const wanted = new Set(pids)
        for (const line of (ps?.stdout ?? '').split('\n')) {
          const [pid, cpu, rss] = line.trim().split(/\s+/).map(Number)
          if (pid && wanted.has(pid) && cpu !== undefined && rss !== undefined) usage[pid] = { cpu, rss: rss * 1024 }
        }
      }
      const fresh = toRows(agents, jobs, reports, usage)
      for (const r of fresh) r.group = await root(r.group)
      if (JSON.stringify(rows) === JSON.stringify(fresh)) return
      rows = fresh
      $.ui.invalidate('ui.render')
    }
    $.clock.every(3000, () => void poll())
    // Ages move once a minute; nothing else redraws without a change.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    spinner = spin((await $.env.get('TERM')) === 'xterm-ghostty' ? GHOSTTY : FRAMES)
    // The spinner repaints its own cells, never the pane. A refused blit means the pane
    // is gone or hidden, and the cells wait for the next drawing to mount them again.
    $.clock.every(120, () => {
      if (spinners.length === 0 || options.spinner === false) return
      frame = (frame + 1) % spinner.length
      const cells = cell(spinner[frame]!)
      for (const key of spinners) {
        void $.ui.blit({ requestId: PANE, key, columns: 1, rows: 1, cells }).then(r => {
          if ('deny' in r) spinners = []
        })
      }
    })
    // The person's last /fleet choice holds across sessions.
    if ((await $.store.get('hidden')) !== true) void $.ui.open({ id: PANE, title: 'Agents' }).then(() => poll(true))

    return next(e)
  })

  on('command.run', { command: 'fleet' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
    await $.store.set('hidden', isOpen)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Agents pane off.' }
    }
    await $.ui.open({ id: PANE, title: 'Agents' })
    await poll(true)

    return { text: 'Agents pane on.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    // Raster is the terminal's; elsewhere the spinner is a still glyph.
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e as typeof e & { surface: 'terminal' }).Raster : undefined
    const list = rows
    const [home, now, version, cwd] = await Promise.all([$.env.get('HOME'), $.clock.now(), $.session.version(), $.session.cwd()])
    spinners = list.filter(r => r.state === 'working').map(r => `spin-${r.id}`)
    const tilde = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
    // The view's mascot, its colours 174 on 16; it hides on narrow widths, as the view's does below 70.
    const CLAWD = '#d7875f'
    const mascot = e.props.bodyColumns >= 36 && (
      <Box flexDirection="column" flexShrink={0}>
        <Text color={CLAWD}> ▐<Text backgroundColor="#000000">▛███▛█</Text></Text>
        <Text color={CLAWD}>▝▜<Text backgroundColor="#000000">█████</Text>█▀</Text>
        <Text color={CLAWD}> ▝▝   ▝▝</Text>
      </Box>
    )

    // One line per agent as the view draws it: names share a column, clipped to keep it.
    const extraWidth = extras.reduce((n, x) => n + x.width + 1, 0)
    const nameCols = nameWidth(list.map(r => r.name), e.props.bodyColumns, statusMin, extraWidth)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} marginTop={1} marginBottom={1}>
          {mascot}
          <Box flexDirection="column" flexShrink={1}>
            <Text wrap="truncate"><Text bold>Claude Code</Text><Text color={GRAY}> v{version.version}</Text></Text>
            <Text color={GRAY} wrap="truncate">{tilde}</Text>
            <Text color={GRAY} wrap="truncate">{counts(list)}</Text>
          </Box>
        </Box>
        {list.length === 0 && <Text color={GRAY}>No sessions.</Text>}
        {groups(list, here, home ?? '').map(g => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={GRAY} wrap="truncate">{g.dir}</Text>
            {g.rows.map(r => {
              const look = LOOK[r.state] ?? { icon: '∙', word: r.state }
              return (
                <Box flexDirection="row" paddingLeft={1} paddingRight={1}>
                  <Box width={2} flexShrink={0}>
                    {r.state === 'working' && Raster
                      ? <Raster key={`spin-${r.id}`} columns={1} rows={1} cells={cell(spinner[frame]!)} />
                      : <Text color={look.color ?? GRAY}>{look.icon}</Text>}
                  </Box>
                  <Box width={nameCols + 2} flexShrink={0}>
                    <Text color={GRAY}>{clip(r.name, nameCols)}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text wrap="truncate">
                      <Text color={look.color}>{look.word}</Text>
                      {r.detail && <Text color={GRAY}> · {r.detail}</Text>}
                    </Text>
                  </Box>
                  {extras.map(x => (
                    <Box width={x.width + 1} flexShrink={0} paddingLeft={1}>
                      <Text color={GRAY}>{clip(x.cell(r), x.width)}</Text>
                    </Box>
                  ))}
                  <Box width={5} flexShrink={0} justifyContent="flex-end">
                    <Text color={GRAY}>{ago(now - r.since)}</Text>
                  </Box>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}

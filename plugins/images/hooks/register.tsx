import type { EngineInterface, Register } from 'claude-code'

export type Shot = { from: string; mediaType: string; data: string }
// A picture as Raster cells: each cell is a 2x2 block of pixels drawn as a quadrant glyph
// in two colours, so it shows in any truecolor terminal, tmux, cones and `claude attach` included.
export type Picture = { columns: number; rows: number; cells: string } | { error: string }

const GRAY = '#949494'
// Strip pictures' height in rows, and the widest one in columns.
const ROWS = 12
const MAX_COLUMNS = 48
const PANE = 'image'
const DEFAULT = 0x01000000
// The quadrant glyph for each set of foreground pixels: bit 0 top left, 1 top right,
// 2 bottom left, 3 bottom right.
const QUADRANTS = [0x2588, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]

// Image blocks in the order they reached the conversation: a user message's own are pastes,
// a tool result's are named by the tool call that made them.
export function collect(messages: { role: string; content: any[] }[]): Shot[] {
  const calls = new Map<string, string>()
  const shots: Shot[] = []
  const add = (block: any, from: string) => {
    const src = block?.source
    if (block?.type !== 'image' || src?.type !== 'base64' || typeof src.data !== 'string') return
    shots.push({ from, mediaType: src.media_type, data: src.data })
  }
  for (const m of messages) {
    for (const block of m.content) {
      if (block.type === 'tool_use') {
        const input = block.input as any
        calls.set(block.id, input?.file_path ?? input?.url ?? block.name)
      } else if (block.type === 'tool_result' && Array.isArray(block.content)) {
        for (const inner of block.content) add(inner, calls.get(block.tool_use_id) ?? 'tool result')
      } else if (m.role === 'user') add(block, 'pasted')
    }
  }
  return shots
}

export function toBase64(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0))
}

// The two colours that best split four pixels: the glyph's pixels take the foreground.
// Masks 1-7 are every split into two sets (the one without the bottom right pixel is
// the glyph's); 15 is one colour for all four.
export function split(px: number[]) {
  const rgb = px.map(p => [(p >> 16) & 255, (p >> 8) & 255, p & 255])
  const mean = (g: number[][]) => [0, 1, 2].map(c => g.reduce((n, p) => n + p[c]!, 0) / Math.max(1, g.length))
  const pack = (m: number[]) => (Math.round(m[0]!) << 16) | (Math.round(m[1]!) << 8) | Math.round(m[2]!)
  let best = { err: Infinity, mask: 15, fg: [0, 0, 0], bg: [0, 0, 0] }
  for (const mask of [15, 1, 2, 3, 4, 5, 6, 7]) {
    const inFg = (k: number) => ((mask >> k) & 1) === 1
    const fg = mean(rgb.filter((_, k) => inFg(k)))
    const bg = mean(rgb.filter((_, k) => !inFg(k)))
    const err = rgb.reduce((n, p, k) => n + p.reduce((d, v, c) => d + (v - (inFg(k) ? fg : bg)[c]!) ** 2, 0), 0)
    if (err < best.err) best = { err, mask, fg, bg }
  }
  return { glyph: QUADRANTS[best.mask]!, fg: pack(best.fg), bg: best.mask === 15 ? DEFAULT : pack(best.bg) }
}

// A 24- or 32-bit uncompressed BMP, as sips writes it, into quadrant cells.
export function cellsFromBmp(bmp: Uint8Array): Picture {
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength)
  if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) return { error: 'not a bmp' }
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bpp = view.getUint16(28, true)
  if (bpp !== 24 && bpp !== 32) return { error: `bmp ${bpp} bit` }
  const height = Math.abs(rawHeight)
  const stride = Math.ceil((width * bpp) / 32) * 4
  // Past the edge repeats the last pixel, so an odd size keeps its colour.
  const pixel = (x: number, y: number) => {
    const row = rawHeight < 0 ? Math.min(y, height - 1) : height - 1 - Math.min(y, height - 1)
    const i = offset + row * stride + Math.min(x, width - 1) * (bpp / 8)
    return (bmp[i + 2]! << 16) | (bmp[i + 1]! << 8) | bmp[i]!
  }
  const columns = Math.ceil(width / 2)
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const at = (y * columns + x) * 3
      const cell = split([pixel(2 * x, 2 * y), pixel(2 * x + 1, 2 * y), pixel(2 * x, 2 * y + 1), pixel(2 * x + 1, 2 * y + 1)])
      words[at] = cell.glyph
      words[at + 1] = cell.fg
      words[at + 2] = cell.bg
    }
  }
  return { columns, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

// Decodes any image sips reads (PNG, JPEG, GIF, WebP) from stdin, fits it in a box of
// $1 by $2 pixels (a cell is two of them across and two down, so they come out square) and writes it to stdout as a base64 BMP.
const FIT = `
set -e
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
base64 -d > "$d/i"
set -- "$1" "$2" $(sips -g pixelWidth -g pixelHeight "$d/i" | awk '/pixel/ {print $2}')
if [ $(($3 * $2)) -gt $(($4 * $1)) ]; then w=$1; h=$(($4 * $1 / $3)); else h=$2; w=$(($3 * $2 / $4)); fi
[ $w -lt 1 ] && w=1; [ $h -lt 2 ] && h=2
sips -s format bmp -z $h $w "$d/i" --out "$d/o.bmp" >/dev/null
base64 -i "$d/o.bmp"
`

// Writes the base64 image on stdin to a temporary file and opens it in Preview.
const OPEN = `
set -e
f=$(mktemp -t images).$1
base64 -d > "$f"
open "$f"
echo "$f"
`

let shots: Shot[] = []
// The picture the pane shows, by its number in the strip.
let zoomed = 0
let seen = ''
let hidden = false
// ponytail: decoded pictures are kept for the session; evict the oldest if memory matters.
const pictures = new Map<string, Picture>()
const idOf = (s: Shot) => `${s.from}:${s.data.length}:${s.data.slice(-32)}`
const pending = new Set<string>()

const queue: { key: string; shot: Shot; columns: number; rows: number }[] = []

async function decode($: EngineInterface, shot: Shot, columns: number, rows: number): Promise<Picture> {
  const run = await $.process
    .run(['sh', '-c', FIT, 'fit', String(columns * 2), String(rows * 2)], { stdin: shot.data, timeoutMs: 20_000 })
    .catch((e: unknown) => ({ exitCode: -1, stdout: '', stderr: String(e) }))
  if (run.exitCode !== 0) return { error: run.stderr.trim().split('\n').pop() || 'sips failed' }
  return cellsFromBmp(fromBase64(run.stdout.replace(/\s+/g, '')))
}

// The picture at a size, decoded once; until it is, undefined. A render hook's own calls end
// with it, so the decode is queued for the session's timer to run.
function picture(shot: Shot, columns: number, rows: number) {
  const key = `${idOf(shot)}@${columns}x${rows}`
  const found = pictures.get(key)
  if (found || pending.has(key)) return found
  pending.add(key)
  queue.push({ key, shot, columns, rows })
  return undefined
}

async function drain($: EngineInterface) {
  for (let job = queue.shift(); job; job = queue.shift()) {
    pictures.set(job.key, await decode($, job.shot, job.columns, job.rows))
    pending.delete(job.key)
    $.ui.invalidate('ui.render')
  }
}

async function refresh($: EngineInterface) {
  // ponytail: rescans the whole transcript each step; track the last message index if long sessions lag.
  const fresh = collect(await $.session.messages({ as: 'api' }))
  const stamp = fresh.map(idOf).join('|')
  if (stamp === seen) return
  seen = stamp
  shots = fresh
  $.ui.invalidate('ui.render')
}

// The newest decoded pictures that fit side by side in `columns`, oldest of them first.
export function strip<T extends { columns: number }>(items: T[], columns: number, gap = 1) {
  const fit: T[] = []
  let used = 0
  for (let i = items.length - 1; i >= 0; i--) {
    const width = Math.min(items[i]!.columns, columns)
    if (fit.length && used + gap + width > columns) break
    used += (fit.length ? gap : 0) + width
    fit.unshift(items[i]!)
  }
  return fit
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'images', description: 'Turn the session images strip on or off' })
    hidden = (await $.store.get('hidden')) === true
    let draining = false
    $.clock.every(100, async () => {
      if (draining || queue.length === 0) return
      draining = true
      await drain($).finally(() => { draining = false })
    })
    await refresh($)

    return next(e)
  })

  // Each model request carries the conversation so far: pastes and tool results included.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await refresh($)

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)

    return next(e)
  })

  // `/images` turns the strip on or off; `/images 3` opens picture 3 large in a pane.
  on('command.run', { command: 'images' }, async ($, e) => {
    const [word, arg] = e.args.trim().split(/\s+/)
    if (word === 'open') {
      const shot = shots[Number(arg ?? shots.length) - 1]
      if (!shot) return { text: `No image ${arg}; this session has ${shots.length}.` }
      const ext = shot.mediaType.split('/')[1] ?? 'png'
      const run = await $.process.run(['sh', '-c', OPEN, 'open', ext], { stdin: shot.data })
      return { text: run.exitCode === 0 ? `Opened ${run.stdout.trim()}` : `Could not open it: ${run.stderr.trim()}` }
    }
    const n = Number(word)
    if (word) {
      if (!Number.isInteger(n) || n < 1 || n > shots.length) return { text: `No image ${e.args.trim()}; this session has ${shots.length}.` }
      zoomed = n
      await $.ui.open({ id: PANE, title: `Image ${n}`, rows: 60, focus: true, closeOnEscape: true })
      $.ui.invalidate('ui.render')
      return { text: `Image ${n} open.` }
    }
    hidden = !hidden
    await $.store.set('hidden', hidden)
    $.ui.invalidate('ui.render')

    return { text: hidden ? 'Images strip off.' : 'Images strip on. /images N opens one large, /images open N in Preview.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const shot = shots[zoomed - 1]
    if (!shot || e.surface !== 'terminal') return <Text color={GRAY}>No image.</Text>
    const { Raster } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
    // As wide as the pane, as tall as that makes it: a picture taller than the pane scrolls.
    const p = picture(shot, Math.min(255, e.props.bodyColumns), 255)

    return (
      <Box flexDirection="column">
        <Text color={GRAY} wrap="truncate">#{zoomed} {shot.from} · ↑↓ scroll · /images open {zoomed} for full size</Text>
        {p && 'cells' in p
          ? <Raster key={`zoom-${zoomed}`} columns={p.columns} rows={p.rows} cells={p.cells} />
          : <Text color={GRAY}>{p ? `not drawn: ${p.error}` : 'decoding…'}</Text>}
      </Box>
    )
  })

  // A strip of the newest images above the prompt, as many as fit across.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (hidden || e.props.hasSurvey || shots.length === 0 || e.surface !== 'terminal') return next(e)
    // The large picture's pane takes the room above the prompt while it is open.
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)) return next(e)
    const { Box, Text, Raster } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
    const items = shots.map((shot, i) => {
      const p = picture(shot, MAX_COLUMNS, ROWS)
      return { n: i + 1, shot, picture: p, columns: p && 'cells' in p ? p.columns : 16 }
    })
    const name = (from: string) => from.split('/').pop() ?? from

    return (
      <Box flexDirection="row" gap={1}>
        {strip(items, e.props.bodyColumns).map(({ n, shot, picture, columns }) => (
          <Box flexDirection="column" width={columns} flexShrink={0}>
            {picture && 'cells' in picture
              ? <Raster key={`img-${n}`} columns={picture.columns} rows={picture.rows} cells={picture.cells} />
              : <Text color={GRAY}>{picture ? `not drawn: ${picture.error}` : 'decoding…'}</Text>}
            <Text color={GRAY} wrap="truncate">#{n} {name(shot.from)}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}

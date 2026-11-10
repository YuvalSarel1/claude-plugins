import { test, expect } from 'claude-code/testing'

import { cellsFromBmp, collect, fromBase64, split, strip } from './register'

const img = (data: string, media_type = 'image/png') => ({ type: 'image', source: { type: 'base64', media_type, data } })

test('pastes and tool results are both collected, named by where they came from', () => {
  const shots = collect([
    { role: 'user', content: [{ type: 'text', text: 'look' }, img('AAAA')] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x/shot.jpg' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [img('/9j/abc', 'image/jpeg')] }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  ])
  expect(shots.map(s => [s.from, s.mediaType])).toEqual([['pasted', 'image/png'], ['/x/shot.jpg', 'image/jpeg']])
})

// A top-down 24-bit BMP, `rows` of [r, g, b] pixels, each row padded to 4 bytes as sips writes it.
function bmp(rows: number[][][]) {
  const width = rows[0]!.length
  const stride = Math.ceil((width * 3) / 4) * 4
  const out = new Uint8Array(54 + stride * rows.length)
  const view = new DataView(out.buffer)
  out.set([0x42, 0x4d])
  view.setUint32(10, 54, true)
  view.setInt32(18, width, true)
  view.setInt32(22, -rows.length, true)
  view.setUint16(28, 24, true)
  rows.forEach((row, y) => row.forEach(([r, g, b], x) => out.set([b!, g!, r!], 54 + y * stride + x * 3)))
  return out
}

test('each cell is a quadrant glyph splitting its 2x2 pixels into two colours', () => {
  const red = [255, 0, 0], blue = [0, 0, 255]
  // Left column red, right blue: a left half block, red on blue; then a solid red cell.
  const picture = cellsFromBmp(bmp([[red, blue, red, red], [red, blue, red, red]]))
  if (!('cells' in picture)) throw new Error(picture.error)
  expect([picture.columns, picture.rows]).toEqual([2, 1])
  const words = new Uint32Array(fromBase64(picture.cells).buffer)
  expect([...words]).toEqual([0x258c, 0xff0000, 0x0000ff, 0x2588, 0xff0000, 0x01000000])
  // A diagonal, and an odd edge that repeats the last pixel rather than going dark.
  expect(split([0xff0000, 0x0000ff, 0x0000ff, 0xff0000])).toEqual({ glyph: 0x259e, fg: 0x0000ff, bg: 0xff0000 })
  const odd = cellsFromBmp(bmp([[red]]))
  if (!('cells' in odd)) throw new Error(odd.error)
  expect([...new Uint32Array(fromBase64(odd.cells).buffer)]).toEqual([0x2588, 0xff0000, 0x01000000])
  expect(cellsFromBmp(new Uint8Array(60))).toEqual({ error: 'not a bmp' })
})

test('the strip keeps the newest pictures that fit, oldest of them first', () => {
  const items = [{ n: 1, columns: 20 }, { n: 2, columns: 40 }, { n: 3, columns: 20 }]
  expect(strip(items, 70).map(f => f.n)).toEqual([2, 3])
  // One picture wider than the strip still shows; the site clips it.
  expect(strip([{ n: 1, columns: 100 }], 30).map(f => f.n)).toEqual([1])
})

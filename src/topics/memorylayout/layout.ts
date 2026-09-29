/**
 * Go struct layout on 64-bit platforms (amd64/arm64): each field starts at a
 * multiple of its alignment, and the size rounds up to the largest alignment.
 * A zero-size field placed last gets one extra byte before rounding
 * (cmd/compile/internal/types/size.go), so a pointer to it stays inside the struct.
 */
export type Field = { name: string; type: string; size: number; align: number }

/** One byte of the struct: which field owns it, or padding. */
export type Byte = { field: string | null; first: boolean }

export type Layout = { size: number; padding: number; offsets: number[]; bytes: Byte[] }

export function layout(fields: Field[]): Layout {
  let off = 0
  let maxAlign = 1
  const offsets: number[] = []
  for (const f of fields) {
    off = Math.ceil(off / f.align) * f.align
    offsets.push(off)
    off += f.size
    maxAlign = Math.max(maxAlign, f.align)
  }
  if (fields.length > 0 && fields[fields.length - 1].size === 0 && off > 0) off++
  const size = Math.ceil(off / maxAlign) * maxAlign
  const bytes: Byte[] = Array.from({ length: size }, () => ({ field: null, first: false }))
  fields.forEach((f, i) => {
    for (let b = 0; b < f.size; b++) bytes[offsets[i] + b] = { field: f.name, first: b === 0 }
  })
  const padding = size - fields.reduce((s, f) => s + f.size, 0)
  return { size, padding, offsets, bytes }
}

const bool = (name: string): Field => ({ name, type: 'bool', size: 1, align: 1 })
const i32 = (name: string): Field => ({ name, type: 'int32', size: 4, align: 4 })
const i64 = (name: string, type = 'int64'): Field => ({ name, type, size: 8, align: 8 })

/** The lab's struct, in the order people write it and the order that packs. */
export const orders = {
  bad: [bool('paid'), i64('id'), i32('qty'), bool('gift'), i64('price', 'float64')],
  good: [i64('id'), i64('price', 'float64'), i32('qty'), bool('paid'), bool('gift')],
}

/** Split the bytes into 8-byte words (rows). */
export const words = (bytes: Byte[]): Byte[][] => Array.from({ length: Math.ceil(bytes.length / 8) }, (_, i) => bytes.slice(i * 8, i * 8 + 8))

/**
 * Which type arguments share one compiled copy of a generic function?
 * Shapes read from `go tool nm` on go1.26.4 (linux/amd64) for `func Id[T any](v T) T`:
 * int and `type Celsius int` → go.shape.int; every pointer → go.shape.*uint8;
 * each interface type gets its own shape (go.shape.interface {}, go.shape.interface { Error() string }).
 */
export const TYPES = ['int', 'Celsius', 'int64', 'string', '*User', '*Order', 'any', 'error'] as const
export type TypeArg = (typeof TYPES)[number]

const SHAPE: Record<TypeArg, string> = {
  int: 'int',
  Celsius: 'int',
  int64: 'int64',
  string: 'string',
  '*User': '*uint8',
  '*Order': '*uint8',
  any: 'interface {}',
  error: 'interface { Error() string }',
}

export const shapeOf = (t: TypeArg) => 'go.shape.' + SHAPE[t]

export const sameCopy = (a: TypeArg, b: TypeArg) => SHAPE[a] === SHAPE[b]

const WHY: Record<string, string> = {
  int: 'Celsius is built on int, so same layout.',
  '*uint8': 'Every pointer looks the same to the GC.',
}

export function verdict(a: TypeArg, b: TypeArg): string {
  if (a === b) return 'Same type, same copy.'
  if (sameCopy(a, b)) return WHY[SHAPE[a]]
  return 'Different memory layouts, so separate code.'
}

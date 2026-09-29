import type { QuizItem } from '../../components/Quiz'
import type { InterviewQ } from '../../components/Interview'

export const quiz: QuizItem[] = [
  {
    id: 'maps.nil',
    q: 'What happens?',
    code: `var m map[string]int
fmt.Println(m["x"], len(m))
m["x"] = 1`,
    options: ['Compile error', 'Prints 0 0, then panics: assignment to entry in nil map', 'Prints 0 0, then m has one entry', 'Panics on the first line'],
    answer: 1,
    explain: <p>A nil map behaves like an empty map for reads, <code>len</code>, <code>delete</code>, <code>range</code> and <code>clear</code>. Writing needs a header to point at, so it panics.</p>,
  },
  {
    id: 'maps.struct',
    q: 'Does this compile?',
    code: `type P struct{ X int }
m := map[string]P{"a": {}}
m["a"].X = 1`,
    options: ['Yes, sets X to 1', 'Yes, but the write is lost on a copy', 'No: cannot assign to struct field m["a"].X in map', 'Panics at runtime'],
    answer: 2,
    explain: <p>Map elements aren’t addressable — growth moves them. Use <code>map[string]*P</code>, or <code>p := m["a"]; p.X = 1; m["a"] = p</code>.</p>,
  },
  {
    id: 'maps.nan',
    q: 'What does this print?',
    code: `m := map[float64]int{}
m[math.NaN()] = 1
m[math.NaN()] = 2
_, ok := m[math.NaN()]
delete(m, math.NaN())
fmt.Println(len(m), ok)`,
    options: ['1 true', '2 false', '0 false', '1 false'],
    answer: 1,
    explain: <p>NaN never equals itself, so each insert is a new key, and no lookup or delete can find one. Only <code>clear(m)</code> (or a new map) removes them. Verified on go1.26.4.</p>,
  },
  {
    id: 'maps.negzero',
    q: 'After this, what are len(m), the stored key and the value?',
    code: `m := map[float64]string{}
m[0.0] = "pos"
m[math.Copysign(0, -1)] = "neg"`,
    options: ['2 entries', '1 entry: key 0, value "neg"', '1 entry: key -0, value "neg"', '1 entry: key 0, value "pos"'],
    answer: 2,
    explain: <p>+0 and −0 compare equal, so it’s an update. For float (and string) keys the runtime also overwrites the stored key (<code>NeedKeyUpdate</code>), so the key becomes −0.</p>,
  },
  {
    id: 'maps.rotation',
    q: 'A 5-entry map (keys inserted 1…5) is printed with range several times: 51234, 12345, 34512. Which order can Go 1.26 NOT produce?',
    options: ['23451', '45123', '21534', 'All three are possible'],
    answer: 2,
    explain: (
      <p>
        A map with ≤8 entries is one group, filled in insertion order. Iteration starts at a random slot and wraps around, so you only ever see <em>rotations</em> of 12345. 21534 is not a rotation.
        Verified on go1.26.4.
      </p>
    ),
  },
  {
    id: 'maps.rangeinsert',
    q: 'How many times does the loop body run?',
    code: `m := map[int]bool{1: true, 2: true, 3: true}
n := 0
for k := range m {
    m[k+100] = true
    n++
}`,
    options: ['Exactly 3', 'Exactly 6', 'Anywhere from 3 to 8 — varies per run', 'Infinite loop'],
    answer: 2,
    explain: (
      <p>
        The spec allows new entries to be produced or skipped. In practice (1.26), the iterator keeps walking the original 8-slot group after the map grows, so 1000 runs gave counts from 3 to 8, never
        more.
      </p>
    ),
  },
  {
    id: 'maps.shrink',
    q: 'You fill a map with 1M entries (~287 MB), then delete every key. What does the heap look like after a GC?',
    options: ['Back to ~0 MB', '~287 MB is still held by the map', 'Half: the map halves on shrink', 'Depends on GOGC'],
    answer: 1,
    explain: <p>Go maps never shrink — not with delete, not with clear. The tables stay allocated for reuse. Copy survivors into a fresh map (or drop the map) to release the memory.</p>,
  },
  {
    id: 'maps.concurrent',
    q: 'Two goroutines write to the same map without a lock and the runtime detects it. What happens?',
    options: [
      'A panic that a deferred recover() can catch',
      'fatal error: concurrent map writes — the process dies, recover can’t stop it',
      'Nothing; one write wins',
      'The map is silently corrupted but the program continues',
    ],
    answer: 1,
    explain: <p>It’s a <code>fatal</code> throw, not a panic. Detection is best-effort (a flag toggled with XOR), so some races go unnoticed and corrupt memory. Use <code>-race</code> in tests.</p>,
  },
  {
    id: 'maps.ninth',
    q: 'A map created with make(map[int]int) receives its 9th distinct key. What happens in Go 1.24+?',
    options: ['Nothing special', 'The single small-map group becomes a 16-slot table behind a 1-entry directory', 'The bucket array doubles to 2 buckets', 'An overflow bucket is chained'],
    answer: 1,
    explain: <p>Up to 8 entries a map is just one group (no table, no directory, no tombstones). The 9th key forces <code>growToTable</code>: capacity 16, growthLeft 14.</p>,
  },
  {
    id: 'maps.keys',
    q: 'What is the type of maps.Keys(m) in Go 1.23+?',
    options: ['[]K', 'iter.Seq[K]', 'chan K', 'map[K]struct{}'],
    answer: 1,
    explain: <p>An iterator. Use <code>slices.Collect(maps.Keys(m))</code> or <code>slices.Sorted(maps.Keys(m))</code>. The old <code>x/exp/maps.Keys</code> returned a slice — a classic migration trap.</p>,
  },
]

export const interview: InterviewQ[] = [
  {
    id: 'what-changed',
    level: 'core',
    q: 'What changed in Go maps in 1.24?',
    a: (
      <p>
        The implementation became a Swiss table: 8-slot groups with a control word, H1/H2 hashing, open addressing with triangular probing, 7/8 load factor, tables capped at 1024 slots behind an
        extendible-hashing directory. It replaced buckets + overflow chains + incremental evacuation. The language semantics didn’t change. <code>sync.Map</code> was also reimplemented as a hash trie.
      </p>
    ),
  },
  {
    id: 'h1h2',
    level: 'core',
    q: 'What are H1 and H2?',
    a: <p>H1 is the upper 57 bits (hash &gt;&gt; 7): it picks the starting group and drives probing. H2 is the low 7 bits, stored in the slot’s control byte, so 8 slots can be filtered with one word compare. The top bits of the hash separately index the directory.</p>,
  },
  {
    id: 'lookup',
    level: 'senior',
    q: 'Walk through a lookup in a Swiss map.',
    a: (
      <p>
        Hash the key with the per-map seed. Small map: one matchH2 over the only group, compare candidate keys. Otherwise: top <code>globalDepth</code> bits pick the table; <code>H1 &amp; mask</code> picks
        the first group; matchH2 over its control word; compare keys for each candidate; if the group has any empty slot, stop — not found; else move to the next group in the triangular sequence.
      </p>
    ),
  },
  {
    id: 'tombstone',
    level: 'senior',
    q: 'Why tombstones? Why not mark a deleted slot empty?',
    a: <p>An empty slot terminates probing. If the group was full, other keys may have probed past it on insert; marking the slot empty would make them unfindable. If the group still has an empty slot, nothing probed past it and the slot is simply marked empty.</p>,
  },
  {
    id: 'growth-new',
    level: 'senior',
    q: 'How does a Swiss map grow without long pauses, given it has no incremental evacuation?',
    a: <p>Each table is capped at 1024 slots. Growth rehashes one table at a time: double it if under the cap, else split it in two by the next hash bit (doubling the directory if its localDepth == globalDepth). So the worst single insert moves ~896 entries regardless of map size.</p>,
  },
  {
    id: 'growth-old',
    level: 'senior',
    q: 'Explain growth in the pre-1.24 map.',
    a: (
      <p>
        Trigger: count &gt; 6.5 × 2^B (double) or too many overflow buckets (same-size grow). <code>hashGrow</code> only allocates and keeps <code>oldbuckets</code>. Every later assign/delete calls{' '}
        <code>growWork</code>: evacuate the old bucket it touches plus one more at <code>nevacuate</code>, splitting old bucket i into i and i+2^oldB by one hash bit. Lookups check old buckets until
        they’re evacuated.
      </p>
    ),
  },
  {
    id: 'loadfactor',
    level: 'core',
    q: 'What load factor triggers growth?',
    a: <p>Swiss (1.24+): 7/8 of a table’s slots, counting tombstones (a single-group table keeps one slot empty). Classic: average 6.5 entries per 8-slot bucket, or overflow buckets ≥ bucket count (same-size grow).</p>,
  },
  {
    id: 'addr',
    level: 'core',
    q: 'Why can’t you take &m[k]?',
    a: <p>Entries move during growth (rehash/split now, evacuation before). A pointer into the table would dangle. The same reason forbids <code>m[k].f = v</code>.</p>,
  },
  {
    id: 'order',
    level: 'core',
    q: 'Is map iteration order random?',
    a: <p>Unspecified by the spec and deliberately randomized by the runtime: a random starting table and slot offset per range. It’s not a uniform shuffle — small maps iterate as rotations. <code>fmt</code> prints maps sorted since 1.12.</p>,
  },
  {
    id: 'mutate-range',
    level: 'senior',
    q: 'What are the rules for mutating a map during range?',
    a: <p>Deleting an entry not yet reached means it won’t be produced. Entries added during iteration may or may not be produced. Each entry is produced at most once. <code>for k := range m {'{'} delete(m, k) {'}'}</code> is safe (but <code>clear(m)</code> is faster).</p>,
  },
  {
    id: 'concurrency',
    level: 'core',
    q: 'Are maps safe for concurrent use? What does the runtime do?',
    a: <p>Concurrent reads are fine; any write concurrent with another access is a data race. The runtime XOR-toggles a <code>writing</code> flag and throws <code>fatal error: concurrent map writes</code> (or read and write) when it notices — unrecoverable, best effort. Protect with a mutex, shard, or use sync.Map where it fits.</p>,
  },
  {
    id: 'syncmap',
    level: 'senior',
    q: 'When would you use sync.Map over map + RWMutex?',
    a: <p>Keys written once and read many times, or goroutines working on disjoint key sets. Since 1.24 it’s a 16-way concurrent hash trie with lock-free loads and per-node locks, no read/dirty promotion. It’s untyped and Range isn’t a snapshot; for mixed read/write workloads a typed map with a mutex (or sharded maps) is usually simpler and faster.</p>,
  },
  {
    id: 'shrink',
    level: 'senior',
    q: 'I deleted all entries from a big map but RSS didn’t drop. Why, and what do you do?',
    a: <p>Maps never shrink; <code>delete</code> and <code>clear</code> keep tables and directory allocated. Rebuild: copy the live entries into <code>make(map[K]V, len(old))</code> and drop the old map. For caches with churn, periodically rebuild or use a pointer-free/sharded design.</p>,
  },
  {
    id: 'hint',
    level: 'core',
    q: 'What does make(map[K]V, n) do?',
    a: <p>Pre-sizes storage for ~n entries so no rehash happens on the way there; <code>len</code> stays 0. A hint ≤ 8 allocates nothing until the first write. Over-large hints waste memory.</p>,
  },
  {
    id: 'keys',
    level: 'core',
    q: 'Which types can be map keys?',
    a: <p>Any comparable type. Slices, maps and funcs are compile errors. Interface keys (<code>any</code>) compile but panic at runtime if the dynamic type isn’t hashable: <code>hash of unhashable type []int</code> — even on a nil map.</p>,
  },
  {
    id: 'gc',
    level: 'senior',
    q: 'Why is map[int64]int64 cheaper for the GC than map[string]*T?',
    a: <p>If neither key nor value contains pointers, the groups are allocated in no-scan spans: the GC never scans them and writes need no barriers. Strings and pointers force the GC to trace every slot every cycle. Values &gt;128 bytes are also stored indirectly, adding allocations.</p>,
  },
  {
    id: 'swar',
    level: 'staff',
    q: 'How does matchH2 test 8 slots at once without SIMD? Can it be wrong?',
    a: <p><code>v := ctrl ^ (0x0101…01 * h2)</code> zeroes matching bytes; <code>((v - 0x0101…01) &amp;^ v) &amp; 0x8080…80</code> sets the high bit of zero bytes. A borrow can flag the byte above a real match — a false positive, resolved by the key comparison. On amd64 the compiler uses SSE2 PCMPEQB + PMOVMSKB instead.</p>,
  },
  {
    id: 'why8',
    level: 'staff',
    q: 'Abseil uses 16-slot groups with SSE2. Why does Go use 8?',
    a: <p>An 8-byte control word fits a general-purpose register, so the portable SWAR path works on every architecture and the amd64 SIMD path is a drop-in replacement. The Go team lists 16-slot groups and wider SIMD as future work.</p>,
  },
  {
    id: 'iter-grow',
    level: 'staff',
    q: 'How does iteration stay correct when the map grows mid-range?',
    a: <p>The iterator keeps a pointer to the old table and keeps choosing keys from its layout (so no duplicates), but looks each key up in the live map to get the current value or skip deleted keys. Keys that exist only in the new table may be missed, which the spec allows. Directory doubling shifts the iterator’s directory indices accordingly.</p>,
  },
  {
    id: 'seed',
    level: 'senior',
    q: 'What is the worst-case lookup cost and how does Go defend against hash flooding?',
    a: <p>O(n) with adversarial collisions. Each map has a random seed (AES-based hashing on amd64/arm64), re-rolled whenever the map becomes empty and on clear, so attackers can’t precompute colliding keys.</p>,
  },
]

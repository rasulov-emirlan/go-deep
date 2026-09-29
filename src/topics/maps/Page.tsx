import { Callout, Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { QuizList } from '../../components/Quiz'
import { Interview } from '../../components/Interview'
import { NextTopic, Sources, TopicHero } from '../../components/TopicShell'
import { ControlWordLab, SwissLab } from './SwissLab'
import { GrowthRace, OldMapLab } from './OldLab'
import { interview, quiz } from './content'

const toc = [
  { id: 'basics', label: 'What a map value is' },
  { id: 'swiss', label: 'Swiss tables' },
  { id: 'lab', label: 'Swiss lab' },
  { id: 'swar', label: 'Control word' },
  { id: 'delete', label: 'Tombstones' },
  { id: 'growth', label: 'Growth' },
  { id: 'classic', label: 'Classic map' },
  { id: 'gotchas', label: 'Gotchas' },
  { id: 'puzzles', label: 'Puzzles' },
  { id: 'interview', label: 'Interview' },
]

export default function MapsPage() {
  return (
    <>
      <TopicHero
        slug="maps"
        title={
          <>
            Maps & <span className="r">Swiss</span> tables
          </>
        }
        lead="Go 1.24 threw out the bucket-and-overflow-chain map it had used since 1.0 and replaced it with an open-addressing Swiss table. Here is what’s inside both, byte by byte — and every map trick question that falls out of it."
        toc={toc}
      />

      <Section id="basics" n="01" kicker="Mental model" title="A map value is a pointer">
        <div className="prose">
          <p>
            <code>map[K]V</code> is a pointer to a runtime header (<code>*maps.Map</code> since 1.24, <code>*hmap</code> before). Passing a map copies the pointer, so callee writes are visible; assigning{' '}
            <code>m = nil</code> in the callee isn’t. A nil map is a nil pointer: reads, <code>len</code>, <code>delete</code>, <code>range</code> and <code>clear</code> work; writes panic.
          </p>
          <Code>{`
// internal/runtime/maps/map.go (Go 1.24+), 48 bytes
type Map struct {
    used        uint64         // len(m) — must be first, len() reads it directly
    seed        uintptr        // per-map random hash seed (re-rolled when the map empties)
    dirPtr      unsafe.Pointer // *[dirLen]*table, or *group for a small map
    dirLen      int            // 0 ⇒ small map
    globalDepth uint8          // hash bits used to index the directory
    globalShift uint8
    writing     uint8          // XOR-toggled: "concurrent map writes" detector
    tombstonePossible bool
    clearSeq    uint64         // bumped by clear(); iterators notice
}
`}</Code>
        </div>
      </Section>

      <Section id="swiss" n="02" kicker="Go 1.24+" title="Swiss tables in five words: group, control, H1, H2, directory">
        <div className="prose">
          <ul>
            <li>
              <b>Slot</b> — one key/value pair. <b>Group</b> — 8 slots plus an 8-byte <b>control word</b>, one control byte per slot. Key and value are <em>interleaved</em> in a slot (the old bucket
              stored 8 keys, then 8 values).
            </li>
            <li>
              <b>Control byte</b>: <code>0x80</code> empty, <code>0xFE</code> deleted (tombstone), <code>0b0hhhhhhh</code> full — where <code>hhhhhhh</code> is <b>H2</b>, the low 7 bits of the hash.
            </li>
            <li>
              <b>H1</b> = <code>hash &gt;&gt; 7</code> picks the first group; the probe then visits groups at offsets 1, 3, 6, 10… (triangular numbers), which on a power-of-two table touches every group
              exactly once.
            </li>
            <li>
              <b>Table</b> — a complete Swiss table of up to <b>1024</b> slots, max load <b>7/8</b>. <b>Directory</b> — an array of table pointers indexed by the <em>top</em> bits of the hash
              (extendible hashing).
            </li>
            <li>
              <b>Small map</b> — up to 8 entries lives in a single group with no table and no directory. Lookup is one 8-way compare, no probing.
            </li>
          </ul>
          <Callout label="Why it’s fast">
            <p>
              A lookup compares H2 against all 8 control bytes at once (one 64-bit SWAR trick, or SSE2 on amd64). Only slots whose H2 matches — 1 in 128 by chance — cost a real key comparison. The
              probe stops at the first group that has an empty slot. Result: up to 60% faster microbenchmarks and ~1.5% CPU geomean on real programs vs Go 1.23.
            </p>
          </Callout>
        </div>
      </Section>

      <Section id="lab" n="03" kicker="Interactive" title="Swiss map lab">
        <div className="prose">
          <p>
            Insert, look up and delete keys. Watch the hash split into directory bits / H1 / H2, the probe walk groups, and the map go from a single small group → a 16-slot table → doubling → splitting
            with the directory doubling behind it. Try <b>+8 keys</b> then <b>+1 key</b> to see the 9th-key transition.
          </p>
        </div>
        <SwissLab />
      </Section>

      <Section id="swar" n="04" kicker="SWAR" title="Eight comparisons in one subtraction">
        <div className="prose">
          <p>
            The portable matcher XORs the control word with H2 broadcast to every byte, so matching bytes become zero. Then the classic “has-zero-byte” trick flags them. It can raise a{' '}
            <em>false positive</em> in the byte just above a true match (a borrow propagates) — harmless, because every candidate is confirmed by comparing keys.
          </p>
        </div>
        <ControlWordLab />
      </Section>

      <Section id="delete" n="05" kicker="Deletion" title="Why tombstones exist">
        <div className="prose">
          <p>
            A lookup stops at the first group with an empty slot: “if the key were further along, it would have been placed here”. Now delete a key from a <em>full</em> group. If you marked its slot
            empty, a key that was pushed past this group during insert would become unfindable. So:
          </p>
          <ul>
            <li>
              group still has an empty slot → nobody ever probed past it → mark the slot <b>empty</b>, <code>growthLeft++</code>;
            </li>
            <li>
              group is full → mark it <b>deleted (0xFE)</b>: lookups keep probing, inserts may reuse it.
            </li>
          </ul>
          <p>
            Tombstones still count against the 7/8 load. When a table runs out of room, Go first tries <code>pruneTombstones</code> (only if they’re ≥10% of capacity) and otherwise grows, which drops
            them all. Small maps never need tombstones — there is no probe sequence. In the lab, fill a table (+40 keys at capacity 16), then delete keys until you see a black <code>FE</code> slot.
          </p>
        </div>
      </Section>

      <Section id="growth" n="06" kicker="Growth" title="No more incremental evacuation">
        <div className="prose">
          <p>
            The old map amortized growth: allocate a 2× bucket array, then move ≤2 buckets on every later write, with lookups checking both arrays meanwhile. The Swiss map drops all of that. When a table
            hits 7/8 it is rehashed <em>at once</em> into a table twice as big — but tables are capped at 1024 slots. Past that, a full table <b>splits</b> into two 1024-slot tables by the next hash bit,
            and if its <code>localDepth</code> equals the directory’s <code>globalDepth</code>, the directory doubles first. Worst case per insert is therefore bounded (≈896 entries), no matter how big the
            map is.
          </p>
        </div>
        <GrowthRace />
      </Section>

      <Section id="classic" n="07" kicker="Go ≤ 1.23" title="The classic map, for comparison">
        <div className="prose">
          <p>
            Still asked in interviews, and still what most blog posts describe: <code>hmap</code> with <code>2^B</code> buckets of 8 entries, each with a <code>tophash</code> byte (top 8 hash bits;
            values 0–4 reserved as markers), chained overflow buckets, load factor 6.5, and a <em>same-size grow</em> to repack when overflow buckets pile up after deletes.
          </p>
        </div>
        <OldMapLab />
      </Section>

      <Section id="gotchas" n="08" kicker="Semantics" title="The rules that fall out of the design">
        <div className="prose">
          <ul>
            <li>
              <b>
                <code>&m[k]</code> is illegal
              </b>{' '}
              and <code>m[k].field = v</code> doesn’t compile: entries move when a table grows or splits. Use <code>map[K]*T</code> or read–modify–write.
            </li>
            <li>
              <b>Iteration order is randomized</b> per <code>range</code> (random start table and slot offset), but it isn’t a shuffle: a small map iterates as a <em>rotation</em> of slot order.{' '}
              <code>fmt</code> and <code>encoding/json</code> sort keys for you.
            </li>
            <li>
              <b>Maps never shrink.</b> Delete every key (or <code>clear</code>) and the tables stay allocated — verified: 1M entries of <code>[128]byte</code> hold ~287 MB before and after. Copy the
              survivors into a fresh map to release memory.
            </li>
            <li>
              <b>Not safe for concurrent writes.</b> A best-effort flag turns a detected race into <code>fatal error: concurrent map writes</code> — a throw, not a panic, so <code>recover</code>{' '}
              can’t catch it. <code>-race</code> is the real detector.
            </li>
            <li>
              <b>NaN keys</b>: <code>NaN != NaN</code>, so every <code>m[NaN] = v</code> adds a new entry you can never read or delete — only <code>clear</code> removes them.
            </li>
            <li>
              <b>Interface keys</b> compile for any type but panic at runtime if the dynamic type isn’t comparable: <code>hash of unhashable type []int</code>.
            </li>
            <li>
              <b>Pointer-free</b> key and value types (<code>map[int64]int64</code>) make the whole backing store no-scan for the GC. <code>string</code> keys contain pointers.
            </li>
            <li>
              <b>
                <code>sync.Map</code>
              </b>{' '}
              is a concurrent hash trie since 1.24 (lock-free loads, per-node locks). Good for write-once/read-many or disjoint keys; otherwise a map + mutex, or sharding, is usually better.
            </li>
          </ul>
        </div>
      </Section>

      <Section id="puzzles" n="09" kicker="Test yourself" title="Map puzzles">
        <QuizList items={quiz} />
      </Section>

      <Section id="interview" n="10" kicker="Interview prep" title="Questions you will be asked">
        <Interview items={interview} prefix="maps" />
        <Sources>
          <p>
            Go 1.26.4 <code>internal/runtime/maps</code> (map.go, table.go, group.go, runtime*.go), <code>internal/abi/map.go</code>; Go 1.23 <code>runtime/map.go</code>; Michael Pratt,{' '}
            <a href="https://go.dev/blog/swisstable">Faster Go maps with Swiss Tables</a> (2025); <a href="https://go.dev/doc/go1.24">Go 1.24 release notes</a>;{' '}
            <a href="https://abseil.io/about/design/swisstables">Abseil SwissTable design notes</a>. Behavioural claims were run on go1.26.4 and go1.23.12.
          </p>
        </Sources>
      </Section>
      <NextTopic slug="maps" />
    </>
  )
}

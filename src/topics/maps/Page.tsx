import { Callout, Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { QuizList } from '../../components/Quiz'
import { Interview } from '../../components/Interview'
import { NextTopic, Sources, TopicHero } from '../../components/TopicShell'
import { ControlWordLab, SwissLab } from './SwissLab'
import { GrowthRace, OldMapLab } from './OldLab'
import { interview, quiz } from './content'
import { Story } from '../../components/Story'
import { controlPanel, deleteGrowSplit, gotchas, oldWay, smallMaps } from './stories'
import { GuidedMap } from './GuidedMap'
import './maps.css'

const toc = [
  { id: 'lockers', label: 'Lockers' },
  { id: 'panel', label: 'Control panel' },
  { id: 'small', label: 'Small maps' },
  { id: 'grow', label: 'Delete & grow' },
  { id: 'tour', label: 'Guided tours' },
  { id: 'basics', label: 'Map value' },
  { id: 'gotchas', label: 'Gotchas' },
  { id: 'sandbox', label: 'Sandbox' },
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
        lead="Go 1.24 threw out the bucket-and-overflow-chain map it had used since 1.0 and replaced it with an open-addressing Swiss table. Here it is as a hall of lockers — and every map trick question that falls out of it."
        toc={toc}
      />

      <Section id="lockers" n="01" kicker="The idea" title="Keys looking for lockers">
        <div className="prose">
          <p>
            A hash table is a hall of lockers. Each key is a hiker with a ticket (its hash) that says where to look. Press <b>Autoplay</b>: every story stops at the important moments and explains them.
            Press <b>OK, next</b> to go on.
          </p>
        </div>
        <div className="mp-scenes"><Story title="M1 · Open addressing, the old way" frames={oldWay} /></div>
      </Section>

      <Section id="panel" n="02" kicker="Go 1.24+" title="The control panel">
        <div className="mp-scenes"><Story title="M2 · Lights before doors" frames={controlPanel} /></div>
        <div className="prose">
          <p>
            In Go’s words: a <b>slot</b> is a locker, a <b>group</b> is 8 slots plus an 8-byte <b>control word</b> (the lights), a <b>table</b> is an array of groups (at most 1024 slots, at most 7/8
            full), and the <b>directory</b> points at tables. Key and value sit side by side in a slot.
          </p>
        </div>
      </Section>

      <Section id="small" n="03" kicker="≤ 8 entries" title="Small maps are one group">
        <div className="mp-scenes"><Story title="M0 · Small maps" frames={smallMaps} /></div>
      </Section>

      <Section id="grow" n="04" kicker="Deletion & growth" title="Delete, grow, split">
        <div className="mp-scenes"><Story title="M3 · Tombstones, doubling, splitting" frames={deleteGrowSplit} /></div>
      </Section>

      <Section id="tour" n="05" kicker="Guided tours" title="Watch the real map work">
        <div className="prose">
          <p>
            Four short runs of a tested model of <code>internal/runtime/maps</code>, with real hashing, probing, tombstones and splits. Each tour stops the <b>first</b> time something important happens:
            a fingerprint false alarm, a probe into the next group, a tombstone, a split. The chips show which cases you’ve seen. Tables are capped at <b>32 slots</b> here (the real cap is 1024), so
            splits happen after a few dozen keys.
          </p>
        </div>
        <GuidedMap />
      </Section>

      <Section id="basics" n="06" kicker="Mental model" title="A map value is a pointer">
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
          <Callout label="Why it’s fast">
            <p>
              Only lockers whose light matches (1 in 128 by chance) cost a real key comparison, and a search stops at the first group with an empty light. Result vs Go 1.23: up to 60% faster
              microbenchmarks and ~1.5% less CPU (geomean) on real programs.
            </p>
          </Callout>
        </div>
      </Section>

      <Section id="gotchas" n="07" kicker="Semantics" title="The rules that fall out of the design">
        <div className="mp-scenes"><Story title="Gotchas" frames={gotchas} /></div>
        <div className="prose">
          <ul>
            <li>
              <b>Interface keys</b> compile for any type but panic at runtime if the dynamic type isn’t comparable: <code>hash of unhashable type []int</code>.
            </li>
            <li>
              <b>Pointer-free</b> key and value types (<code>map[int64]int64</code>) make the whole backing store no-scan for the GC. <code>string</code> keys contain pointers. Keys or values over 128
              bytes are stored behind a pointer.
            </li>
            <li>
              <b>Mutating during range</b> is legal: a deleted, not-yet-seen key won’t be produced; an inserted key may or may not be. Growth mid-range is handled: the iterator keeps walking the old
              table and looks each key up in the live map.
            </li>
            <li>
              <b>
                <code>sync.Map</code>
              </b>{' '}
              is a concurrent hash trie since 1.24 (lock-free loads, per-node locks). Good for write-once/read-many or disjoint keys; otherwise a map + mutex, or sharding, is usually better.
            </li>
            <li>
              <b>
                <code>maps.Keys(m)</code>
              </b>{' '}
              returns an <code>iter.Seq</code>, not a slice: use <code>slices.Sorted(maps.Keys(m))</code>.
            </li>
          </ul>
        </div>
      </Section>

      <section className="section" id="sandbox">
        <div className="wrap">
          <span className="kicker red">Sandbox</span>
          <h2>Free-play labs</h2>
          <p className="prose" style={{ color: 'var(--g500)' }}>
            The full dashboards, for when the stories make sense and you want to poke at the bytes yourself: type your own keys, click a slot to delete it, change the table cap, step through the SWAR
            bit trick, or race the old map’s incremental growth against Swiss tables.
          </p>
          <details className="sandbox">
            <summary>Swiss map lab</summary>
            <div className="sandbox-body">
              <p className="prose">
                Try <b>+8 keys</b> then <b>+1 key</b> for the 9th-key conversion; at capacity 16, add 40 keys and delete some to see black <code>FE</code> tombstones.
              </p>
              <SwissLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Control word · SWAR bit trick</summary>
            <div className="sandbox-body">
              <p className="prose">
                The portable matcher XORs the control word with H2 in every byte, so matching bytes become zero, then flags zero bytes. A borrow can flag the byte just above a true match: a false positive
                the key compare catches.
              </p>
              <ControlWordLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Classic map (Go ≤ 1.23)</summary>
            <div className="sandbox-body">
              <p className="prose">
                <code>hmap</code> with <code>2^B</code> buckets of 8, a <code>tophash</code> byte per slot (top 8 hash bits; 0–4 reserved), chained overflow buckets, load factor 6.5, and a same-size grow
                to repack after heavy deletes.
              </p>
              <OldMapLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Growth race: incremental vs bounded</summary>
            <div className="sandbox-body">
              <GrowthRace />
            </div>
          </details>
        </div>
      </section>

      <Section id="puzzles" n="08" kicker="Test yourself" title="Map puzzles">
        <QuizList items={quiz} />
      </Section>

      <Section id="interview" n="09" kicker="Interview prep" title="Questions you will be asked">
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

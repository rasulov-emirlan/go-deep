import type { ReactNode } from 'react'
import type { Kind } from './tours'

/** Why-cards for every event the guided map tours can stop on. Facts: research/maps.md. */
export const why: Record<Kind, { title: string; body: ReactNode; edge?: boolean; chip: string }> = {
  'small-alloc': {
    chip: 'lazy alloc',
    title: 'make(map) allocates nothing yet',
    body: (
      <p>
        <code>make(map[string]int)</code> (or any size hint ≤ 8) builds only the 48-byte header. The first group is allocated on the first write. For a map that doesn’t escape, the compiler can put the
        header and first group on the stack.
      </p>
    ),
  },
  'small-hash': {
    chip: 'small: H2 only',
    title: 'a small map has one group, so H1 has nothing to pick',
    body: (
      <p>
        While a map has only ever held ≤ 8 entries it is a single group of 8 lockers: no table, no directory, no probing. The hash is still computed, but only its low 7 bits (<b>H2</b>, the fingerprint)
        matter.
      </p>
    ),
  },
  'small-insert': {
    chip: 'small insert',
    title: 'no match → take an empty locker',
    body: (
      <p>
        No light showed this fingerprint, so the key is new. It moves into the first empty locker and its light is set to its H2. A small map can use all 8 slots, because there is no probe sequence that
        needs an empty slot to stop.
      </p>
    ),
  },
  hit: {
    chip: 'H2 hit',
    title: 'one light matched → open that one door',
    body: (
      <p>
        All 8 lights (control bytes) are compared with H2 in one go: they’re one 64-bit word, and on amd64 it’s a couple of SSE2 instructions. Only lockers whose light matched get their key compared.
        Here the key is equal: found.
      </p>
    ),
  },
  'false-pos': {
    chip: 'false positive',
    title: 'the fingerprint matched, but it’s someone else',
    edge: true,
    body: (
      <p>
        H2 is only 7 bits, so there are 128 possible fingerprints and different keys share them all the time (about 1 in 128 per full slot). That’s why a light match is only a <em>maybe</em>: Go always
        compares the real key. Harmless, and rare: under 1/8 of an extra compare per lookup even at high load.
      </p>
    ),
  },
  'small-miss': {
    chip: 'small miss',
    title: 'no key in the one group → not in the map',
    body: <p>A small map has nowhere else to look. When no light matches (or every match was a false alarm), the answer is “not found” after exactly one group compare.</p>,
  },
  update: {
    chip: 'update',
    title: 'the key exists → overwrite in place',
    body: (
      <p>
        Assigning to an existing key finds it by the same lookup and overwrites the value. <code>len</code> doesn’t change. For some key types (floats, strings) the stored <em>key</em> is overwritten
        too: <code>m[0.0]</code> then <code>m[-0.0]</code> leaves one entry whose key is <code>-0</code>.
      </p>
    ),
  },
  'small-delete': {
    chip: 'small: no tombstone',
    title: 'small maps never leave tombstones',
    body: <p>Tombstones exist to keep probe chains unbroken, and a small map has no probe chain. So a deleted slot simply becomes empty again. The value is always zeroed.</p>,
  },
  'to-table': {
    chip: '9th key → table',
    title: 'the 9th key: one group becomes a real table',
    body: (
      <>
        <p>
          The group is full, so Go allocates a <b>16-slot table</b> (2 groups), puts it behind a 1-entry <b>directory</b>, re-inserts all 8 keys, and then inserts the new one. From now on H1 picks the
          starting group.
        </p>
        <p>
          Quirk: this happens when a small map holding 8 entries gets <em>any</em> write, even an overwrite of an existing key (a TODO in <code>map.go</code>).
        </p>
      </>
    ),
  },
  hash: {
    chip: 'H1 / H2',
    title: 'one hash, three jobs',
    body: (
      <p>
        The 64-bit hash is split: the <b>top bits</b> pick the table through the directory, <b>H1</b> (<code>hash &gt;&gt; 7</code>) picks the starting group, and <b>H2</b> (the low 7 bits) is the
        fingerprint on the lights. The hash is seeded per map, so every map puts keys in different places.
      </p>
    ),
  },
  'place-empty': {
    chip: 'insert',
    title: 'insert = look up first, then take an empty locker',
    body: (
      <p>
        An insert is a lookup that didn’t find the key. It stops at the first group with an empty light and moves in there. That uses up one unit of <code>growthLeft</code> (the table may only get 7/8
        full).
      </p>
    ),
  },
  'probe-next': {
    chip: 'probe next group',
    title: 'group full, no match → try the next group',
    body: (
      <p>
        A group with no empty light can’t prove the key is absent: it might have been pushed further along. So the hiker walks on. The order is <em>triangular</em>: +1, +2, +3… groups from the start
        (mod table size), which on a power-of-two table visits every group exactly once.
      </p>
    ),
  },
  miss: {
    chip: 'miss at empty',
    title: 'an empty light ends the search',
    body: (
      <p>
        If the key existed, the insert that placed it would have stopped here, at this empty slot, and not gone further. So one empty light proves “not in the map”. It’s also why a table is never allowed
        to fill up completely: every search needs somewhere to stop.
      </p>
    ),
  },
  'delete-empty': {
    chip: 'delete → empty',
    title: 'this group still had a free locker → plain empty',
    body: (
      <p>
        A group with an empty slot stops every search, so no key was ever pushed <em>past</em> it. Emptying this slot can’t break anyone’s path. It becomes empty, and <code>growthLeft</code> goes back
        up by one.
      </p>
    ),
  },
  'delete-tomb': {
    chip: 'delete → tombstone',
    title: 'the group was full → leave a tombstone (0xFE)',
    body: (
      <p>
        Some key may have found this group full and been pushed on to a later group. If this slot became <em>empty</em>, searches for that key would stop here and wrongly report “not found”. A tombstone
        says “nobody lives here, but keep walking”. It does <b>not</b> give <code>growthLeft</code> back.
      </p>
    ),
  },
  'past-tomb': {
    chip: 'walk past tombstone',
    title: 'this is what the tombstone is for',
    edge: true,
    body: <p>This group has a tombstone but no empty light, so the search can’t stop here: the key may have been pushed past this group back when it was full. It walks on to the next group. If the deleted slot had become empty instead, the search would stop right here and could miss a key that does exist.</p>,
  },
  'reuse-tomb': {
    chip: 'reuse tombstone',
    title: 'inserts recycle the first tombstone they passed',
    body: (
      <p>
        The insert remembered the first tombstone on its path, but it still had to walk on to an empty light to be sure the key wasn’t already further along. Only then does it move into the tombstone. This
        costs no <code>growthLeft</code>.
      </p>
    ),
  },
  prune: {
    chip: 'prune tombstones',
    title: 'table “full”, but some of it is tombstones → prune',
    edge: true,
    body: (
      <p>
        Tombstones count toward the 7/8 limit, so this table has no growth left. Before growing, Go tries <code>pruneTombstones</code>: if tombstones are ≥ 10% of the slots, it traces every key’s probe
        path, and turns tombstones that no path walks past back into empty slots. It only does it if that frees ≥ 10%. Otherwise it grows.
      </p>
    ),
  },
  'prune-fail': {
    chip: 'prune failed',
    title: 'the tombstones are still needed → grow instead',
    edge: true,
    body: <p>Every tombstone lies on some key’s probe path, so none can be freed. The table grows, which drops all tombstones anyway.</p>,
  },
  double: {
    chip: 'double at 7/8',
    title: '7/8 full → a new table twice the size',
    body: (
      <p>
        The table hit its load limit (7/8 of slots, counting tombstones). Go allocates a table twice as big, re-inserts every key (tombstones are dropped), and swaps it into the directory, all at once in
        this one insert. Tables double 16 → 32 → … up to <b>1024</b> slots.
      </p>
    ),
  },
  split: {
    chip: 'split at max',
    title: 'at max size a table splits in two',
    body: (
      <p>
        This table is already at max capacity (32 here, <b>1024</b> for real), so it doesn’t double. It <b>splits</b>: two new max-size tables, and each key goes left or right by one more bit from the{' '}
        <em>top</em> of its hash. That’s extendible hashing. So one insert never copies more than 1024 slots (≈ 896 keys), however big the map is.
      </p>
    ),
  },
  'dir-double': {
    chip: 'signpost doubles',
    title: 'the directory (signpost) doubles',
    body: (
      <p>
        The split table was already using every bit the directory reads (its <code>localDepth</code> = <code>globalDepth</code>). So the directory doubles first: every entry is copied into two
        neighbours, and only the split table’s pair gets the two new tables. Other tables now fill 2 entries each.
      </p>
    ),
  },
  'split-no-dir': {
    chip: 'split, same signpost',
    title: 'a table on 2 signpost entries splits without doubling',
    edge: true,
    body: (
      <p>
        This table used fewer bits than the directory (<code>localDepth</code> 1 &lt; <code>globalDepth</code> 2), so it already had 2 directory entries. After the split each new table takes one of them.
        The directory stays the same size.
      </p>
    ),
  },
}

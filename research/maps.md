# Go maps, internals and gotchas (research notes)

Research for the go-senior learning site. Primary source: the local Go **1.26.4** tree
(`/usr/local/go/src/internal/runtime/maps/*`). The classic map comes from
**Go 1.23.0 `src/runtime/map.go`**, fetched from `raw.githubusercontent.com/golang/go/go1.23.0/src/runtime/map.go`.
Claims marked **[verified]** were run on this box with go1.26.4 and go1.23.12 (the test program
was in `/tmp/mapx`).

Sources:
- S1 `internal/runtime/maps/map.go`: design comment, `Map`, `NewMap`, `PutSlot`, `Delete`, `Clear`, `growToSmall`, `growToTable`, `installTableSplit`, `mapKeyError`
- S2 `internal/runtime/maps/table.go`: `table`, `maxTableCapacity`, `maxGrowthLeft`, `PutSlot`, `Delete`, `pruneTombstones`, `rehash`, `grow`, `split`, `probeSeq`, `Iter.Init/Next/nextDirIdx/grownKeyElem`
- S3 `internal/runtime/maps/group.go`: `ctrlEmpty/ctrlDeleted`, `bitset`, `ctrlGroupMatchH2/Empty/EmptyOrDeleted/Full`, `groupReference`
- S4 `internal/runtime/maps/runtime.go`: `runtime_mapaccess1/2`, `runtime_mapassign` (plus `runtime_fast32/64/faststr.go` specializations)
- S5 `internal/abi/map.go`: `MapGroupSlots=8`, `MapMaxKeyBytes=MapMaxElemBytes=128`, `MapType` flags (`NeedKeyUpdate`, `HashMightPanic`, `IndirectKey`, `IndirectElem`)
- S6 `cmd/compile/internal/ssagen/intrinsics.go`, around line 1337: amd64 intrinsics for `ctrlGroupMatchH2` and friends (PCMPEQB + PMOVMSKB, with a VPBROADCASTB/PSHUFB broadcast depending on GOAMD64)
- S7 Go 1.23 `runtime/map.go`: `hmap`, `bmap`, `mapextra`, `tophash`, `mapassign`, `mapdelete`, `hashGrow`, `overLoadFactor`, `tooManyOverflowBuckets`, `growWork`, `evacuate`, `advanceEvacuationMark`, `mapiterinit/mapiternext`, `mapclear`, `makeBucketArray`
- S8 Michael Pratt, "Faster Go Maps with Swiss Tables", go.dev/blog/swisstable, 2025-02-26
- S9 Go 1.24 release notes, go.dev/doc/go1.24 (Runtime section and `sync`)
- S10 Abseil, "SwissTables design notes", abseil.io/about/design/swisstables
- S11 `internal/sync/hashtriemap.go` and `sync/map.go` (1.26)
- S12 Go spec: "For statements with range clause", "Map types", "Index expressions", and `clear`

---

## 1. Timeline

| Version | Change |
|---|---|
| Go 1.0 to 1.23 | Bucket-based chained-overflow hashmap (`runtime/map.go`, `hmap`/`bmap`). |
| Go 1.12 | `fmt` prints maps in sorted key order. Iteration order itself stays random. |
| Go 1.21 | `clear(m)` builtin. `maps` package (`Clone`, `Copy`, `Equal`, `DeleteFunc`...). |
| Go 1.23 | `maps.All/Keys/Values/Insert/Collect` iterators (`iter.Seq`). |
| **Go 1.24** | **Swiss Table map** (`internal/runtime/maps`), opt-out via `GOEXPERIMENT=noswissmap`. The release notes credit the new map, together with allocator and mutex changes, for about 2–3% lower CPU overhead on average (S9). **`sync.Map` reimplemented on `HashTrieMap`**, opt-out via `GOEXPERIMENT=nosynchashtriemap` (S9). |
| Go 1.25 / 1.26 | The 1.26 tree has no `noswissmap` experiment flag and no old map files. The Swiss map is the only implementation. Neither release note mentions maps. |

S8 reports microbenchmarks up to **60% faster** than 1.23 and about **1.5% geomean CPU** on real application benchmarks.

---

## 2. Classic map (Go ≤1.23), S7

### Structures
```go
type hmap struct {            // 48 bytes on 64-bit
    count     int             // len(m); must be first (len builtin reads it)
    flags     uint8           // iterator=1, oldIterator=2, hashWriting=4, sameSizeGrow=8
    B         uint8           // log2(#buckets)
    noverflow uint16          // approx # overflow buckets
    hash0     uint32          // per-map hash seed
    buckets    unsafe.Pointer // [2^B]bmap
    oldbuckets unsafe.Pointer // previous half-size array while growing
    nevacuate  uintptr        // evacuation progress
    extra *mapextra           // overflow bucket keep-alive, nextOverflow
}
type bmap struct { tophash [8]uint8 /* then 8 keys, then 8 elems, then *overflow */ }
```
- **Bucket selection** uses the **low B bits** of the hash (`hash & bucketMask(B)`).
- **tophash** is the **top 8 bits** of the hash. Values 0–4 are reserved markers (`emptyRest=0`, `emptyOne=1`, `evacuatedX=2`, `evacuatedY=3`, `evacuatedEmpty=4`), so `tophash()` adds `minTopHash` (5) to any computed value below 5.
- **Layout**: all 8 keys, then all 8 elems. This avoids padding, e.g. for `map[int64]int8`. An overflow pointer ends the bucket.
- **Keys or elems larger than 128 bytes** are stored indirectly as a pointer (`MapMaxKeyBytes`/`MapMaxElemBytes`). This is still true in 1.24+.
- If key and elem contain no pointers, the bucket type is marked pointer-free and GC never scans it. Overflow buckets are then kept alive through `hmap.extra.overflow`.

### Load factor 6.5
`loadFactorNum/Den = 13/2`. `overLoadFactor(count, B)` is `count > 8 && count > 6.5·2^B`. The comment table in the source justifies 6.5: about 20.9% of buckets have overflow, 10.79 overhead bytes per entry, 4.25 hit probes and 6.5 miss probes, all at maximum load.

### Overflow buckets
Once 8 entries share a bucket, `newoverflow` chains another bucket. `makeBucketArray` preallocates `2^(B-4)` extra overflow buckets when B ≥ 4.

### Growth (`hashGrow`) is triggered on insert of a new key when not already growing
1. **Doubling** happens if `overLoadFactor(count+1, B)`. It sets `B++` and moves the current array to `oldbuckets`.
2. **Same-size grow** happens if `tooManyOverflowBuckets`, meaning `noverflow ≥ 2^min(B,15)`. For large B, `incrnoverflow` counts probabilistically. This case covers maps with lots of delete churn that are left sparse with long overflow chains. It re-packs them without changing size.
3. Growth is **incremental**. `hashGrow` only allocates. Each later `mapassign`/`mapdelete` calls `growWork`, which evacuates (a) the old bucket the operation is about to touch and (b) one more bucket at `nevacuate`. So each write moves at most 2 buckets, and `advanceEvacuationMark` scans ahead at most 1024 buckets.
4. **evacuate** splits old bucket `i` into new buckets `x=i` and `y=i+2^oldB` using `hash & newbit`. Old tophashes become `evacuatedX/Y/Empty` markers.
   - NaN keys with an active iterator are a special case. Their hash is not reproducible, so the X/Y choice comes from `tophash & 1`.
5. Lookups during growth check `oldbuckets` first if the old bucket is not yet evacuated.

### Deletion
Deletion sets `emptyOne`. If the slot is followed only by empties, a back-sweep converts the trailing `emptyOne`s to `emptyRest`, which lets lookups stop early.

### Iteration
`mapiterinit` picks a random `startBucket` and a random intra-bucket `offset` (0–7). `mapiternext` walks the buckets and wraps around. If a grow started after the iterator did, it walks `oldbuckets` and filters to keys that belong to the current new bucket (`checkBucket`).

### Hash seed
`hash0` is re-randomized when count drops to 0 on delete and on `clear` (issue 25237, which hardens against hash flooding).

---

## 3. Swiss Table map (Go 1.24+), S1–S6

### 3.1 Vocabulary (S1 top comment)
- **Slot**: one key/elem pair.
- **Group**: 8 slots (`abi.MapGroupSlots`) plus one **8-byte control word**, with one control byte per slot.
- **Table**: a complete open-addressing Swiss table. Capacity is a power of two, **at most 1024 slots** (`maxTableCapacity`, S2). The source comment calls the value "completely made up" and marks it for tuning.
- **Directory**: an array of `*table` of length `1<<globalDepth`, indexed by the **top `globalDepth` bits** of the hash.
- **H1** = `hash >> 7`, the upper 57 bits. It picks the starting group (`h1 & lengthMask`) and drives probing.
- **H2** = `hash & 0x7f`, the lower 7 bits. It is stored in the control byte.

Note the contrast with the old map, which used low hash bits for the bucket and the top 8 bits for tophash. The Swiss map uses the lowest 7 bits for H2, H1 & mask (bits 7 and up) for the group, and the **top** bits for the directory.

### 3.2 Header (`maps.Map`, 48 bytes on 64-bit)
```go
type Map struct {
    used        uint64         // len(); must be first
    seed        uintptr        // per-map random hash seed
    dirPtr      unsafe.Pointer // *[dirLen]*table   OR  *group (small map)
    dirLen      int            // 0 => small map
    globalDepth uint8          // bits used for directory index
    globalShift uint8          // 64 - globalDepth
    writing     uint8          // XOR-toggled write flag (race detection)
    tombstonePossible bool
    clearSeq    uint64         // bumped by clear(); iterators detect it
}
type table struct {
    used, capacity, growthLeft uint16  // capacity ≤ 1024 fits uint16
    localDepth uint8
    index      int             // first directory index; -1 = stale (replaced)
    groups     groupsReference // {data, lengthMask}
}
```
A group in memory is `{ ctrl uint64; slots [8]struct{key K; elem V} }`. **Key and elem are interleaved**, the opposite of the old bucket layout. The source has a TODO noting that this wastes space for types like `map[uint8]uint64` (S2 comment on `groups`).

### 3.3 Control bytes (S3)
```
empty:   1000_0000  (0x80)  ctrlEmpty
deleted: 1111_1110  (0xFE)  ctrlDeleted  (tombstone)
full:    0hhh_hhhh          low 7 bits = H2
```
The top bit set means "not full". `bitsetEmpty = 0x8080808080808080` is an all-empty group. A single `setEmpty()` initializes a whole group.

### 3.4 Group matching (SWAR and SIMD)
The portable path does SWAR on the 64-bit word (S3):
```go
// matchH2: bytes equal to h2 → 0x80 in that byte
v := ctrl ^ (0x0101010101010101 * h2)
match := ((v - 0x0101010101010101) &^ v) & 0x8080808080808080
// matchEmpty: bit7 set and bit1 clear
(v &^ (v << 6)) & 0x8080808080808080
// matchEmptyOrDeleted: v & 0x8080...;  matchFull: ^v & 0x8080...
```
- `first()` is `TrailingZeros64(b) >> 3` and `removeFirst()` is `b & (b-1)`.
- The SWAR matchH2 can give **false positives**, e.g. ctrl `0x0302` with h=2. They are harmless because the key is always compared.
- On amd64, the compiler **intrinsifies** these functions with SSE2 `PCMPEQB`+`PMOVMSKB`. The broadcast uses `PSHUFB` at GOAMD64=v2 and `VPBROADCASTB` at v4. On amd64 the bitset is then packed at **1 bit per slot** instead of 1 byte (S3 `bitset` doc, S6).
- Abseil uses **16-slot** groups with SSE2. Go uses 8, so the control word fits a GPR. S8 lists 16-slot groups and more SIMD as future work.
- The false-match rate per full slot is 1/128. Measurements show fewer than 1/8 extra key comparisons per lookup even at high load (S2 `getWithKey` comment).

**Worked example** (for the visualizer). Hash `0x9E3779B97F4A7C15` gives:
- `h2 = 0x15` (0010101) and `h1 = 0x13c6ef372fe94f8`.
- With 16 groups the probe sequence is **8, 9, 11, 14, 2, 7…**. With 4 groups it is 0, 1, 3, 2.
- The directory index is 1 at globalDepth 1, 2 at depth 2, and 4 at depth 3.
- Control word `0x8080801580802a80` (slot0 = LSB) gives matchH2 = `0x0000008000000000`, so first() = **slot 4**. matchEmpty = `0x8080800080800080`, so slots 1 and 4 are full.

### 3.5 Probing (S2 `probeSeq`)
- The sequence is triangular (quadratic): `p(i) = h1 + (i²+i)/2 mod nGroups`.
- Because nGroups is a power of two, the sequence **visits every group exactly once**.
- A **lookup stops** when it finds the key or when a group has **any empty** slot. Deleted slots do not stop probing.
- The invariant that makes this safe is that a table is never 100% full.

### 3.6 Insert, `table.PutSlot` (S2)
1. Probe. In each group, check matchH2 candidates for key equality. On a hit, overwrite the key if `NeedKeyUpdate` (e.g. float ±0, strings) and return the elem slot.
2. Remember the **first tombstone** seen. Keep probing until a group has an empty slot, then insert into the remembered tombstone if there was one (it doesn't consume `growthLeft`), otherwise into the empty slot.
3. If `growthLeft == 0`, first try `pruneTombstones`. That runs only when tombstones are at least 10% of capacity and at least 10% can be reclaimed. It traces every key's probe path and frees tombstones no path needs. If that fails, call `rehash` and return `ok=false`, and `Map.PutSlot` retries in a loop because the directory may have changed.

### 3.7 Load factor 7/8 (`maxAvgGroupLoad=7`, S3)
- `maxGrowthLeft = capacity·7/8`.
- The special case is a **single-group table**, whose limit is `capacity-1`. One empty slot must terminate probes (issue 54766).
- Tombstones count against growthLeft: `tombstones() = cap·7/8 − used − growthLeft`.

### 3.8 Small-map optimization (S1)
- If the map has only ever held **≤8 entries**, `dirLen==0` and `dirPtr` points directly at **one group**. There is no table and no directory.
- Lookups do one matchH2 with no probing.
- The group can use all 8 slots because there is no probe sequence.
- A small map **never has tombstones**. `deleteSmall` sets slots straight back to empty.
- `make(map[K]V)` and `make(m, n≤8)` allocate **nothing** until the first write (`NewMap`/`NewEmptyMap`; `growToSmall` runs on first Put). The compiler may place the Map header and the first group on the stack for a non-escaping map.
- The **9th distinct key** triggers `growToTable`: a 16-slot table (2 groups, growthLeft 14), a 1-entry directory, and globalDepth 0. A TODO notes that this also grows on updates of existing keys when the map is full.

### 3.9 Growth: `table.rehash` (S2)
- **newCap = 2·cap ≤ 1024**: `grow` allocates one bigger table, reinserts every full slot (`uncheckedPutSlot`, no tombstones), replaces it in the directory, and marks the old table `index=-1` (stale).
- **Otherwise**: `split` creates two new tables of 1024 capacity each at `localDepth+1` and routes each key by the hash bit `1<<(64-localDepth)`. This is extendible hashing.
- `installTableSplit`: if `old.localDepth == globalDepth`, the **directory doubles**. Every entry is duplicated to `2i`/`2i+1` and globalDepth goes up by one. Left and right are then installed. A table with localDepth < globalDepth occupies `1<<(globalDepth-localDepth)` consecutive entries.
- **There is no incremental evacuation anymore.** No `oldbuckets`, no `growWork`, no evacuation markers. One table grows all at once, but each table holds at most 1024 slots, so the worst-case pause for one insert is bounded to rehashing about 896 entries. That bound replaces the old amortized bucket-at-a-time move (S8).
- **There is no same-size grow.** Tombstone buildup is handled by `pruneTombstones`, or by growing, which drops tombstones. Abseil's in-place rehash is not used because it would reorder slots under live iterators (S2 `rehash` TODO).
- **Capacity sequence** for one map: small (8) → 16 → 32 → … → 1024 → split into 2×1024 → more splits and directory doublings.
- `make(map, hint)` with hint > 8 (`NewMap`): targetCapacity = hint·8/7, and `dirSize = ceil(target/1024)` rounded up to a power of two. It preallocates `dirSize` tables of about `target/dirSize` slots each. Hints that would overflow or exceed maxAlloc silently return an empty map.

### 3.10 Deletion (S2 `table.Delete`)
- The key is cleared only if it has pointers. The **elem is always cleared**, because compound assignment `m[k] op= v` relies on zeroed deleted values (issue 25936).
- If the group still **has an empty slot**, the slot becomes empty and `growthLeft++`. Otherwise it becomes a **tombstone** (`ctrlDeleted`), because it may sit in the middle of another key's probe chain.
- `Map.Delete` sets `tombstonePossible`. When `used` reaches 0, the **seed is re-randomized**.

### 3.11 clear() (S1 `Map.Clear`, S2 `table.Clear`)
- `clear` zeroes groups and resets control words. It zeroes group-by-group and skips groups with no full slot when the table is sparse or slots exceed 32 bytes.
- It resets `used`, `growthLeft`, and tombstones, increments `clearSeq`, and re-randomizes `seed`.
- **It does not free or shrink tables or the directory** ("TODO: shrink directory?").
- `clear` is the only way to remove NaN keys.

### 3.12 Iteration (S2 `Iter`)
- Randomization comes from `entryOffset` (a random start slot within each table, wrapping) and `dirOffset` (a random start table). Groups and slots are walked **linearly** from the offset.
- For a **small map**, order is a **cyclic rotation** of slot order. **[verified]** With `{1..5}` inserted in order, runs printed `51234`, `12345`, `34512`, i.e. rotations only.
- **Growth during iteration**: the iterator keeps a pointer to the **old table** (`it.tab`, now `index==-1`) and keeps choosing keys from it, which avoids duplicates. For each key it does a fresh lookup in the live map (`grownKeyElem`) to get the latest value or skip deleted keys.
  - Keys that don't compare equal to themselves (NaN) can't be looked up. They are returned from the old slot if `clearSeq` is unchanged.
  - Keys inserted only into the replacement table are not returned. The spec allows either.
- After finishing a split table, `nextDirIdx` skips `1<<(globalDepth-localDepth)` entries. If the directory doubled mid-iteration, `dirIdx` and `dirOffset` are shifted left (`<<= orders`).
- A small map that grew mid-iteration keeps iterating its original 8-slot group. **[verified]** A 3-entry map with `m[k+100]=true` inside `range` yields between 3 and 8 iterations and never more (distribution over 1000 runs: 3:131, 4:117, 5:120, 6:127, 7:130, 8:375; Go 1.23 was similar).
- `Next` panics with `fatal("concurrent map iteration and map write")` if `writing` is set.

### 3.13 Concurrency detection
- Before each write, `m.writing != 0` means `fatal("concurrent map writes")`. Then `writing ^= 1`, do the work, check it is still set, and toggle back. XOR (instead of set/clear) raises the odds that **both** racers notice.
- Reads check `writing` and raise `fatal("concurrent map read and map write")`.
- This is **best effort** and non-atomic, so it can miss races. It is `fatal`, **not a panic**, and cannot be recovered. **[verified]** A deferred `recover()` did not stop `fatal error: concurrent map writes`. `-race` is the real detector (S4 calls race hooks).
- Classic map: the same logic with `h.flags & hashWriting` (S7).

### 3.14 Hashing
- `typ.Hasher(key, seed)`. On amd64 with AES-NI this is AES-based `aeshash`. The fallback is wyhash (`runtime/hash64.go`, `alg.go useAeshash`). Wasm uses a 32-bit hash.
- Interface keys whose dynamic type isn't comparable panic with `runtime error: hash of unhashable type []int` (`mapKeyError`, `unhashableTypeError`). **[verified]**
- `m[k]` and `delete` on a nil or empty map still run `mapKeyError`, so an unhashable key panics even there (issue 23734).

---

## 4. Old map vs Swiss map, side by side

| | ≤1.23 bucket map | 1.24+ Swiss map |
|---|---|---|
| Unit | bucket: 8 tophash + 8 keys + 8 elems + overflow ptr | group: 8-byte ctrl + 8 interleaved slots |
| Collision handling | chaining via overflow buckets | open addressing, quadratic probing over groups |
| Per-slot metadata | tophash = top 8 bits (values 0–4 reserved) | ctrl = 1 state bit + H2 (low 7 bits) |
| Slot selection | low B bits → bucket | H1 → group; top bits → directory/table |
| Max load | 6.5/8 ≈ 81% per bucket average | 7/8 = 87.5% |
| Grow | whole array doubles, **incremental evacuation** (2 buckets/write) | per-table rehash, all at once, bounded by 1024 slots; split with extendible hashing |
| Sparse after deletes | same-size grow | tombstone pruning, or grow |
| Delete | emptyOne/emptyRest | empty if group has an empty slot, else tombstone |
| Small maps | 1 bucket, lazily allocated | ≤8 entries: single group, no table/directory, lazy |
| Iteration start | random bucket + random offset 0–7 | random dirOffset + random entryOffset |
| Memory, `map[int64]int64` 1M entries **[verified]** | 38.3 B/entry | 36.1 B/entry |
| Shrinks? | never | never |

---

## 5. Common properties senior devs must know

1. **The map value is a pointer** (`*hmap` / `*maps.Map`). Passing a map copies the pointer, so mutations are visible to callers. It is not a reference type in the spec's sense, but it behaves like one. `m = nil` inside a function doesn't affect the caller.
2. **nil map**: reads, `len`, `delete`, `range`, and `clear` are fine. **Writes panic** with `assignment to entry in nil map`. **[verified]**
3. **You cannot take `&m[k]`**. The compile error is `cannot take address of m["a"]`. Elements move on grow or split, so the address would dangle. The same reason blocks `m[k].f = v` (`cannot assign to struct field m["a"].X in map`) **[verified]**. The fixes are `map[K]*T`, or read–modify–write: `p := m[k]; p.X = 2; m[k] = p`.
4. **`m[k]++`, `m[k] += x`, and `m[k] = append(m[k], v)` work**. They compile to a lookup plus an assign, and a missing key yields the zero value.
5. **Iteration order is unspecified and deliberately randomized** on every `range`. `fmt.Print`, `json.Marshal` (for string or integer keys), and `slices.Sorted(maps.Keys(m))` give sorted output.
6. **Mutating during range** (spec): deleting a key not yet reached means it won't be produced. An inserted key **may or may not** be produced. Each entry is produced at most once. `for k := range m { delete(m, k) }` is legal and correct, but `clear(m)` is faster.
7. **NaN keys**: `NaN != NaN`, so every `m[NaN]=v` inserts a **new** entry. Such an entry can't be read or `delete`d, only seen via `range` or removed by `clear`. **[verified]** Two inserts give `len==2`, lookup is false, and `delete` leaves `len==2`.
8. **+0.0 and −0.0 are the same key**. Overwriting updates the **stored key** as well (`NeedKeyUpdate`). **[verified]** `z[0.0]="pos"; z[-0.0]="neg"` leaves one entry with key `-0` and value "neg".
9. **Key types must be comparable**. Slices, maps, and funcs are compile errors. Interface keys (`any`) compile but **panic at runtime** if the dynamic type isn't comparable. Structs or arrays containing interfaces carry the same risk.
10. **Maps never shrink.** **[verified]** With 1M entries of `[128]byte` values the heap is 287 MB. Deleting all of them leaves 287 MB with len 0, and `clear` still leaves 287 MB. Only dropping the map (`m = nil` or a new map) frees it. The fix is to copy survivors into a fresh `make(map, len(old))` periodically. `maps.Clone` preserves the source's allocated capacity.
11. **Large values**: keys or values over 128 bytes are boxed individually, which means extra allocation and GC work. `map[K]*Big` versus `map[K]Big` is a real trade-off.
12. **Pointer-free keys and values** (e.g. `map[int64]int64`) make the backing arrays no-scan for the GC. `string` keys contain pointers, so their maps get scanned.
13. **Sizing hint**: `make(map[K]V, n)` preallocates for n entries with no rehash on the way to n. It is not a cap and has no effect on `len`. Too large a hint wastes memory. A hint of 8 or less allocates nothing up front.
14. **Not safe for concurrent use.** Multiple readers are fine. Any writer concurrent with another access needs a `sync.Mutex`/`RWMutex`, a `sync.Map`, or sharding. Detection is best effort and fatal.
15. **`clear(m)` vs a delete loop vs `m = make(...)`**: `clear` is O(capacity), keeps the allocation, and removes NaNs. A delete loop can't remove NaNs and leaves tombstones. Reallocating frees the memory (after GC) but other holders of the old map keep the old one.
16. **Hash flooding protection**: the per-map random seed is re-rolled whenever the map becomes empty and on clear.
17. **`sync.Map`**:
    - Before 1.24 it used a read-only `atomic` map plus a mutex-protected dirty map, with a misses counter that promoted dirty to read.
    - Since **1.24** it is a thin wrapper over `internal/sync.HashTrieMap[any,any]` (S11). That is a concurrent **hash trie with 16-way nodes** (`nChildrenLog2=4`), consuming hash bits from the top. Lookups are lock-free atomic loads. Writers lock only the **parent indirect node's mutex**, and a `dead` flag handles concurrent node removal. It also uses the builtin map's `Hasher`.
    - Per S9 this gives better modification performance, less contention on disjoint keys, and no warm-up (there's no read/dirty promotion). The same structure backs the `unique` package.
    - Use it only for write-once/read-many caches or disjoint key sets. It is untyped (`any`), and `Range` is not a snapshot.
18. **`maps.Keys` / `maps.Values`** (1.23+) return `iter.Seq`, **not slices**. Use `slices.Collect(maps.Keys(m))`. The `x/exp/maps` versions returned slices, which is an interview trap.
19. **The `reflect` / `unsafe` world**: never linkname into the map runtime. The runtime's "hall of shame" comments list libraries (sonic, ugorji, gonum…) that pin old signatures.

---

## 6. Interview questions (crisp answers)

1. **What does `m := map[string]int{}; m["a"]++; fmt.Println(m["a"], len(m))` print?**
   `1 1`. A missing key reads as zero, and `++` stores the result.

2. **What does `var m map[string]int; fmt.Println(m["x"], len(m)); m["x"] = 1` do?**
   It prints `0 0`, then panics with `assignment to entry in nil map`.

3. **Why is `&m[k]` illegal?**
   Growth moves elements (rehash or split in 1.24+, evacuation before that), so the pointer would dangle. Map elements are not addressable.

4. **`type P struct{X int}; m := map[string]P{"a":{}}; m["a"].X = 1`: does it compile?**
   No, "cannot assign to struct field m["a"].X in map". Use `map[string]*P` or copy, modify, and store back.

5. **What does this print?**
   ```go
   m := map[float64]int{}
   m[math.NaN()] = 1; m[math.NaN()] = 2
   _, ok := m[math.NaN()]
   delete(m, math.NaN())
   fmt.Println(len(m), ok)
   ```
   `2 false`. Only `clear(m)` or a new map removes them.

6. **`m := map[float64]string{}; m[0.0]="pos"; m[math.Copysign(0,-1)]="neg"`: what are len, key, and value?**
   `1`, key `-0`, value `"neg"`. ±0 compare equal and the stored key is updated on overwrite.

7. **Is Go map iteration order random?**
   It is unspecified, and the runtime **randomizes the start** per range. It is not a uniform shuffle. Small maps (≤8) iterate as a rotation of slot order, so `{1..5}` gives e.g. `34512` but never `21534`.

8. **You insert during range over a 3-element map. How many iterations?**
   Nondeterministic. New keys may or may not be visited. In practice (1.24+ small map) it is between 3 and 8, and it never loops forever here, because the iterator keeps walking the original 8-slot group after the map grows.

9. **Is deleting during range safe?**
   Yes. A deleted, not-yet-visited entry won't be produced. Deleting the current key is fine.

10. **What's the difference between a "concurrent map writes" crash and a panic?**
    It's a `fatal` throw. It cannot be `recover`ed and kills the process. Detection is best-effort via the `writing` flag (`hashWriting` before 1.24). Use `-race` to find the bug reliably.

11. **Are concurrent reads safe?**
    Yes, provided nothing writes concurrently, including `delete` and `clear`.

12. **I deleted all 1M entries but RSS didn't drop. Why?**
    Maps never shrink. Tables, groups, and the directory stay allocated, and `clear` also retains them. Reallocate: `m = make(map[K]V, len(m))` plus a copy.

13. **What load factor triggers growth?**
    Before 1.24: average 6.5 entries per 8-slot bucket, or overflow buckets ≥ bucket count, which triggers a same-size grow. 1.24+: 7/8 of slots per table, counting tombstones, after trying tombstone pruning.

14. **Explain incremental growth pre-1.24.**
    `hashGrow` allocates 2× buckets and keeps `oldbuckets`. Every assign or delete evacuates the target old bucket plus one more (`growWork`). Old bucket i splits into i and i+2^oldB by one hash bit. Lookups consult the old buckets until they are evacuated.

15. **How does 1.24+ avoid big pauses without incremental evacuation?**
    It caps tables at 1024 slots. Growing a map means growing or splitting a single table (≤1024 slots of work). A directory indexed by the top hash bits (extendible hashing) routes keys to tables.

16. **What are H1 and H2?**
    H1 is the upper 57 bits and selects the starting group and probe sequence. H2 is the low 7 bits and lives in the control byte for 8-way parallel filtering. A false-positive H2 match (1/128) is resolved by the key compare.

17. **Why tombstones? Why not just mark a slot empty on delete?**
    An empty slot terminates lookups. If the group was full, some key may have probed past it, and marking it empty would make that key unfindable. If the group still has an empty slot, nothing probed past it, so the slot is marked empty directly.

18. **What happens with extendible hashing when the directory doubles?**
    A table splits with `localDepth == globalDepth`. The directory doubles, every pointer is duplicated, and only the split table's two entries get new tables. Other tables now span 2 entries (localDepth < globalDepth).

19. **Does `make(map[int]int, 1000)` change `len`?**
    No. It sizes storage for about 1000 entries without rehash. A hint of 8 or less allocates nothing until the first write.

20. **Which key types are allowed?**
    Any comparable type. Slice, map, and func keys are compile-time errors. For `map[any]T` the error is a runtime panic: `hash of unhashable type []int`. The same goes for structs containing interface fields holding unhashables.

21. **Map passed to a function which does `m["x"]=1` and then `m = nil`: what does the caller see?**
    `m["x"]==1`, and the caller's map is not nil. The header pointer was copied.

22. **When should you use `sync.Map` over `map`+`RWMutex`?**
    When keys are written once and read many times, or when goroutines touch disjoint keys. Since 1.24 it's a lock-light hash trie (per-node mutex, lock-free loads). Otherwise prefer a typed map with a mutex, or sharding.

23. **Why is `fmt.Println(m)` sorted but `range` isn't?**
    `fmt` sorts keys (since 1.12) for reproducible output. Range order is randomized by design so code can't depend on it.

24. **What does `maps.Keys(m)` return in Go 1.23+?**
    An `iter.Seq[K]`, not a `[]K`. Use `slices.Collect` or `slices.Sorted`.

25. **Cost of `map[string]struct{}` vs `map[string]bool`?**
    `struct{}` is zero-size, so a slot is just the 16-byte string header (vs 17, padded to 24, for bool). It is marginally smaller and signals intent.

26. **Why is `map[int64]int64` cheaper for GC than `map[string]int`?**
    Its groups contain no pointers, so the GC doesn't scan them. String keys carry pointers.

27. **After `clear(m)`, does a live `range` loop continue producing entries?**
    No. Cleared entries are gone, and iteration only returns entries that still exist. `clearSeq` makes the NaN fast-path safe. (Pre-1.24, `mapclear` marks buckets `emptyRest` so iterators terminate, issue 59411.)

28. **Big-O worst case of a Go map lookup?**
    O(n) under adversarial collisions. The random per-map seed plus AES/wyhash make that impractical, and the seed re-rolls when the map empties.

---

## 7. Interactive 2D visualization and exercise ideas

1. **Hash splitter**: type a key, see its 64-bit hash colored in three bands. The top globalDepth bits are the directory index, the middle bits are H1 (group index = H1 & mask), and the low 7 bits are H2. A slider changes globalDepth and the group count.
2. **Control-word lab**: show an 8-byte ctrl word as 8 colored cells (empty grey 0x80, tombstone black 0xFE, full with H2 hex). Animate the SWAR steps (`xor → −LSB → &^v → &MSB`) bit by bit, then `first()` via trailing zeros. Include a toggle for the false-positive case (0x0302 with h=2). Use the worked example from §3.4.
3. **Probe walker**: a table of N groups as a strip. Inserting keys animates the triangular probe (+1, +2, +3…) until a group with a free slot is found. Show a counter for "groups touched" and lookups stopping at the first group with an empty slot.
4. **Tombstone trap**: fill a group, delete from it, and watch it become a tombstone instead of empty. Then look up a key that probed past it. Flip it to "empty" as the naive mistake and watch the lookup miss. Include a pruneTombstones button with its 10% thresholds.
5. **Growth timeline**: insert 1…5000 keys with a live chart of table capacities: small group → 16 → 32 … → 1024 → split. Show the directory with localDepth/globalDepth badges and arrows, with multiple directory entries pointing at one table. Highlight the directory-doubling moment.
6. **Old vs new growth race**: run the same inserts in both. On the left, the 1.23 bucket array with oldbuckets and an nevacuate cursor advancing two buckets per write, X/Y split arrows, and overflow chains. On the right, the Swiss per-table rehash. Plot per-insert work as a bar sparkline to show the amortized vs bounded spikes.
7. **Iteration under growth**: an iterator cursor on the old table (greyed, index=-1) while inserts create new tables. Each yielded key flashes a lookup into the new table (`grownKeyElem`). Deleted keys get skipped. Use this to explore spec rules 1–4.
8. **Small-map rotation game**: users predict which printed orders are possible for a 5-key map. Only rotations are. Then a 9th insert flips it to a real table, randomness jumps, and users re-predict.
9. **Output-prediction quiz cards**: Q1, 2, 5, 6, 8, 21, 27, each with a "run it" reveal and the source line that explains it.
10. **Memory-retention simulator**: insert N, delete N. The heap bar stays flat. Compare clear, reassign, and copy-to-fresh. Include a bytes/entry calculator (group = 8 + 8·(K+V padded), ÷8 ÷ load).
11. **Race detector demo** (static): the XOR `writing` flag timeline for two goroutines, showing when detection fires and when it misses.
12. **Extendible-hashing puzzle**: given a directory state, the user predicts which table a hash lands in and what the directory looks like after splitting table X.
13. **sync.Map trie**: a 16-ary trie that expands as colliding hash prefixes are inserted, with a lock icon only on the parent node being mutated.

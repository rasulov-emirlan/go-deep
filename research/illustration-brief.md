# Illustration brief — gopher scenes for GMP, maps, GC

Goal: replace dense SVG dashboards with short, captioned, stepper-driven gopher
scenes. The dashboards (`SchedLab`, `SwissLab`, `TriColorLab`, `GreenTeaLab`)
can stay as an optional "sandbox" at the bottom of each topic page. The scenes
come first. `src/components/Story.tsx` (actors + props + caption per frame, CSS
transitions keyed by id) already fits this format, so the scenes below are
written against it, using sprites that exist in `public/gophers/` (Egon Elbre,
CC0).

Researched 2026-09-29. Links are at the bottom. "Verified" means I read the
page. Medium (Blanchon) returned 403, so those notes come from search snippets
only.

---

## 1. What the good examples do

| Example | Elements on screen | Sequencing | Characters / metaphor | What to steal |
|---|---|---|---|---|
| **go.dev "Green Tea GC" (Oct 2025)** | 4 heap pages (A–D), a few objects each, one work list | **Prev / Next slideshow**, ~45 frames per algorithm, one change per frame | No characters. Driving analogy: graph flood = "driving through city streets", Green Tea = sustained highway run | Same heap, two algorithms: show classic first, then replay the same heap with Green Tea. A 4-color key: blue = on work list, red = active, black = reachable, gray = unreachable. Path-comparison stills: 7 short hops vs 4 long left-to-right sweeps |
| **go.dev "Swiss tables" (Feb 2025)** | 16 slots → 2 groups of 8 + control word → one 8-byte compare row | 3 static figures, each adding one layer | "Single backing array" framing first, groups second | Start with a naive open-addressing table (linear probing). Only then split it into groups plus a control word. The SIMD compare is one row: probe byte vs 8 control bytes, giving 1 match |
| **Ardan Labs "Scheduling in Go pt II" (2018)** | 1–2 Ps, each with an M, a G, 3–4 queued Gs, plus a netpoller box | 19 static figures. **Each one changes one thing from the previous** | Plain boxes, G/M/P letters | Sequence to copy: async netpoll → sync syscall handoff → work stealing, with 3 frames per scenario |
| **Ardan Labs "GC pt I" (2018)** | P1–P4 lanes with G blocks | Static phase-by-phase figures | "GC takes P1 for itself" (the 25% worker); Mark Assist "recruits" an allocating G | GC as a character that *borrows a P* is a strong, true image |
| **Vincent Blanchon, "A Journey With Go" (2019–21)** | Small custom gopher per post plus simple G/M/P diagrams | Static, one per concept | Egon/Renée-derived gophers on every post (header art) | Gophers set the tone. The diagrams stay simple boxes. Don't make the gopher carry every label |
| **go-scheduler-live (puddiy, 2025–26)** | Pixel-art gophers = G, isometric stations = P, numbered carriers = M. **Queues capped at 6 visible** (real cap 256) | Replays real `runtime/trace` events, with zoom and a playhead | G = gopher, P = station, M = vehicle that docks at a station and leaves during a blocking syscall | Show the hard cap as "6 visible +N". An M that *leaves the station* with the G still on board is the clearest picture of syscall handoff |
| **Kavya Joshi, "The Scheduler Saga" (GopherCon 2018)** | Illustrated slides | **Builds the scheduler from scratch**: N:1 → thread per G → thread reuse → run queues → per-P queues → work stealing → preemption | Each design iteration fixes the previous iteration's problem | Design-rationale ordering: introduce P only after the reader sees why global-lock contention hurts |
| **samwho.dev** (hashing, memory-allocation, load-balancing, Big O 2025, reservoir sampling 2025) | 2–3 servers, one grid, one slider. One widget = one idea | Scroll through prose. Widgets are **click-to-advance, or a time slider you can rewind**. Early sims autoplay and later ones add controls | A dog mascot ("Haskie") in speech bubbles voices the reader's doubts | **Reversible time** (drag back). **One new variable per section.** A character that asks "wait, why?". Minimal labels: let color do the work |
| **Bartosz Ciechanowski** (mechanical watch etc.) | One mechanism, **one slider** per demo | Scroll. Dozens of tiny demos, each isolating one part | Physical objects. Stable color per part across the whole article | **Consistent color identity per concept across every demo.** Only the thing being discussed moves. The rest freezes |
| **Julia Evans / wizard zines** | One idea per comic panel, hand-lettered | Linear panels | Personified programs talking ("hi, I'm the kernel") | Dialogue between components beats labels. A bubble like "I'm blocked in read()" says more than a status field |
| **Maggie Appleton, "Drawing invisible programming concepts"** | n/a (method) | n/a | Source/target metaphor mapping | Pick a metaphor on purpose. Write down what it highlights and what it hides, and plan to correct the hidden part in a caption |
| **Nicky Case, "Explorable explanations" (2014)** | n/a (method) | "Start small, build big". Cognitive gates | Interactivity only where it's the best medium | Hold back the full sandbox until the stepped scenes are done |

Also relevant, lower weight: VictoriaMetrics "How Go's built-in map works
with Swiss Tables" (clean schematic figures, grows 4 → 100 → 1000 keys, and
calls control bytes "gatekeepers"); Rick Hudson, "Getting to Go"; divan's
gotrace (3D, 2016: flashy but not clearer); ByteByteGo (animated arrows along
fixed architecture diagrams; effective because the layout never moves while
the data flows).

Not studied in depth: Josh Comeau (whimsy course, general craft rather than
a runtime topic), Lynn Fisher, Excalidraw / rough.js hand-drawn style.
Hand-drawn *strokes* are a trend, but the examples above work because of
their *sequencing* and *restraint*, not their stroke style.

## 2. Principles for this site

1. **Stepper first, sandbox later.** Every scene uses Prev / Next plus a step
   dot row (like go.dev Green Tea). No autoplay by default. An optional
   "play" advances every ~1.8 s. Arrow keys work. Stepping back is always
   possible (samwho's rewind).
2. **≤ 6 moving parts per scene**, with ≤ 2 changing per step. Everything else
   is static scenery drawn in gray-300 hairline.
3. **One caption sentence per step**, written as what happened plus why. The
   caption is the explanation. The picture proves it. Runtime identifiers go
   in mono inline (`runqsteal`), at most one per caption.
4. **Characters speak instead of labels.** Use a speech bubble for state
   ("stuck in read()", "my turn?"). Tags under sprites stay short: `G1`, `P0`,
   `M2`.
5. **Color = meaning, stable site-wide** (house style: one accent):
   ink = active / done, gray = waiting / unknown, **red = the one thing this
   step is about**, dashed outline = absent or empty. For GC this maps directly
   onto the tri-color scheme: white = outline, grey = gray fill, black = ink
   fill, red = currently being scanned.
6. **Same stage, several stories.** Keep the layout fixed across all scenes
   in a topic (Ps always at the same x, groups always in the same row), so
   the reader learns the map once. This is Ciechanowski's and ByteByteGo's
   trick.
7. **Build the mechanism in design order** (Kavya Joshi). Scene 1 is always the
   naive version failing. The runtime's real trick comes next.
8. **Real numbers, drawn small.** Show "6 visible · 256 max", "8 slots/group",
   "8 KiB page", "25% of Ps". Truthful caps belong in the caption, not the art.
9. **Name the metaphor's lie** in the last step when it matters (Appleton).
   For example: "Real Ps don't queue in a line: `runnext` jumps ahead."
10. **End each scene with a one-tap check.** For example, a predict-the-next-frame
    question before revealing the last step (Case's "see, model, apply"). This
    reuses `Quiz` / `OrderPuzzle`.

Sprite casting (existing files in `public/gophers/`):

| Role | Sprite |
|---|---|
| running goroutine | `fairy-tale-messenger-running` |
| runnable, waiting in queue | `misc-standing-v2`, `misc-standing-left`, `dandy-standing` |
| parked / waiting on I/O | `dandy-umbrella` or `dandy-raining` (waiting out the rain) |
| blocked in syscall | `convict-chained` |
| M (OS thread) doing work | `adventure-pushing-cart` (the cart carries the G) |
| stealing work | `fairy-tale-robin-hood` |
| sysmon | `fairy-tale-king` (watches, orders a preempt) or `fairy-tale-messenger-red-letter` |
| map key looking for a slot | `adventure-hiking` |
| GC marker worker | `science-lightbulb` or `fairy-tale-witch-learning` |
| mark-assist (allocating G drafted into GC) | `convict-working-hard` |
| sweeper | `fairy-tale-witch-broom` |
| Green Tea page scanner | `adventure-pirate-lifting-goods` (loads a whole crate at once) |

---

## 3. Scheduler (GMP) — metaphor: **kitchen**

P = **cooking station** with its own ticket rail (the LRQ). M = **cook-cart**
(`pushing-cart`) that has to be parked at a station to work. G = **order gopher**
waiting on the rail. GRQ = shared **tray by the door**. What the metaphor hides
is `runnext`, preemption timing, and the fact that Ps are just permission
slips. Scene 3 corrects that.

### Scene G1 — "Why P exists" (6 parts: tray, 2 carts, 3 gophers)
1. Three order gophers wait on one shared tray by the door, and two cook-carts share it.
2. Both carts reach for the tray at once, and one has to wait for the lock (red padlock).
3. Add more carts and the line at the lock gets longer than the line of work.
4. Go gives each station its own rail, so a cart takes orders from its own rail with no lock.
5. The station, not the cart, owns the rail. This station is `P`, and there are `GOMAXPROCS` of them.
6. The shared tray stays, but only for overflow and fairness. Carts check it every 61st tick.

### Scene G2 — "Blocking syscall handoff" (6 parts: P0, M1, M2, G1, G2, G3)
1. `M1` is parked at `P0` running `G1`, with `G2` and `G3` waiting on the rail.
2. `G1` calls `read()` on a file and gets chained to the cart: "stuck in the kernel".
3. `P0` can't cook while its cart is stuck, so the rail stalls (rail turns red).
4. `sysmon` (king) spots it after ~20 µs and releases `P0` from `M1`.
5. A fresh cart `M2` pulls up to `P0` and starts `G2`, so the rail moves again.
6. `G1`'s syscall returns and `M1` tries to grab an idle P. If none is free, `G1` goes to the tray and `M1` parks.
7. Network reads skip all this: the gopher waits under the netpoller umbrella and the cart never blocks.

### Scene G3 — "Work stealing" (6 parts: P0, P1, their rails, Robin Hood gopher, tray)
1. `P0` has four orders queued. `P1` just finished its last one.
2. `P1` checks its own rail (empty), then the tray by the door (empty).
3. `P1` picks a random victim station and steals **half** its rail (Robin Hood takes 2 of 4).
4. Both stations are busy again, and nobody took a global lock.
5. Twist: `P0`'s `runnext` slot (the order it just spawned) is stolen only as a last resort.
6. If every rail is empty, the cart spins briefly, then parks, because spinning costs CPU.

(Extra candidate scenes: "Preemption: king sends a red letter to a gopher hogging the cart for 10 ms", "GOMAXPROCS in a container: stations = CPU quota, not host cores".)

---

## 4. Maps (Swiss tables) — metaphor: **locker hall**

Slot = **locker**. Group = **row of 8 lockers with an 8-light control panel**. Each
light shows a 7-bit fingerprint (H2), or is empty or ghost. Key = **hiker
gopher** holding a ticket with H1 (which row to start at) and H2 (the
fingerprint). Directory = **signpost at the hall entrance**. What the metaphor
hides is that lights are bytes read in one 8-byte word. Scene M2 shows exactly
that.

### Scene M1 — "Open addressing, the old way" (5 parts: 8 lockers, 2 hikers, arrow)
1. A hash says "locker 3", and the hiker walks straight there and moves in.
2. A second hiker also hashes to 3, but locker 3 is taken.
3. It checks 4, then 5, one locker at a time, opening each door to compare keys.
4. Every door opened is a slow key comparison, and long runs get slower.
5. Swiss tables' idea: before opening any door, glance at a panel that says who *might* be inside.

### Scene M2 — "The control panel" (6 parts: row of 8 lockers, panel, hiker, ticket H1/H2, match highlight, key)
1. The hiker's hash splits in two: the top 57 bits pick the row (H1), the low 7 bits are the fingerprint (H2).
2. H1 leads to row 2. Every locker in the row has one light on the panel above it.
3. The hiker holds its fingerprint `0x59` up to all 8 lights **at once** (one word compare).
4. One light matches (red), so only that one door gets opened and the key compared.
5. Lookup for a missing key: no light matches and there's an empty light, so stop. The key isn't here.
6. Row full and no match: hop to the next row by the probe sequence (+1, +2, +3 rows…).

### Scene M3 — "Delete, grow, split" (6 parts: two tables, signpost, ghost light, hikers)
1. Deleting a key leaves a **ghost** light, not an empty one, so later hikers keep searching past it.
2. When a table gets 7/8 full, counting ghosts, it has to grow.
3. Small tables double in place, and every hiker is rehashed into the bigger hall.
4. A table never grows past 1024 slots. Instead it **splits in two**, and the signpost gains a bit.
5. The signpost reads the top hash bits to send a hiker to the right table (extendible hashing).
6. Growth copies at most 1024 slots at a time, so one insert never pauses for a huge rehash.
7. Contrast (old map): the old map moved buckets gradually during later writes. Swiss maps just keep each copy small.

(Extra candidate scene: "≤ 8 entries: the whole map is one row, no table, no signpost".)

---

## 5. GC — metaphor: **paint the reachable town**

Objects = **houses** on 2–3 **streets** (a street = one 8 KiB span/page). Pointers =
**roads** between houses. Roots = **station** (stacks and globals). The marker
gopher (`science-lightbulb`) paints houses: outline = white (unvisited), gray
fill = grey (on the to-do list), ink = black (done), red = scanning now.
Sweeper = `witch-broom`.

### Scene C1 — "Tri-color mark" (6 parts: roots, 4 houses, marker)
1. At the start of the cycle every house is unpainted: white means "maybe garbage".
2. The marker walks out of the roots and paints each house the roots point to gray (to do).
3. It picks a gray house, paints its neighbors gray, and paints it black (done).
4. Repeat until no gray is left. Black houses are reachable.
5. White houses are unreachable, and the broom sweeps them.
6. One rule keeps it correct: a black house must never point to a white one nobody else will visit.

### Scene C2 — "Why the write barrier" (6 parts: marker, program gopher, 3 houses, barrier gate)
1. Marking runs *while* the program runs, so the program gopher keeps moving roads.
2. The program adds a road from a black house to a white one and deletes the only other road to it.
3. Without help the marker never returns to black houses, so that live house would be swept (red flash).
4. The write barrier is a gate on every pointer write while mark is on.
5. The gate paints both the new target and the old target gray, so neither can be lost (hybrid barrier).
6. That's why stacks never need a second scan, and why the STW pauses stay short.

### Scene C3 — "Green Tea: scan by street, not by house" (6 parts: 3 streets, marker, work queue, pirate)
1. Classic marking: the marker follows roads house by house and zig-zags across town (7 short hops).
2. Each hop is a cache miss. The go.dev post calls it "driving through city streets".
3. Green Tea changes the queue: it records a *street* once, not each house.
4. While a street waits in the queue, more houses on it get a "seen" tick (two bits per house: seen, scanned).
5. When the pirate gopher finally takes the street, it scans every seen-but-unscanned house in one left-to-right pass.
6. Result: fewer, longer, sequential passes ("highway"), and 10–40% less GC CPU. With AVX-512 the pass is a few vector instructions.
7. Only small objects (≤ 512 B) take the street path. Big objects are still marked one by one.

(Extra candidate scenes: "Pacer: GOGC as a gas tank, GOMEMLIMIT as a ceiling", "Mark assist: the allocating gopher is drafted into painting".)

---

## 6. Build notes

- One `Story` per scene, with ≤ 8 frames. Put the caption above the stage on mobile (the operator reads on a phone) and keep it ≤ 140 chars.
- Actors keep their `id` across frames so moves tween (Story already does this). 300–400 ms ease, no springs (DESIGN.md).
- The step counter reads `03 / 06` in mono uppercase. Prev / Next are big tap targets, and arrow keys work.
- Keep the stage fixed at 800×360. Leave ≥ 60% of the stage empty.
- The dashboards move below a "Sandbox" kicker, collapsed by default, and open with a caption telling the reader which scene to reproduce.
- Credits: Egon Elbre CC0 gophers (already in `CREDITS.md`). The Go gopher is by Renée French, CC BY 4.0. Ashley McNamara's gophers are CC BY-NC-SA, so avoid mixing them in.

## Sources

- go.dev — The Green Tea Garbage Collector (2025-10-29): https://go.dev/blog/greenteagc
- go.dev — Faster Go maps with Swiss Tables (2025-02-26): https://go.dev/blog/swisstable
- go.dev — Getting to Go (Hudson, 2018): https://go.dev/blog/ismmkeynote
- Ardan Labs — Scheduling In Go pt II: https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html
- Ardan Labs — Garbage Collection In Go pt I: https://www.ardanlabs.com/blog/2018/12/garbage-collection-in-go-part1-semantics.html
- Vincent Blanchon — Work-Stealing in Go Scheduler (Medium, not fetched: 403): https://medium.com/a-journey-with-go/go-work-stealing-in-go-scheduler-d439231be64d
- go-scheduler-live (gophers = G, stations = P, carriers = M): https://github.com/puddiy/go-scheduler-live · demo https://puddiy.github.io/go-scheduler-live/
- go-slowmo (eBPF scheduler viz, 2025-12): https://kailunli.me/posts/go-slowmo/
- nghiant3223 — Go Scheduler (2025-04): https://nghiant3223.github.io/2025/04/15/go-scheduler.html
- Kavya Joshi — The Scheduler Saga: https://www.youtube.com/watch?v=YHRO5WQGh0k
- VictoriaMetrics — How Go's built-in map works with Swiss Tables: https://victoriametrics.com/blog/go-swiss-table-map/
- divan — Visualizing Concurrency in Go: https://divan.dev/posts/go_concurrency_visualize/
- samwho — Hashing https://samwho.dev/hashing/ · Memory allocation https://samwho.dev/memory-allocation/ · Load balancing https://samwho.dev/load-balancing/ · Big O (2025) https://samwho.dev/big-o
- Bartosz Ciechanowski — Mechanical Watch: https://ciechanow.ski/mechanical-watch/
- Julia Evans — Why cute drawings?: https://jvns.ca/blog/2016/11/14/why-cute-drawings/
- Maggie Appleton — How to Draw Invisible Programming Concepts: https://maggieappleton.com/drawinginvisibles1
- Nicky Case — Explorable Explanations: https://blog.ncase.me/explorable-explanations/
- Egon Elbre gophers (CC0): https://github.com/egonelbre/gophers · Go gopher wiki: https://go.dev/wiki/Gopher

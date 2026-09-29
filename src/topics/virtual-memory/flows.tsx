import type { ReactNode } from 'react'
import type { El, FlowDef } from '../../components/flow'

/** stop-card text: `x` becomes <code> */
const md = (s: string): ReactNode => s.split(/(`[^`]+`)/).map((p, i) => (p.startsWith('`') && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p))

/*
 * Visual language for this topic: ink = normal, grey = old / inactive / freed, red = what the step is about,
 * dashed = absent / not there yet. Memory maps read left to right: process (virtual) -> page table -> RAM.
 */
const box = (id: string, x: number, y: number, w: number, h: number, text?: string, more: Partial<El> = {}): El => ({ t: 'box', id, x, y, w, h, text, ...more }) as El
const ln = (id: string, x1: number, y1: number, x2: number, y2: number, more: Partial<El> = {}): El => ({ t: 'line', id, x1, y1, x2, y2, arrow: true, ...more }) as El
const tx = (id: string, x: number, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'text', id, x, y, text, size: 13, ...more }) as El

/* ---------- 01a · one address, many worlds ---------- */
const colX = [103, 197, 291, 385]
const walkIds = ['v0', 'a1', 'a2', 'a3', 'a4', 'a5', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'l01', 'l12', 'l23', 'l34', 'l45', 'i1', 'i2', 'i3', 'i4', 'i5', 'note', 'tlb', 'tlbhit', 'h1', 'h2', 'h3', 'hnote']
export const worlds: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'Naive: programs use physical RAM addresses directly. Each one must be built for its own free spot in RAM.',
      add: [
        box('pa', 9, 40, 120, 44, 'prog A'),
        box('pb', 9, 130, 120, 44, 'prog B'),
        box('ram', 371, 20, 180, 250, undefined, { label: 'physical RAM' }),
        box('ra', 381, 50, 160, 44, "A's data"),
        box('rb', 381, 120, 160, 44, "B's data"),
        box('rk', 381, 190, 160, 44, 'kernel'),
        ln('la', 129, 62, 381, 72),
        ln('lb', 129, 152, 381, 142),
      ],
    },
    {
      caption: 'Nothing stops a buggy or hostile B from overwriting A, or the kernel. Memory also fragments, and total use can never exceed RAM.',
      add: [ln('bad', 129, 160, 381, 84, { tone: 'red' })],
    },
    {
      caption: 'Real design: each process gets its own virtual addresses. The MMU (translation hardware in the CPU) maps every access. Same 0x1000, different frames.',
      drop: ['la', 'lb', 'bad'],
      add: [
        box('mmu', 200, 20, 110, 250, 'MMU', { label: 'per-process table' }),
        ln('m1', 129, 62, 200, 62),
        ln('m2', 310, 62, 381, 72, { tone: 'red' }),
        ln('m3', 129, 152, 200, 152),
        ln('m4', 310, 152, 381, 142, { tone: 'red' }),
      ],
      set: { pa: { text: 'A: 0x1000' }, pb: { text: 'B: 0x1000' }, ra: { text: 'A: frame 7' }, rb: { text: 'B: frame 3' } },
    },
    {
      caption: 'How it maps: memory is cut into 4 KiB pages. On x86-64 a 48-bit address is four 9-bit table indexes plus a 12-bit offset inside the page.',
      drop: ['pa', 'pb', 'ram', 'ra', 'rb', 'rk', 'mmu', 'm1', 'm2', 'm3', 'm4'],
      add: [
        box('v0', 9, 14, 72, 46, 'vaddr', { sub: '48 bits' }),
        box('a1', colX[0], 14, 72, 46, '9 bits', { sub: 'PGD idx' }),
        box('a2', colX[1], 14, 72, 46, '9 bits', { sub: 'PUD idx' }),
        box('a3', colX[2], 14, 72, 46, '9 bits', { sub: 'PMD idx' }),
        box('a4', colX[3], 14, 72, 46, '9 bits', { sub: 'PTE idx' }),
        box('a5', 479, 14, 72, 46, '12 bits', { sub: 'offset' }),
      ],
    },
    {
      caption: 'The walk: CR3 (a register) points at the top table. Each index picks one of 512 entries, which points at the next table, and the last one at the frame.',
      add: [
        box('c0', 9, 100, 72, 40, 'CR3'),
        box('c1', 103, 100, 72, 40, 'PGD'),
        box('c2', 197, 100, 72, 40, 'PUD'),
        box('c3', 291, 100, 72, 40, 'PMD'),
        box('c4', 385, 100, 72, 40, 'PTE'),
        box('c5', 479, 100, 72, 40, 'frame'),
        ln('l01', 81, 120, 103, 120),
        ln('l12', 175, 120, 197, 120),
        ln('l23', 269, 120, 291, 120),
        ln('l34', 363, 120, 385, 120),
        ln('l45', 457, 120, 479, 120),
        ln('i1', 139, 60, 139, 100, { tone: 'red' }),
        ln('i2', 233, 60, 233, 100, { tone: 'red' }),
        ln('i3', 327, 60, 327, 100, { tone: 'red' }),
        ln('i4', 421, 60, 421, 100, { tone: 'red' }),
        ln('i5', 515, 60, 515, 100),
        tx('note', 280, 175, 'each table: one 4 KiB page, 512 x 8-byte entries', { tone: 'grey' }),
      ],
    },
    {
      caption: 'A walk is up to four memory reads before the real one. So each core keeps a TLB, a small cache of recent translations. A hit skips the walk.',
      drop: ['note'],
      add: [box('tlb', 190, 205, 180, 44, 'TLB', { sub: 'per-core cache', tone: 'red' }), ln('tlbhit', 370, 227, 515, 140, { tone: 'red', text: 'hit' })],
      set: { c1: { tone: 'grey' }, c2: { tone: 'grey' }, c3: { tone: 'grey' }, c4: { tone: 'grey' } },
      stop: {
        title: 'What a TLB miss costs',
        body: 'A miss triggers the walk: up to four extra memory reads. Programs with scattered access patterns can spend real time here, which is why huge pages exist (next step).',
      },
    },
    {
      caption: 'Huge page: a PMD entry can map 2 MiB directly. The walk is one read shorter, the offset grows to 21 bits, and one TLB entry covers 512 times more.',
      drop: ['tlb', 'tlbhit'],
      add: [
        ln('h1', 327, 140, 327, 160, { arrow: false, tone: 'red' }),
        ln('h2', 327, 160, 515, 160, { arrow: false, tone: 'red' }),
        ln('h3', 515, 160, 515, 142, { tone: 'red' }),
        tx('hnote', 280, 200, 'PMD entry maps 2 MiB itself: no PTE level', { tone: 'red' }),
      ],
      set: {
        c3: { tone: 'ink' },
        c4: { dashed: true, text: 'skip' },
        a3: { tone: 'red' },
        a4: { tone: 'grey', dashed: true, text: '-', sub: 'unused' },
        a5: { text: '21 bits' },
        l34: { tone: 'grey', dashed: true },
        l45: { tone: 'grey', dashed: true },
        i4: { tone: 'grey', dashed: true },
      },
    },
    {
      caption: 'Switching to another process changes CR3. Entries tagged with a PCID (address-space id) can stay in the TLB instead of being flushed.',
      drop: walkIds,
      add: [
        box('cr3', 9, 100, 110, 40, 'CR3 -> B', { tone: 'red' }),
        box('tlb2', 150, 60, 260, 130, undefined, { label: 'TLB on one core' }),
        box('e1', 165, 92, 230, 34, 'PCID A: 0x1000 -> 7'),
        box('e2', 165, 136, 230, 34, 'PCID B: 0x1000 -> 3'),
        tx('n2', 280, 235, 'without PCID, the CR3 write would flush these', { tone: 'grey' }),
      ],
      stop: {
        title: 'Thread vs process switch',
        edge: true,
        body: 'Threads of one process share one set of page tables, so switching between them leaves CR3 and the TLB alone. A process switch changes CR3; PCID softens the cost but does not remove it.',
      },
    },
  ],
}

/* ---------- 01b · TLB shootdown ---------- */
const cx = [70, 205, 340, 475]
export const shootdown: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'One process, four threads on four CPUs. Every CPU may hold the same translation for page P in its own TLB.',
      add: [
        ...cx.map((x, i) => ({ t: 'lane', id: 'c' + i, x, y: 8, len: 200, text: 'CPU ' + i }) as El),
        ...cx.map((x, i) => box('t' + i, x - 50, 60, 100, 34, 'TLB: P')),
      ],
    },
    {
      caption: 'The thread on CPU 0 calls `munmap` on P. CPU 0 drops its own entry, but the other CPUs still trust theirs.',
      add: [box('mu', 20, 110, 100, 30, 'munmap(P)', { tone: 'red' })],
      set: { t0: { tone: 'grey', dashed: true, text: 'P gone' } },
    },
    {
      caption: 'CPU 0 sends an inter-processor interrupt (IPI) to every CPU that may cache P, and waits until they all answer.',
      add: [
        { t: 'msg', id: 'p1', from: 'c0', to: 'c1', y: 150, y2: 165, text: 'IPI', tone: 'red' } as El,
        { t: 'msg', id: 'p2', from: 'c0', to: 'c2', y: 150, y2: 175, text: 'IPI', tone: 'red' } as El,
        { t: 'msg', id: 'p3', from: 'c0', to: 'c3', y: 150, y2: 185, text: 'IPI', tone: 'red' } as El,
      ],
    },
    {
      caption: 'Each CPU invalidates P. Measured on one VM: 20,000 mmap+touch+munmap ran 3–5× slower with three busy sibling threads (e.g. 9 µs vs 42 µs each).',
      set: { t1: { tone: 'grey', dashed: true, text: 'P gone' }, t2: { tone: 'grey', dashed: true, text: 'P gone' }, t3: { tone: 'grey', dashed: true, text: 'P gone' } },
      add: [tx('cost', 280, 232, 'more threads, more CPUs to interrupt', { tone: 'red' })],
    },
  ],
}

/* ---------- 02a · demand paging ---------- */
export const demand: FlowDef = {
  h: 290,
  steps: [
    {
      caption: '`mmap` (or Go\'s `make`) only records a range in the kernel: a VMA. No page-table entries, no RAM. VSZ grows by 1 GiB; RSS does not.',
      add: [
        tx('h1', 99, 16, 'virtual', { tone: 'grey' }),
        tx('h2', 280, 16, 'page table', { tone: 'grey' }),
        tx('h3', 461, 16, 'RAM', { tone: 'grey' }),
        box('vma', 9, 26, 180, 216, undefined, { label: 'VMA: 1 GiB rw-p' }),
        box('pt', 205, 26, 150, 216, 'empty', { dashed: true, tone: 'grey' }),
        box('ram', 371, 26, 180, 216, 'free frames', { dashed: true, tone: 'grey' }),
        tx('g', 280, 268, 'VSZ +1 GiB, RSS +0', { tone: 'red', size: 14 }),
      ],
    },
    {
      caption: 'First read of a page: a page fault. The kernel maps one shared, read-only zero page. Still no private RAM.',
      add: [
        box('p0', 19, 48, 160, 34, 'page 0: read', { tone: 'red' }),
        box('e0', 215, 48, 130, 34, '-> zero page'),
        box('z', 381, 48, 160, 34, 'zero page'),
        ln('q0', 179, 65, 215, 65, { tone: 'red' }),
        ln('r0', 345, 65, 381, 65, { tone: 'red' }),
      ],
      set: { pt: { text: '', dashed: false, tone: 'ink' }, ram: { text: '', dashed: false, tone: 'ink' }, g: { text: 'RSS still +0' } },
    },
    {
      caption: 'First write: fault again. The kernel grabs a free frame and zeroes it, so no process ever sees old data. Now RSS grows, 4 KiB per page.',
      add: [
        box('p1', 19, 96, 160, 34, 'page 1: write', { tone: 'red' }),
        box('e1', 215, 96, 130, 34, '-> frame 42'),
        box('f1', 381, 96, 160, 34, 'frame, zeroed'),
        ln('q1', 179, 113, 215, 113, { tone: 'red' }),
        ln('r1', 345, 113, 381, 113, { tone: 'red' }),
      ],
      set: { p0: { tone: 'ink' }, g: { text: 'RSS +4 KiB' } },
      stop: {
        title: 'Why untouched make() is free',
        body: md('Go 1.25.1, `make([]byte, 1<<30)`: VSZ +1 GiB, RSS +1.3 MB. Writing one byte per page then cost about 262,000 minor faults (1 GiB / 4 KiB) and +1 GiB of RSS.'),
      },
    },
    {
      caption: 'Writing a page you only read faults a second time: the zero-page mapping is swapped for a private frame. 256 MiB read, then written: ~65,540 faults, then ~65,550 more.',
      drop: ['r0'],
      add: [box('f0', 381, 144, 160, 34, 'frame, zeroed', { tone: 'red' }), ln('r0b', 345, 65, 381, 161, { tone: 'red' })],
      set: { p0: { text: 'page 0: write', tone: 'red' }, e0: { text: '-> frame 43' }, z: { tone: 'grey' }, p1: { tone: 'ink' }, g: { text: 'RSS +8 KiB' } },
    },
    {
      caption: 'File-backed mapping: if the page is already in the page cache, the fault only maps it (minor). If not, the kernel reads the disk first (major).',
      add: [
        box('p2', 19, 192, 160, 34, 'page 3: file', { tone: 'red' }),
        box('e2', 215, 192, 130, 34, '-> cache page'),
        box('pc', 381, 192, 160, 34, 'page cache', { tone: 'red' }),
        ln('q2', 179, 209, 215, 209, { tone: 'red' }),
        ln('r2', 345, 209, 381, 209, { tone: 'red' }),
      ],
      set: { p0: { tone: 'ink' }, g: { text: 'minor fault: map only' } },
      stop: {
        title: 'Faults hide inside loads',
        edge: true,
        body: 'A plain load can wait on disk (cold vs warm read of a mapped 256 MiB file, one VM: ~100–140 ms vs 2–3 ms). A page past a truncated end of file raises SIGBUS, not an error return.',
      },
    },
  ],
}

/* ---------- 02b · fork + copy-on-write ---------- */
export const cow: FlowDef = {
  h: 270,
  steps: [
    {
      caption: 'A process with two private pages: its page table points at two frames in RAM.',
      add: [
        tx('h1', 84, 16, 'parent', { tone: 'grey' }),
        tx('h2', 280, 16, 'RAM', { tone: 'grey' }),
        box('pp1', 9, 50, 150, 44, 'P: page 1 rw'),
        box('pp2', 9, 190, 150, 44, 'P: page 2 rw'),
        box('fa', 205, 50, 150, 44, 'frame A'),
        box('fb', 205, 190, 150, 44, 'frame B'),
        ln('lp1', 159, 72, 205, 72),
        ln('lp2', 159, 212, 205, 212),
      ],
    },
    {
      caption: '`fork` copies the page tables, not the data. Both sides now point at the same frames, marked read-only. Cost grows with mapped memory.',
      add: [
        tx('h3', 475, 16, 'child', { tone: 'grey' }),
        box('cp1', 400, 50, 150, 44, 'C: page 1 r/o', { tone: 'red' }),
        box('cp2', 400, 190, 150, 44, 'C: page 2 r/o', { tone: 'red' }),
        ln('lc1', 400, 72, 355, 72, { tone: 'red' }),
        ln('lc2', 400, 212, 355, 212, { tone: 'red' }),
      ],
      set: { pp1: { text: 'P: page 1 r/o', tone: 'red' }, pp2: { text: 'P: page 2 r/o', tone: 'red' } },
    },
    {
      caption: 'The child writes page 1: fault. The kernel copies just that one 4 KiB frame for the child. Page 2 stays shared until someone writes it.',
      drop: ['lc1'],
      add: [box('fa2', 205, 120, 150, 44, 'copy of A', { tone: 'red' }), ln('lc1b', 400, 90, 355, 130, { tone: 'red' })],
      set: { cp1: { text: 'C: page 1 rw' }, pp1: { tone: 'ink' }, pp2: { tone: 'ink' }, cp2: { tone: 'ink' } },
    },
    {
      caption: 'If the child calls `exec` right away, all that copying was wasted. Hence `vfork` and `posix_spawn`.',
      set: { cp1: { tone: 'grey', dashed: true, text: 'C: discarded' }, cp2: { tone: 'grey', dashed: true, text: 'C: discarded' } },
      stop: {
        title: 'fork cost, and Go',
        edge: true,
        body: md('Big heap means slow fork, then a COW fault per page written (32,776 for a child writing half of 256 MiB). Go never forks without exec: `os/exec` uses clone with CLONE_VFORK|CLONE_VM (unless a new user namespace is requested), so no page-table copy.'),
      },
    },
  ],
}

/* ---------- 03a · RSS vs VSZ vs PSS ---------- */
export const rss: FlowDef = {
  h: 250,
  steps: [
    {
      caption: '`make([]byte, 1<<30)` untouched (Go 1.25.1): VSZ +1 GiB, RSS +1.3 MB. VSZ counts address space promised; RSS counts pages actually resident.',
      add: [
        tx('l1', 9, 48, 'VSZ', { anchor: 'start' }),
        box('vsz', 60, 30, 490, 36, '1 GiB mapped', { tone: 'grey' }),
        tx('l2', 9, 118, 'RSS', { anchor: 'start' }),
        box('rss', 60, 100, 4, 36, undefined, { tone: 'red' }),
        tx('rv', 76, 118, 'only +1.3 MB', { anchor: 'start', size: 15, tone: 'red' }),
      ],
    },
    {
      caption: 'Now write one byte per 4 KiB page: about 262,000 minor faults, and RSS climbs to 1 GiB. Faults, not allocations, are what memory costs.',
      drop: ['rv'],
      add: [tx('rv2', 280, 190, '~262,000 faults = 1 GiB / 4 KiB', { tone: 'red', size: 14 })],
      set: { rss: { w: 490, text: 'touched: +1 GiB' } },
    },
    {
      caption: 'Fork a 256 MiB private mapping. Both processes show full RSS, but the child\'s PSS (shared pages divided among sharers) is half. Nothing is copied yet.',
      drop: ['l1', 'l2', 'vsz', 'rss', 'rv2'],
      add: [
        box('par', 9, 20, 526, 38, 'parent RSS 263 MB'),
        box('chi', 9, 68, 524, 38, 'child RSS 262 MB', { tone: 'red' }),
        box('pss', 9, 116, 260, 38, 'child PSS 130 MB', { tone: 'red' }),
      ],
    },
    {
      caption: 'The child writes half: 128 MB private, 130 MB shared. RSS counts every resident page in each process, so the sum overstates real use.',
      drop: ['pss'],
      add: [box('sh', 265, 68, 260, 38, 'shared 130 MB', { tone: 'grey' }), tx('sum', 280, 190, 'sum of RSS 526 MB, really used ~386 MB', { tone: 'red', size: 14 })],
      set: { chi: { w: 256, text: 'private 128 MB', tone: 'red' } },
      stop: {
        title: 'Which number to trust',
        body: md('PSS splits shared pages between their users; USS counts private pages only. In Go, read `/proc/self/smaps_rollup`, or the container\'s `memory.stat`.'),
      },
    },
  ],
}

/* ---------- 03b · overcommit and the OOM killer ---------- */
export const oom: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'Default overcommit (mode 0): `mmap` is a promise. Only one obviously huge request is refused (17 GiB failed, 15 GiB passed on a 16 GiB box).',
      add: [
        tx('lb1', 10, 28, 'promised (virtual)', { anchor: 'start', tone: 'grey' }),
        box('o1', 10, 40, 184, 40, 'A 15 GiB'),
        box('o2', 194, 40, 184, 40, 'B 15 GiB'),
        box('o3', 378, 40, 122, 40, 'C 10 GiB'),
        tx('lb2', 10, 138, 'physical', { anchor: 'start', tone: 'grey' }),
        box('ramb', 10, 150, 196, 40, 'RAM 16 GiB'),
      ],
      stop: {
        title: 'Overcommit modes',
        edge: true,
        body: md('Mode 0 is heuristic, 1 always says yes, 2 refuses beyond swap plus 50% of RAM by default, so `mmap` fails up front with ENOMEM. PROT_NONE reservations are not counted, which is how Go reserves.'),
      },
    },
    {
      caption: 'Nothing failed at `mmap` time. The bill comes at first touch: when free frames run out, the kernel reclaims page cache, then swaps anonymous pages if it has swap.',
      add: [tx('steps', 280, 225, '1 drop page cache  2 swap (if any)  3 OOM kill', { tone: 'red' })],
      set: { ramb: { tone: 'red', text: 'RAM full' } },
    },
    {
      caption: 'Reclaim failed, so the OOM killer scores every process and sends SIGKILL to the highest score.',
      drop: ['lb1', 'o1', 'o2', 'o3'],
      add: [
        box('s1', 10, 22, 120, 28, 'A'),
        box('s2', 10, 56, 300, 28, 'B: highest score', { tone: 'red' }),
        box('s3', 10, 90, 60, 28, 'C'),
      ],
      set: { steps: { text: 'score = RSS + swap + page tables + oom_score_adj' } },
      stop: {
        title: 'Which process dies?',
        edge: true,
        body: md('The highest `oom_badness`, not the last to allocate and not the biggest VSZ. `oom_score_adj` shifts the score; -1000 exempts a process.'),
      },
    },
    {
      caption: 'Container variant: a cgroup hits its own limit while the host has free RAM. Only tasks in that cgroup are candidates. RSS decides, not the 1.4 GB VSZ.',
      drop: ['lb2', 'ramb', 's1', 's2', 's3', 'steps'],
      add: [
        box('host', 9, 20, 542, 170, undefined, { label: 'host: plenty of free RAM' }),
        box('cg', 30, 50, 290, 125, undefined, { label: 'cgroup limit 256 MiB' }),
        box('app', 45, 100, 150, 60, 'Go app', { sub: 'touching +32 MiB' }),
        box('oth', 350, 100, 170, 60, 'other process', { sub: 'safe' }),
        tx('d1', 280, 215, 'constraint=CONSTRAINT_MEMCG', { tone: 'grey' }),
        tx('d2', 280, 240, 'total-vm 1488424kB  anon-rss 261248kB', { tone: 'grey' }),
      ],
    },
    {
      caption: 'The Go app gets SIGKILL: no panic, no deferred calls, no log line. Exit status 137 = 128 + 9.',
      add: [tx('k', 280, 268, 'exit 137: nothing ran', { tone: 'red', size: 14 })],
      set: { app: { tone: 'red', text: 'killed', sub: 'exit 137' } },
    },
  ],
}

/* ---------- 04a · Go heap arena lifecycle ---------- */
const zoomLive = [0, 1, 4]
export const goheap: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'At startup Go reserves address space with `mmap(PROT_NONE)`. Hello world: VSZ ~1.2 GB, RSS ~2 MB. Since Go 1.26 the heap base address is randomized.',
      add: [
        box('arena', 9, 40, 542, 64, undefined, { label: 'one 64 MiB heap arena' }),
        box('res', 19, 62, 522, 34, 'reserved: PROT_NONE', { dashed: true, tone: 'grey' }),
        tx('g1', 9, 195, 'VSZ ~1.2 GB', { anchor: 'start', size: 15 }),
        tx('g2', 9, 222, 'RSS ~2 MB', { anchor: 'start', size: 15, tone: 'red' }),
      ],
    },
    {
      caption: 'As the heap grows, Go maps read-write chunks (4 MiB at first) over the reservation (MAP_FIXED). Pages still cost RAM only when touched.',
      add: [box('rw', 19, 62, 64, 34, 'rw', { tone: 'red' }), tx('cm', 9, 122, 'first 4 MiB committed: mmap RW', { anchor: 'start', tone: 'red' })],
      set: { res: { x: 89, w: 452, text: 'still reserved' }, g2: { text: 'RSS grows as pages are touched' } },
    },
    {
      caption: 'GC finds garbage and frees it inside Go\'s own heap. The pages stay mapped and resident, so RSS does not move.',
      drop: ['cm'],
      add: [
        tx('zl', 9, 122, 'zoom: the committed part', { anchor: 'start', tone: 'grey' }),
        ...[0, 1, 2, 3, 4, 5].map((k) => (zoomLive.includes(k) ? box('z' + k, 9 + k * 92, 130, 86, 34, 'live') : box('z' + k, 9 + k * 92, 130, 86, 34, 'free', { tone: 'grey' }))),
      ],
      set: { rw: { tone: 'ink' }, g2: { text: 'RSS unchanged' } },
      stop: {
        title: 'Why RSS stays after GC',
        body: 'GC frees objects for Go to reuse; it does not tell the kernel. Pages go back only when the scavenger releases them.',
      },
    },
    {
      caption: 'The background scavenger (about 1% of CPU) returns free pages with `madvise(MADV_DONTNEED)`, the default on Linux since Go 1.16. RSS falls.',
      set: {
        z2: { tone: 'red', dashed: true, text: 'returned' },
        z3: { tone: 'red', dashed: true, text: 'returned' },
        z5: { tone: 'red', dashed: true, text: 'returned' },
        g2: { text: 'RSS drops' },
      },
      stop: {
        title: 'The MADV_FREE variant',
        edge: true,
        body: md('`GODEBUG=madvdontneed=0` uses MADV_FREE: pages are only lazily freeable. After freeing 1 GiB and `debug.FreeOSMemory()`: RSS 3.9 MB by default, still 1,052 MB with MADV_FREE, until the kernel needs the memory.'),
      },
    },
  ],
}

/* ---------- 04b · container limit and GOMEMLIMIT ---------- */
const mx = (m: number) => 20 + 2 * m
export const limit: FlowDef = {
  h: 215,
  steps: [
    {
      caption: 'A container limit is a wall the kernel enforces, and Go does not read it. Example: 200 MiB cgroup, 120 MiB of live heap.',
      add: [
        box('live', mx(0), 60, 240, 40, 'live 120 MiB'),
        ln('wall', mx(200), 30, mx(200), 150, { arrow: false, tone: 'red' }),
        tx('wl', mx(200), 20, 'cgroup 200 MiB', { tone: 'red' }),
      ],
    },
    {
      caption: 'No GOMEMLIMIT: the GC lets garbage pile up until the heap is about twice the live size. That crosses the wall: SIGKILL, exit 137.',
      add: [box('gb', mx(120), 60, 240, 40, 'garbage', { dashed: true, tone: 'red' }), tx('kill', 280, 180, 'OOM-killed at the wall', { tone: 'red', size: 14 })],
    },
    {
      caption: 'GOMEMLIMIT=170MiB is a soft target. Near it the GC runs more often and the scavenger works harder. Measured on one VM: survived, GC used about 5% CPU.',
      drop: ['gb', 'kill'],
      add: [
        box('gb2', mx(120), 60, 100, 40, 'garbage', { dashed: true }),
        ln('gl', mx(170), 40, mx(170), 140, { arrow: false }),
        tx('gll', mx(170), 156, 'GOMEMLIMIT 170', {}),
      ],
    },
    {
      caption: 'A limit just above the live heap leaves no room for garbage, so the GC runs almost back to back. Measured: 5–7x lower throughput.',
      drop: ['gb2'],
      add: [tx('slow', 280, 195, 'GC nearly non-stop', { tone: 'red', size: 14 })],
      set: { gl: { x1: mx(125), x2: mx(125), tone: 'red' }, gll: { x: mx(125), text: 'GOMEMLIMIT 125', tone: 'red' } },
      stop: {
        title: 'Limit near live heap',
        edge: true,
        body: 'Keep the limit well above live heap (about 90% of the container limit is a rule of thumb). A GC CPU limiter caps GC at about 50% of CPU, so a too-low limit slows the program instead of freeing memory.',
      },
    },
    {
      caption: 'So set it near 90% of the container limit. It covers only memory the Go runtime manages, not cgo or mmap\'d files, so leave headroom.',
      drop: ['slow'],
      add: [box('cgo', mx(120), 60, 110, 40, 'cgo, mmap', { dashed: true, tone: 'grey' })],
      set: { gl: { x1: mx(180), x2: mx(180), tone: 'ink' }, gll: { x: mx(180), text: 'GOMEMLIMIT 180', tone: 'ink' } },
      stop: {
        title: 'What GOMEMLIMIT counts',
        body: 'Runtime-managed memory only: total mapped minus what was released. The runtime does not read the cgroup limit for you.',
      },
    },
  ],
}

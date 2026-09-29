import type { El, FlowDef } from '../../components/flow'
import { Code } from '../../components/Code'

/*
 * Visual language: ink = normal, grey = old / inactive, red = what this step is about, dashed = in flight / unconfirmed.
 * Ladders read left to right: user code (x=80), CPU or filter (x=280), kernel (x=470).
 */
const lane = (id: string, text: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...more }) as El
const msg = (id: string, from: string, to: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'msg', id, from, to, y, text, ...more }) as El
const box = (id: string, x: number, y: number, w: number, h: number, text: string, more: Partial<El> = {}): El => ({ t: 'box', id, x, y, w, h, text, ...more }) as El

/* ---------- 01 · one address space, kernel included ---------- */
const colA = 30
const colB = 310
const colW = 220
export const addressSpace: FlowDef = {
  h: 284,
  steps: [
    {
      caption: 'Each process sees one address space. The low half is its own user memory; the high half is the kernel.',
      add: [
        { t: 'text', id: 'ta', x: colA + colW / 2, y: 16, text: 'process A' },
        box('ka', colA, 30, colW, 80, 'kernel', { label: 'ffff8000… and up', sub: 'supervisor only', tone: 'red' }),
        box('ua', colA, 154, colW, 100, 'user', { label: '0 … 00007fff…', sub: '~128 TB (4-level paging)' }),
        { t: 'text', id: 'cpl', x: colA + colW / 2, y: 272, text: 'your code runs at CPL 3', tone: 'grey', size: 13 },
      ],
    },
    {
      caption: 'Process B has its own user half, but the kernel half is the same kernel, mapped into every address space.',
      add: [
        { t: 'text', id: 'tb', x: colB + colW / 2, y: 16, text: 'process B' },
        box('kb', colB, 30, colW, 80, 'kernel', { label: 'ffff8000… and up', sub: 'supervisor only', tone: 'red' }),
        box('ub', colB, 154, colW, 100, 'user', { label: '0 … 00007fff…', sub: '~128 TB (4-level paging)' }),
        { t: 'line', id: 'same', x1: colA + colW, y1: 70, x2: colB, y2: 70, text: 'same' },
      ],
      set: { ta: { tone: 'grey' }, cpl: { tone: 'grey' } },
    },
    {
      caption: 'Mapped is not readable. Each page carries a user/supervisor bit, so user code touching a kernel address faults.',
      add: [
        { t: 'line', id: 'try', x1: colA + colW / 2, y1: 154, x2: colA + colW / 2, y2: 114, arrow: true, tone: 'red', text: 'read?' },
        { t: 'text', id: 'no', x: colA + colW / 2 + 60, y: 133, text: '✕ fault', tone: 'red' },
      ],
      set: { cpl: { text: 'CPL 3 cannot read it', tone: 'red' } },
    },
    {
      caption: 'On CPUs vulnerable to Meltdown, KPTI shrinks it: user mode maps only a small entry stub until a syscall swaps page tables.',
      drop: ['try', 'no'],
      set: {
        ka: { y: 76, h: 34, label: '', sub: '', text: 'entry stub only', tone: 'grey' },
        kb: { y: 76, h: 34, label: '', sub: '', text: 'entry stub only', tone: 'grey' },
        same: { y1: 93, y2: 93 },
        cpl: { text: 'user mode, KPTI on', tone: 'grey' },
      },
      stop: {
        title: 'KPTI: mapped, but tiny',
        edge: true,
        body: (
          <>
            <p>Only affected CPUs need it. This VM reports no Meltdown, so it runs without KPTI:</p>
            <Code>{`cat /sys/devices/system/cpu/\\
  vulnerabilities/meltdown
# Not affected`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'On entry the kernel loads the full map (a `CR3` swap), runs, and swaps back on return. The kernel is still there in every process.',
      set: {
        ka: { y: 30, h: 80, label: 'ffff8000… and up', sub: 'full map after swap', text: 'kernel', tone: 'red' },
        kb: { y: 30, h: 80, label: 'ffff8000… and up', sub: 'full map after swap', text: 'kernel', tone: 'red' },
        same: { y1: 70, y2: 70 },
        cpl: { text: 'inside a syscall: CPL 0', tone: 'red' },
      },
    },
  ],
}

/* ---------- 02 · one syscall, step by step ---------- */
export const crossing: FlowDef = {
  h: 470,
  steps: [
    {
      caption: 'User code loads the syscall number into `rax` and arguments into `rdi rsi rdx r10 r8 r9`, then runs `syscall`. (arm64: `svc #0`, number in `x8`.)',
      add: [
        lane('u', 'User', 80, 440, { sub: 'ring 3' }),
        lane('c', 'CPU', 280, 440, { sub: 'CPL 3' }),
        lane('k', 'Kernel', 470, 440),
        box('u1', 5, 92, 150, 50, 'rax = 39', { sub: 'args in regs' }),
        msg('sy', 'u', 'c', 76, 'syscall', { tone: 'red' }),
      ],
    },
    {
      caption: 'Hardware, not software, saves the return address and flags, masks interrupts, enters privilege 0 and jumps to `MSR_LSTAR`, set at boot.',
      add: [box('c1', 195, 92, 170, 68, 'RCX ← RIP\nR11 ← RFLAGS\nRIP ← LSTAR', { tone: 'red' })],
      set: { c: { sub: 'CPL 0', tone: 'red' }, sy: { tone: 'ink' } },
      stop: {
        title: 'Why r10, not rcx?',
        body: <p>The <code>syscall</code> instruction overwrites <code>rcx</code> with the return address and <code>r11</code> with the flags, so the 4th argument moves to <code>r10</code>.</p>,
      },
    },
    {
      caption: 'No hardware stack switch. The entry stub picks the kernel stack and pushes every register (`pt_regs`). Spectre mitigations run here too.',
      add: [msg('en', 'c', 'k', 186, 'entry_SYSCALL_64'), box('k1', 385, 200, 170, 56, 'swapgs\nkernel stack\nsave pt_regs', { tone: 'red' })],
      set: { c1: { tone: 'ink' } },
    },
    {
      caption: 'Seccomp, ptrace and audit hooks run first. Then the kernel indexes `sys_call_table` by `rax` and calls the handler.',
      add: [box('k2', 385, 264, 170, 34, 'table[rax](regs)', { tone: 'red' })],
      set: { k1: { tone: 'ink' } },
    },
    {
      caption: 'A pointer argument is never trusted. The kernel range-checks it with `access_ok`, then copies with `copy_from_user`.',
      add: [
        msg('ptr', 'u', 'k', 321, 'user pointer', { x2: 382, dashed: true }),
        box('k3', 385, 304, 170, 34, 'copy_from_user', { tone: 'red' }),
      ],
      set: { k2: { tone: 'ink' } },
      stop: {
        title: 'Kernel pointer passed?',
        edge: true,
        body: <p><code>access_ok</code> rejects addresses above the user/kernel boundary. A bad address inside it faults, and an exception-table fixup returns <code>-EFAULT</code> instead of crashing.</p>,
      },
    },
    {
      caption: 'Before returning, the kernel runs pending work: reschedule if the timer tick set `need_resched`, deliver signals.',
      add: [box('k4', 385, 346, 170, 48, 'need_resched?\nsignal pending?', { tone: 'red' })],
      set: { k3: { tone: 'ink' } },
    },
    {
      caption: 'If the saved state is valid, the fast `sysret` restores `rcx` and `r11` and drops back to CPL 3. Otherwise a slower `iret` runs.',
      add: [msg('rt1', 'k', 'c', 422, 'sysret', { tone: 'red' }), msg('rt2', 'c', 'u', 446, 'rax = result', { tone: 'red' })],
      set: { c: { sub: 'CPL 3', tone: 'ink' }, k4: { tone: 'ink' } },
    },
    {
      caption: 'A result in −4095…−1 means `-errno`. libc turns it into `errno` and −1; Go’s assembly negates it into a `syscall.Errno`.',
      add: [{ t: 'text', id: 'er', x: 80, y: 376, text: '−4095…−1\nmeans −errno', tone: 'red', size: 13 }],
      set: { rt2: { text: 'rax = −errno', tone: 'red' }, rt1: { tone: 'ink' } },
    },
  ],
}

/* ---------- 02 · the same door is where sandboxes hook in ---------- */
export const door: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'seccomp-bpf puts a small filter at the door: a BPF program runs on every syscall entry and returns a verdict.',
      add: [lane('a', 'App', 80, 310), lane('s', 'seccomp', 280, 310, { sub: 'BPF' }), lane('k', 'Kernel', 470, 310), msg('m1', 'a', 's', 82, 'write'), msg('m2', 's', 'k', 108, 'ALLOW')],
    },
    {
      caption: 'Other verdicts: `ERRNO` fails the call, `KILL` ends the process, `TRAP` signals it, `USER_NOTIF` asks a supervisor. The handler never runs.',
      add: [msg('m3', 'a', 's', 150, 'ptrace', { tone: 'red' }), msg('m4', 's', 'a', 176, 'ERRNO: EPERM', { tone: 'red' })],
    },
    {
      caption: 'It sees number, architecture and raw argument values, never pointed-to memory (no TOCTOU). Check `arch`: x86-64, i386, x32 number differently.',
      add: [box('f1', 195, 200, 170, 50, 'nr, arch, args', { sub: 'no pointer reads', tone: 'red' })],
    },
    {
      caption: 'One `io_uring_enter` passes the filter, but the operations queued in the shared ring are not syscalls the filter ever sees.',
      drop: ['m1', 'm2', 'm3', 'm4', 'f1'],
      add: [msg('m5', 'a', 's', 100, 'io_uring_enter', { tone: 'red' }), msg('m6', 's', 'k', 126, 'ALLOW'), box('k1', 385, 160, 170, 50, 'ring ops run', { tone: 'red', sub: 'unfiltered' })],
      stop: {
        title: 'Seccomp vs io_uring',
        edge: true,
        body: <p>Filters see only the entry call, so io_uring can bypass a per-syscall denylist. Mitigations: filter it out entirely, or set the sysctl <code>kernel.io_uring_disabled</code> (Linux 6.6+).</p>,
      },
    },
    {
      caption: 'gVisor goes further: its Sentry, a Go program in user space, answers the app’s syscalls, so the host kernel sees far fewer, at a speed cost.',
      drop: ['s', 'k', 'm5', 'm6', 'k1'],
      add: [lane('sn', 'Sentry', 280, 310, { sub: 'user' }), lane('h', 'Host', 470, 310, { sub: 'kernel' }), msg('g1', 'a', 'sn', 82, 'syscall'), box('g2', 195, 110, 170, 40, 'implements it', { tone: 'red' }), msg('g3', 'sn', 'h', 190, 'few own calls', { dashed: true })],
    },
  ],
}

/* ---------- 03 · what a crossing costs (log scale) ---------- */
const X0 = 40
const DEC = 96
const xOf = (ns: number) => X0 + DEC * Math.log10(ns)
const ticks: [number, string][] = [
  [1, '1 ns'],
  [10, '10 ns'],
  [100, '100 ns'],
  [1000, '1 µs'],
  [10000, '10 µs'],
  [100000, '100 µs'],
]
const rows = [
  { id: 'v', ns: 65, text: 'time.Now(): 2 vDSO calls, ~65 ns' },
  { id: 'r', ns: 120, text: 'raw syscall getppid, ~120 ns' },
  { id: 'g', ns: 200, text: 'Go syscall.Syscall, ~200 ns' },
  { id: 'x', ns: 2250, text: 'pipe ping-pong switch, ~2.3 µs' },
  { id: 's', ns: 40000, text: 'getppid under strace, ~25–60 µs' },
  { id: 'w', ns: 4450, text: '16 × 1-byte Write, ~4.5 µs' },
  { id: 'wv', ns: 310, text: 'one writev, 16 buffers, ~0.3 µs' },
]
const rowY = (i: number) => 64 + i * 40
const barEls = (id: string): El[] => {
  const i = rows.findIndex((r) => r.id === id)
  const r = rows[i]
  return [
    { t: 'text', id: 'l' + id, x: X0, y: rowY(i), text: r.text, anchor: 'start', tone: 'red' } as El,
    box('b' + id, X0, rowY(i) + 11, xOf(r.ns) - X0, 12, '', { tone: 'red' }),
  ]
}
const grey = (...ids: string[]) => Object.fromEntries(ids.flatMap((id) => [['l' + id, { tone: 'grey' }], ['b' + id, { tone: 'grey' }]]))

export const cost: FlowDef = {
  h: 352,
  steps: [
    {
      caption: 'Log scale: each tick is 10× more. Numbers come from one small VM (2.1 GHz, no KPTI). Read them as orders of magnitude.',
      add: [
        ...ticks.flatMap(([ns, t]) => [
          { t: 'text', id: 'tk' + ns, x: xOf(ns), y: 14, text: t, size: 13, tone: 'grey' } as El,
          { t: 'line', id: 'gr' + ns, x1: xOf(ns), y1: 26, x2: xOf(ns), y2: 38, tone: 'grey' } as El,
        ]),
      ],
    },
    {
      caption: 'vDSO: the kernel maps a small library and a time-data page into every process. `time.Now` reads them with plain calls: no kernel entry, invisible to `strace`.',
      add: barEls('v'),
      stop: {
        title: 'vDSO can fall back',
        edge: true,
        body: <p>It needs a vDSO-capable clocksource (TSC, kvm-clock). With hpet or acpi_pm the call falls back to a real syscall.</p>,
      },
    },
    {
      caption: 'A real syscall (`getppid`) costs ~120 ns here. The mode switch itself is cheap; the price is entry work and cold caches.',
      add: barEls('r'),
      set: grey('v'),
    },
    {
      caption: 'Go’s `syscall.Syscall` adds `entersyscall` and `exitsyscall` bookkeeping, ~80 ns more. Quote ~100–300 ns, not one constant.',
      add: barEls('g'),
      set: grey('r'),
    },
    {
      caption: 'A context switch, where another task gets the CPU, is a different thing: ~2 µs via pipe ping-pong on one CPU, ~15 µs across CPUs.',
      add: barEls('x'),
      set: grey('g'),
      stop: {
        title: 'Is a syscall a context switch?',
        body: <p>No. A syscall keeps the same task and only changes privilege. A blocking one, like <code>read</code> on an empty pipe, can cause a context switch; <code>getppid</code> does not.</p>,
      },
    },
    {
      caption: 'Under `strace -f` the same call costs 25–60 µs across runs, hundreds of times slower: ptrace stops the process twice per syscall and wakes the tracer.',
      add: barEls('s'),
      set: grey('x'),
      stop: {
        title: 'Never strace a hot path',
        edge: true,
        body: <p>Use <code>strace -c</code> briefly, or eBPF. Its seconds are ptrace-inflated: trust the call and error counts, not the time.</p>,
      },
    },
    {
      caption: 'Mitigations (KPTI page-table swaps, Spectre defenses) add entry and exit work only on CPUs that need them. Cost scales with syscall rate; no single number.',
      add: [
        { t: 'line', id: 'kp', x1: xOf(120), y1: rowY(1) + 17, x2: xOf(120) + 60, y2: rowY(1) + 17, arrow: true, tone: 'red', dashed: true },
        { t: 'text', id: 'kpt', x: xOf(120) + 68, y: rowY(1) + 17, text: '+ mitigations', anchor: 'start', tone: 'red', size: 13 },
      ],
      set: grey('s'),
    },
    {
      caption: 'Fewer crossings win: 16 one-byte writes cost ~4.5 µs, one `writev` ~0.3 µs. `io_uring` batches further through shared rings.',
      drop: ['kp', 'kpt'],
      add: [...barEls('w'), ...barEls('wv')],
      set: { ...grey('r'), lw: { tone: 'red' }, bw: { tone: 'red' } },
    },
  ],
}

/* ---------- 04 · Go leaves the P behind ---------- */
const g = (id: string, x: number, y: number, w: number, h: number, text: string, more: Partial<El> = {}): El => box(id, x, y, w, h, text, more)
export const handoff: FlowDef = {
  h: 424,
  steps: [
    {
      caption: 'G1 runs on thread M1 with processor P1, the right to run Go code. G2 waits in P1’s local run queue.',
      add: [
        lane('m1', 'M1', 70, 408, { sub: 'thread' }),
        lane('p1', 'P1', 210, 408, { sub: 'runs Go' }),
        lane('sm', 'sysmon', 350, 408, { sub: 'no P' }),
        g('g1', 5, 76, 130, 40, 'G1 running'),
        g('q', 145, 76, 130, 40, 'runq: G2'),
      ],
    },
    {
      caption: 'A file `read` is a real blocking call. `entersyscall` marks G1 “in syscall”; M1 keeps P1 for now. (Sockets use epoll instead.)',
      add: [msg('hold', 'm1', 'p1', 146, 'holds P1', { dashed: true })],
      set: { g1: { text: 'G1 in read()', tone: 'red' } },
      stop: {
        title: '_Psyscall gone in 1.26',
        edge: true,
        body: <p>Up to Go 1.25 the P was set to <code>_Psyscall</code> here. In 1.26 that state is unused: the P stays <code>_Prunning</code>, and “in a syscall” is read from the goroutine. Checked in the 1.25.1 and 1.26.0 sources.</p>,
      },
    },
    {
      caption: 'sysmon, a background thread with no P, wakes every ≥20 µs. Tick 1: it records which syscall G1 is in and moves on.',
      add: [msg('pk', 'sm', 'm1', 178, 'in syscall?', { dashed: true }), g('sm1', 275, 192, 150, 40, 'tick 1', { sub: 'notes syscall' })],
      set: { g1: { tone: 'ink' } },
    },
    {
      caption: 'Tick 2, same syscall. It retakes P1 only if P1 has queued work, or no other P is idle or spinning, or the call passed 10 ms.',
      add: [g('sm2', 275, 240, 150, 40, 'tick 2', { sub: 'retake?', tone: 'red' })],
      set: { sm1: { tone: 'grey' } },
      stop: {
        title: 'When sysmon waits',
        edge: true,
        body: <p>Empty local queue, an idle P and under 10 ms: no retake. So “20 µs” is only the tick floor. Measured on one VM (GOMAXPROCS=1, G2 queued locally): G2 ran after 25–250 µs, median ~150–250 µs.</p>,
      },
    },
    {
      caption: '`retake` takes P1 and `handoffp` starts, or wakes, thread M2 to run G2. G1 is still stuck in the kernel.',
      add: [
        lane('m2', 'M2', 490, 408, { sub: 'thread' }),
        msg('rk', 'sm', 'p1', 302, 'retake', { tone: 'red' }),
        msg('hd', 'p1', 'm2', 326, 'handoffp', { tone: 'red' }),
        g('g2', 425, 340, 130, 40, 'G2 runs'),
      ],
      set: { q: { tone: 'grey' }, sm2: { tone: 'grey' } },
    },
    {
      caption: 'If nobody retook P1, G1 just continues. Otherwise `exitsyscall` tries P1 again, then an idle P; failing both, G1 joins the global queue and M1 parks.',
      add: [g('g1b', 5, 372, 140, 44, 'G1: no P', { sub: 'global queue', tone: 'red' })],
    },
    {
      caption: '`RawSyscall` skips `entersyscall`: the scheduler thinks G1 is running Go code. After ≥10 ms sysmon sends `SIGURG` (measured 13–25 ms), and the call returns `EINTR`.',
      drop: ['g1', 'hold', 'pk', 'sm1', 'sm2', 'rk', 'hd', 'g2', 'g1b', 'm2'],
      set: { q: { tone: 'ink' } },
      add: [g('r1', 5, 76, 130, 44, 'RawSyscall', { sub: 'no entersyscall' }), msg('su', 'sm', 'm1', 170, 'SIGURG', { tone: 'red' }), g('r2', 5, 200, 130, 40, 'EINTR', { tone: 'red' })],
      stop: {
        title: 'EINTR from the runtime',
        edge: true,
        body: <p>Go’s handlers use <code>SA_RESTART</code>, but raw <code>nanosleep</code>, <code>epoll_wait</code>, <code>poll</code> and <code>select</code> are never restarted. Retry on <code>EINTR</code>; the stdlib already does.</p>,
      },
    },
    {
      caption: 'A goroutine inside a syscall cannot be preempted; only retaking its P helps. With `GOMAXPROCS=1` and async preemption off, this froze the whole program for 300 ms.',
      add: [g('r3', 145, 290, 130, 44, 'G2 starves', { sub: 'P1 never freed', tone: 'red' })],
      set: { su: { tone: 'red', lost: true, text: 'no SIGURG' }, r2: { tone: 'grey', text: 'still asleep' }, q: { tone: 'red' } },
    },
  ],
}

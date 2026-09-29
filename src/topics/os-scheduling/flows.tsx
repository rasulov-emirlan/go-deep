import type { El, FlowDef } from '../../components/flow'
import { Code } from '../../components/Code'

/*
 * Visual language: ink = normal, grey = old / inactive, red = what this step is about,
 * dashed = absent / cold / waiting. Timelines are drawn with boxes; ladders use lanes.
 */
const lane = (id: string, text: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...more }) as El
const msg = (id: string, from: string, to: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'msg', id, from, to, y, text, ...more }) as El
const box = (id: string, x: number, y: number, w: number, h: number, text: string, more: Partial<El> = {}): El => ({ t: 'box', id, x, y, w, h, text, ...more }) as El
const text = (id: string, x: number, y: number, t: string, more: Partial<El> = {}): El => ({ t: 'text', id, x, y, text: t, ...more }) as El
const arrow = (id: string, x1: number, y1: number, x2: number, y2: number, more: Partial<El> = {}): El => ({ t: 'line', id, x1, y1, x2, y2, arrow: true, ...more }) as El

/* ---------- 01 · process vs thread ---------- */
export const clone: FlowDef = {
  h: 262,
  steps: [
    {
      caption: 'Linux has one schedulable object: the task. Each task points to its resources: an address space, a file-descriptor table, signal handlers.',
      add: [box('p', 15, 20, 100, 50, 'task A'), box('mem', 150, 20, 125, 50, 'memory'), box('fds', 290, 20, 125, 50, 'fd table'), box('sig', 430, 20, 115, 50, 'signals')],
    },
    {
      caption: '`fork()` is `clone()` with no sharing flags: task B gets its own copies, memory pages copy-on-write. That is a process.',
      add: [
        box('p2', 15, 150, 100, 50, 'task B'),
        box('mem2', 150, 150, 125, 50, 'copy', { sub: 'copy-on-write' }),
        box('fds2', 290, 150, 125, 50, 'copy', { sub: 'own table' }),
        box('sig2', 430, 150, 115, 50, 'copy', { sub: 'own handlers' }),
      ],
    },
    {
      caption: 'A thread is `clone()` with sharing flags. B now uses A’s memory, fds and handlers. `CLONE_THREAD` puts both in one group, so user space sees one PID.',
      drop: ['mem2', 'fds2', 'sig2'],
      add: [arrow('l1', 115, 160, 200, 72, { tone: 'red' }), arrow('l2', 115, 170, 340, 72, { tone: 'red' }), arrow('l3', 115, 178, 475, 72, { tone: 'red' })],
      set: { mem: { sub: 'CLONE_VM', tone: 'red' }, fds: { sub: 'CLONE_FILES', tone: 'red' }, sig: { sub: 'CLONE_SIGHAND', tone: 'red' } },
      stop: {
        title: 'Thread vs process',
        edge: true,
        body: (
          <>
            One kernel object either way; the flags decide what is shared. The scheduler only sees tasks, and <code>ps -L</code> lists threads as tasks.
          </>
        ),
      },
    },
    {
      caption: 'Without cgo, Go starts every OS thread (an M) with these flags plus `CLONE_SYSVSEM`. `os/exec` uses `CLONE_VFORK|CLONE_VM`, then `exec` replaces the program.',
      add: [text('gm', 280, 228, 'Go M: clone(VM|FS|FILES|SIGHAND|SYSVSEM|THREAD)', { size: 13, tone: 'red' }), text('gx', 280, 250, 'os/exec: clone(VFORK|VM), then exec', { size: 13, tone: 'grey' })],
      set: { p2: { text: 'M (thread)' } },
    },
  ],
}

/* ---------- 01 · zombies, orphans, PID 1 ---------- */
export const lifecycle: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'The parent forks a child. The child exits: memory is freed, but a small entry with its exit code stays. That is a zombie, `Z` in `ps`.',
      add: [lane('par', 'parent', 90, 270), lane('chi', 'child', 280, 270), lane('ini', 'PID 1', 470, 270), msg('f1', 'par', 'chi', 60, 'fork()', { y2: 85 }), box('z', 215, 110, 130, 44, 'zombie Z', { sub: 'exit code only', tone: 'red' })],
    },
    {
      caption: '`wait4` hands over the exit code and frees the entry. Skip it (in Go: `cmd.Wait`) and zombies pile up: no memory, but `kill` can’t remove them.',
      add: [msg('w1', 'par', 'chi', 180, 'wait4()'), msg('w2', 'chi', 'par', 215, 'exit code')],
      set: { z: { tone: 'grey', text: 'gone', sub: '' } },
    },
    {
      caption: 'If the parent dies first, the running child is an orphan. The kernel re-parents it to PID 1 (or a nearer subreaper), which must `wait` for it later.',
      drop: ['f1', 'w1', 'w2', 'z'],
      add: [msg('ad', 'ini', 'chi', 90, 'adopts', { tone: 'red' }), box('al', 215, 130, 130, 44, 'orphan', { sub: 'still running' })],
      set: { par: { dead: true } },
    },
    {
      caption: 'In a container your app is PID 1. The kernel drops signals it has no handler for, so a C entrypoint ignores `SIGTERM`. After a grace period `SIGKILL` kills it.',
      drop: ['par', 'chi', 'ini', 'ad', 'al'],
      add: [
        lane('ds', 'docker stop', 90, 270),
        lane('c', 'C entrypoint', 280, 270),
        lane('go', 'Go binary', 470, 270),
        msg('m1', 'ds', 'c', 70, 'SIGTERM'),
        box('i1', 215, 90, 130, 44, 'ignored', { sub: 'no handler' }),
        msg('m2', 'ds', 'c', 175, 'SIGKILL', { tone: 'red' }),
        box('i2', 215, 200, 130, 44, 'killed', { sub: 'exit 137', tone: 'red' }),
      ],
      stop: {
        title: 'Why SIGTERM does nothing',
        edge: true,
        body: (
          <>
            Only signals with a handler reach PID 1 inside its namespace. <code>SIGKILL</code> from outside is forced through, with no cleanup. The grace period is typically 10 to 30 s.
          </>
        ),
      },
    },
    {
      caption: 'Go installs its own `SIGTERM` handler, so the signal gets through. With no `signal.Notify` it re-raises the default action, PID 1 ignores that, then it calls `exit(2)`.',
      drop: ['m1', 'i1', 'm2', 'i2'],
      add: [msg('m3', 'ds', 'go', 70, 'SIGTERM'), box('g1', 400, 90, 140, 44, 'handler', { sub: 'Go runtime' }), box('g2', 400, 160, 140, 44, 'exit 2', { sub: 'defers skipped', tone: 'red' })],
    },
    {
      caption: 'With `signal.NotifyContext` the process drains and exits 0. A small init such as `tini` (or `docker run --init`) also reaps orphaned zombies.',
      drop: ['g1', 'g2'],
      add: [box('g3', 400, 90, 140, 44, 'ctx canceled', { sub: 'drain requests' }), box('g4', 400, 160, 140, 44, 'exit 0', { sub: 'defers run' })],
      stop: {
        title: 'Handle SIGTERM yourself',
        body: (
          <>
            <p>Go works as PID 1 only by accident. Ask for the signal explicitly:</p>
            <Code>{`
ctx, stop := signal.NotifyContext(
  context.Background(),
  syscall.SIGTERM, os.Interrupt)
defer stop()
<-ctx.Done()
srv.Shutdown(shutdownCtx)
`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 02 · what a switch costs ---------- */
export const switchCost: FlowDef = {
  h: 262,
  steps: [
    {
      caption: 'Two tasks hand a token back and forth through a pipe, pinned to one CPU. Each hand-off, with its context switch, took about 1.5–2 µs (measured on one VM).',
      add: [
        text('r1', 10, 25, 'one CPU', { anchor: 'start', tone: 'grey' }),
        box('a1', 10, 36, 80, 46, 'A', { label: 'CPU 0' }),
        box('b1', 95, 40, 80, 40, 'B'),
        box('a2', 180, 40, 80, 40, 'A'),
        box('b2', 265, 40, 80, 40, 'B'),
        text('h1', 355, 66, 'hand-off ≈ 1.5–2 µs', { anchor: 'start', tone: 'red' }),
      ],
    },
    {
      caption: 'Pinned to two CPUs, the same hand-off took 13–17 µs, with noise. The other CPU has to be woken with an interrupt, and inside a VM that costs extra.',
      add: [
        text('r2', 10, 112, 'two CPUs', { anchor: 'start', tone: 'grey' }),
        box('c0a', 10, 124, 80, 46, 'A', { label: 'CPU 0' }),
        box('w1', 95, 180, 120, 40, 'IPI, wake', { dashed: true, tone: 'red' }),
        box('c1b', 220, 178, 80, 46, 'B', { label: 'CPU 1' }),
        box('w2', 305, 128, 120, 40, 'IPI, wake', { dashed: true, tone: 'red' }),
        box('c0c', 430, 128, 80, 40, 'A'),
        text('h2', 10, 246, 'hand-off ≈ 13–17 µs', { anchor: 'start', tone: 'red' }),
      ],
      set: { r1: { tone: 'grey' }, a1: { tone: 'grey' }, b1: { tone: 'grey' }, a2: { tone: 'grey' }, b2: { tone: 'grey' }, h1: { tone: 'grey' } },
    },
    {
      caption: 'What one switch does: save and load registers and the stack pointer, FPU/SIMD state and, for another process, the page-table root (`CR3`). Roughly 1-2 µs.',
      drop: ['r1', 'a1', 'b1', 'a2', 'b2', 'h1', 'r2', 'c0a', 'w1', 'c1b', 'w2', 'c0c', 'h2'],
      add: [
        box('sv1', 10, 20, 250, 56, 'registers + stack', { sub: 'switch_to, new rsp' }),
        box('sv2', 10, 86, 250, 56, 'FPU / SIMD state', { sub: 'XSAVE' }),
        box('sv3', 10, 152, 250, 56, 'address space', { sub: 'CR3 (PCID: no full flush)' }),
        box('dc', 290, 20, 250, 188, 'direct cost', { sub: 'roughly 1-2 µs', tone: 'soft' }),
      ],
    },
    {
      caption: 'The bigger bill comes after: the next task meets cold caches, a cold TLB and cold branch history. Threads and processes switched about equally fast here (PCID).',
      drop: ['dc'],
      add: [
        box('ce1', 290, 20, 250, 56, 'cold L1 / L2 cache', { dashed: true, tone: 'red' }),
        box('ce2', 290, 86, 250, 56, 'cold TLB', { sub: 'address translations', dashed: true, tone: 'red' }),
        box('ce3', 290, 152, 250, 56, 'cold predictors', { sub: 'branch history', dashed: true, tone: 'red' }),
      ],
      stop: {
        title: 'Is a thread switch cheaper?',
        edge: true,
        body: 'Only by the address-space switch. Without PCID a process switch also flushes the TLB; on this VM it made no measurable difference.',
      },
    },
  ],
}

/* ---------- 02 · EEVDF ---------- */
const tick = (k: number): El => ({ t: 'line', id: 'tk' + k, x1: 20 + 60 * k, y1: 155, x2: 20 + 60 * k, y2: 167, tone: 'grey' }) as El
export const eevdf: FlowDef = {
  h: 274,
  steps: [
    {
      caption: 'Each CPU keeps its own run queue and picks from it, with no global lock. A balancer moves tasks between queues. Weight comes from `nice`.',
      add: [
        text('q', 10, 18, 'CPU 0 run queue', { anchor: 'start', tone: 'grey' }),
        box('A', 20, 30, 160, 54, 'A', { sub: 'nice 0 · w 1024' }),
        box('B', 190, 30, 160, 54, 'B', { sub: 'nice 0 · w 1024' }),
        box('C', 360, 30, 160, 54, 'C', { sub: 'nice 10 · w 110' }),
      ],
    },
    {
      caption: 'CPU share follows weight, about 1.25x per nice step. Two spinners on one CPU: nice 0 vs 10 got about 9 : 1 (1024 / 110 predicts 9.3).',
      add: [text('m1', 280, 120, 'nice 0 vs 10: ~9 : 1 measured', { tone: 'red' }), text('m2', 280, 145, 'weights predict 9.3 : 1', { tone: 'grey' })],
    },
    {
      caption: 'Each task has a lag: time it is owed (+) or overdrew (-). Only lag ≥ 0 tasks are eligible; the earliest virtual deadline wins. Numbers are illustrative.',
      drop: ['m1', 'm2'],
      add: [text('lA', 100, 104, 'eligible · d=3', { size: 13, tone: 'red' }), text('lB', 270, 104, 'eligible · d=5', { size: 13 }), text('lC', 440, 104, 'lag < 0 · waits', { size: 13, tone: 'grey' })],
      set: { A: { tone: 'red' }, C: { tone: 'grey' } },
      stop: {
        title: 'CFS before 6.6',
        body: (
          <>
            Until 6.5, CFS ran the task with the least weighted CPU time (<code>vruntime</code>). Since 6.6 EEVDF picks by lag and deadline. Asking for a shorter per-task slice with <code>sched_setattr</code> needs 6.12 or later.
          </>
        ),
      },
    },
    {
      caption: 'A runs. The timer tick (every 4 ms at `HZ=250` here) checks whether A used its slice (about 2 ms) or a woken task has an earlier deadline.',
      add: [
        { t: 'line', id: 'axis', x1: 20, y1: 161, x2: 540, y2: 161, tone: 'grey' } as El,
        ...Array.from({ length: 9 }, (_, k) => tick(k)),
        text('tl', 540, 137, 'tick = 4 ms', { anchor: 'end', tone: 'grey' }),
        box('ra', 20, 177, 60, 34, 'A', { tone: 'red' }),
      ],
      stop: {
        title: 'Taking the CPU back',
        body: (
          <>
            The tick sets <code>NEED_RESCHED</code>; the switch happens at the next safe point, such as returning from an interrupt or syscall. The task never has to cooperate.
          </>
        ),
      },
    },
    {
      caption: 'Preempted while runnable: involuntary switch. Blocked on I/O, a futex or `sleep`: voluntary. Two spinners sharing a CPU: ~245 involuntary each in 2 s (`/proc/PID/status`).',
      add: [
        box('rb', 85, 177, 55, 34, 'B'),
        box('ra2', 145, 177, 60, 34, 'A'),
        text('c1', 20, 237, 'A preempted: involuntary +1', { size: 13, anchor: 'start', tone: 'red' }),
        text('c2', 20, 257, 'B blocks on read: voluntary +1', { size: 13, anchor: 'start' }),
      ],
      set: { ra: { tone: 'ink' } },
    },
    {
      caption: 'A sleeper with a short requested slice (kernel 6.12+) gets an earlier deadline and can preempt at once: lower latency without a bigger share.',
      add: [box('rw', 175, 177, 40, 34, 'W', { tone: 'red' }), text('tw', 225, 199, 'W wakes: earlier deadline', { anchor: 'start', size: 13, tone: 'red' })],
      set: { ra2: { w: 30 } },
    },
  ],
}

/* ---------- 02 · load average and top ---------- */
const dots = (prefix: string, xs: number[], y: number, tone: 'ink' | 'red' | 'grey', dashed = false): El[] => xs.map((x, i) => ({ t: 'node', id: prefix + i, x, y, r: 14, tone, dashed }) as El)
export const load: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'Load average starts from tasks that are running. On a 4-core machine, four busy threads means four running.',
      add: [box('cpus', 20, 20, 250, 80, '', { label: 'RUNNING ON A CPU' }), ...dots('r', [60, 110, 160, 210], 68, 'ink')],
    },
    {
      caption: 'Runnable tasks that have no CPU yet wait in the run queue. They count too, so load can be higher than the core count.',
      add: [box('rq', 290, 20, 250, 80, '', { label: 'RUNNABLE, WAITING', tone: 'red' }), ...dots('w', [330, 380, 430], 68, 'red')],
    },
    {
      caption: 'Linux also counts tasks in uninterruptible sleep (D state): stuck on a slow disk or NFS, using no CPU. Load = running + waiting + D.',
      add: [box('dq', 20, 125, 250, 80, '', { label: 'D STATE: DISK / NFS', dashed: true }), ...dots('d', [60, 110], 173, 'grey', true), text('fm', 405, 168, 'load = R + waiting + D', { tone: 'red', size: 14 })],
      stop: {
        title: 'Load 8 on 8 cores',
        edge: true,
        body: (
          <>
            Could be 100% busy (fine) or 8 tasks in D state at 0% CPU. It counts threads, is not divided by core count, and is a damped 1/5/15 minute average. Read <code>/proc/pressure/cpu</code> (PSI) for who is stalled.
          </>
        ),
      },
    },
    {
      caption: '`top` %CPU adds up threads: four busy threads show 400%, so a Go process at 400% on 4 cores is not broken. Under a quota it stops near the limit.',
      drop: ['fm'],
      add: [box('top', 290, 125, 250, 80, 'top: 400%', { sub: '4 threads x 100%', tone: 'soft' })],
    },
  ],
}

/* ---------- 03 · futex ---------- */
export const futex: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Lock: A does one atomic compare-and-swap, 0 to 1, on a word in user memory. Nothing enters the kernel. This fast path is why an uncontended lock is cheap.',
      add: [
        lane('a', 'Thread A', 200, 320),
        lane('b', 'Thread B', 340, 320),
        lane('k', 'Kernel', 480, 320),
        box('w', 10, 50, 110, 48, 'futex word', { sub: '1 = locked' }),
        { t: 'msg', id: 'c1', from: 'a', x2: 125, y: 80, text: 'CAS 0→1' } as El,
      ],
    },
    {
      caption: 'B’s swap fails, so B sets the word to 2, meaning locked with waiters, and gets ready to sleep. Still no syscall.',
      add: [{ t: 'msg', id: 'c2', from: 'b', x2: 125, y: 135, text: 'CAS fails', tone: 'red' } as El],
      set: { w: { sub: '2 = contended', tone: 'red' } },
    },
    {
      caption: '`futex(FUTEX_WAIT, addr, 2)`: the kernel re-checks that the word still equals 2, and only then parks B in a wait queue keyed by the address.',
      add: [msg('wt', 'b', 'k', 185, 'WAIT(w,2)'), box('q', 410, 205, 140, 48, 'queue for w', { sub: 'B asleep' })],
      stop: {
        title: 'Why pass the expected value?',
        edge: true,
        body: 'The check and the sleep are atomic inside the kernel. If A unlocked in between, the word changed and WAIT returns at once, so the wake-up is never lost.',
      },
    },
    {
      caption: 'A unlocks by swapping in 0 and sees the old value was 2, so it calls `FUTEX_WAKE`. The kernel keeps no lock state, only wait queues.',
      add: [{ t: 'msg', id: 'u1', from: 'a', x2: 125, y: 265, text: 'swap 0' } as El, msg('wk', 'a', 'k', 292, 'WAKE(w,1)', { tone: 'red' }), msg('bw', 'k', 'b', 322, 'wake B', { tone: 'red' })],
      set: { w: { sub: '0 = free', tone: 'grey' }, q: { tone: 'grey', sub: 'B woken' } },
    },
    {
      caption: 'Go’s `sync.Mutex` is not a futex: it spins briefly, then parks the goroutine in the runtime. Only a thread with nothing to run sleeps on a futex.',
      drop: ['a', 'b', 'k', 'w', 'c1', 'c2', 'wt', 'q', 'u1', 'wk', 'bw'],
      add: [
        text('sm', 280, 80, 'sync.Mutex is not a futex', { tone: 'grey' }),
        box('gp', 20, 110, 250, 70, 'goroutine blocks', { sub: 'runtime parks it' }),
        box('mp', 290, 110, 250, 70, 'idle thread (M)', { sub: 'FUTEX_WAIT_PRIVATE', tone: 'red' }),
        text('ms1', 280, 230, '2M lock/unlock, alone: ~10–20 futex calls', { size: 14 }),
        text('ms2', 280, 262, '8 goroutines, same 2M: ~100–1,300 calls', { size: 14, tone: 'red' }),
      ],
    },
  ],
}

/* ---------- 04 · CFS bandwidth throttling ---------- */
const trow = (i: number) => 90 + 34 * i
export const throttle: FlowDef = {
  h: 318,
  steps: [
    {
      caption: 'A quota is time, not cores. `cpu.max = 200000 100000` gives the container 200 ms of CPU per 100 ms window, however many threads spend it.',
      add: [
        box('bk', 20, 12, 520, 28, 'quota bucket: 200 ms of CPU'),
        text('ct', 280, 68, '"2 CPUs" of quota on a 4-core box', { tone: 'grey' }),
        { t: 'line', id: 'axis', x1: 20, y1: 236, x2: 540, y2: 236, tone: 'grey' } as El,
        text('x0', 20, 254, '0', { tone: 'grey' }),
        text('x1', 280, 254, '50 ms', { tone: 'grey' }),
        text('x2', 540, 254, '100 ms', { anchor: 'end', tone: 'grey' }),
      ],
    },
    {
      caption: 'Four busy threads start together, because Go runs one P (a slot for running goroutines) per core: four. Each burns 1 ms of quota per ms.',
      add: [0, 1, 2, 3].map((i) => box('t' + (i + 1), 20, trow(i), 40, 28, 'T' + (i + 1))),
    },
    {
      caption: '4 threads x 50 ms = 200 ms. The bucket is empty at half time.',
      set: { bk: { text: 'bucket empty at 50 ms', tone: 'red' }, t1: { w: 260 }, t2: { w: 260 }, t3: { w: 260 }, t4: { w: 260 } },
      stop: {
        title: 'When the bucket is empty',
        body: 'The group is throttled: its threads are taken off the CPUs until the next period refills the bucket, even with idle cores. It is a freeze, not a slowdown.',
      },
    },
    {
      caption: 'Frozen for the rest of the window. Measured: a 1 ms sleeper probe overslept up to ~50 ms (p99 25–50 ms) with 4 spinners; a few ms unthrottled.',
      add: [box('fz', 280, 86, 260, 138, 'all threads frozen', { sub: '~50 ms', dashed: true, tone: 'red' }), arrow('rq', 332, 296, 540, 296, { tone: 'red', text: 'request waits' })],
    },
    {
      caption: 'The kernel counts it in `cpu.stat`: 37–40 of 40 periods throttled. Watch `nr_throttled / nr_periods`, not average CPU%.',
      add: [box('cs', 20, 270, 300, 40, 'nr_throttled ~40 / 40 periods', { tone: 'red' })],
      stop: {
        title: 'Low average, still throttled',
        edge: true,
        body: (
          <>
            Bursts (GC, request spikes, many threads) drain the bucket early in the period. v1 <code>cpu.stat</code> has <code>throttled_time</code> in ns; v2 has <code>throttled_usec</code>.
          </>
        ),
      },
    },
    {
      caption: 'With `GOMAXPROCS=2`, two threads spend 2 x 100 ms: the bucket lasts the whole period. Same total work, only 7–8 of 40 periods throttled (measured, Go test).',
      drop: ['t3', 't4', 'fz', 'rq'],
      set: { bk: { text: 'bucket lasts the period', tone: 'ink' }, t1: { w: 520 }, t2: { w: 520 }, cs: { text: 'nr_throttled ~8 / 40 periods', tone: 'ink' } },
    },
  ],
}

/* ---------- 04 · Go container-aware GOMAXPROCS ---------- */
export const gomax: FlowDef = {
  h: 244,
  steps: [
    {
      caption: 'Go 1.25 reads the CPU quota. GOMAXPROCS is quota / period rounded up, capped at the real CPU count, and never below 2 (unless the machine has one CPU).',
      add: [
        box('p1', 10, 20, 160, 60, 'cpu.max', { sub: '250000 100000' }),
        box('p2', 200, 20, 160, 60, 'round up', { sub: '2.5 → 3' }),
        box('p3', 390, 20, 160, 60, 'clamp', { sub: 'min 2, max NumCPU' }),
        arrow('e1', 170, 50, 200, 50),
        arrow('e2', 360, 50, 390, 50),
      ],
    },
    {
      caption: 'Measured on a 4-core VM: quotas 0.5, 1.5 and 2.0 give 2; 3.2 rounds up to 4; 4.0 gives 4.',
      add: [
        box('x0', 10, 108, 100, 56, '0.5 CPU', { sub: '→ 2', tone: 'red' }),
        box('x1', 118, 108, 100, 56, '1.5 CPU', { sub: '→ 2' }),
        box('x2', 226, 108, 100, 56, '2.0 CPU', { sub: '→ 2' }),
        box('x3', 334, 108, 100, 56, '3.2 CPU', { sub: '→ 4' }),
        box('x4', 442, 108, 100, 56, '4.0 CPU', { sub: '→ 4' }),
      ],
    },
    {
      caption: 'It is gated on the `go` line in `go.mod`: with the 1.25 toolchain, a module saying `go 1.24` keeps the old behaviour (measured: 4 vs 2).',
      drop: ['x0', 'x1', 'x2', 'x3', 'x4'],
      add: [
        box('g1', 10, 108, 250, 70, 'go.mod: go 1.24', { sub: 'GOMAXPROCS = 4', tone: 'red' }),
        box('g2', 290, 108, 250, 70, 'go.mod: go 1.25', { sub: 'GOMAXPROCS = 2' }),
        text('gt', 280, 205, 'same code, same 2-CPU quota', { tone: 'grey' }),
      ],
      stop: {
        title: 'Upgraded Go, still 4',
        edge: true,
        body: (
          <>
            The go.mod line decides, not the toolchain. An explicit <code>GOMAXPROCS</code> env var or a <code>runtime.GOMAXPROCS(n)</code> call also turns it off, as does <code>GODEBUG=containermaxprocs=0</code>.
          </>
        ),
      },
    },
    {
      caption: 'The value is live: the runtime re-checks about once a second. Raising the quota from 2 to 3.5 CPUs moved GOMAXPROCS from 2 to 4 within 2.5 s.',
      drop: ['g1', 'g2', 'gt'],
      add: [box('l1', 10, 108, 200, 70, 'GOMAXPROCS 2', { sub: 'quota 2 CPUs' }), box('l2', 350, 108, 200, 70, 'GOMAXPROCS 4', { sub: 'quota 3.5 CPUs', tone: 'red' }), arrow('le', 210, 155, 350, 155, { tone: 'red', text: 'within 2.5 s' })],
    },
    {
      caption: 'It shrinks throttling but does not remove it: the floor of 2, GC and cgo threads, and a tighter limit on a parent cgroup still burn or hide quota.',
      drop: ['l1', 'l2', 'le'],
      add: [
        box('r1', 10, 108, 170, 70, 'floor of 2', { sub: '0.5 CPU, 2 Ps', dashed: true, tone: 'red' }),
        box('r2', 195, 108, 170, 70, 'GC, cgo', { sub: 'extra threads', dashed: true, tone: 'red' }),
        box('r3', 380, 108, 170, 70, 'parent cgroup', { sub: 'limit unseen', dashed: true, tone: 'red' }),
      ],
      stop: {
        title: 'Still throttled after upgrading',
        edge: true,
        body: (
          <>
            Check <code>nr_throttled</code> first. On older Go, or <code>go 1.24</code> in go.mod, set <code>GOMAXPROCS</code> from <code>limits.cpu</code> or use <code>automaxprocs</code>.
          </>
        ),
      },
    },
  ],
}

import { Code } from '../../components/Code'
import type { QuizItem } from '../../components/Quiz'
import type { InterviewQ } from '../../components/Interview'

export const quiz: QuizItem[] = [
  {
    id: 'scheduler.forloop',
    q: 'With Go 1.26 and GOMAXPROCS=1, what does this program do?',
    code: `runtime.GOMAXPROCS(1)
go func() { for {} }()
time.Sleep(10 * time.Millisecond)
fmt.Println("main done")`,
    options: ['Hangs forever', 'Prints "main done" after roughly 10–20ms', 'Panics: deadlock', 'Prints "main done" immediately'],
    answer: 1,
    explain: (
      <p>
        Since 1.14, sysmon sees P0 running the same G for 10ms and preempts it with SIGURG. main’s timer has fired, so main runs and prints. With <code>GODEBUG=asyncpreemptoff=1</code> (≈ Go ≤1.13) it
        hangs — verified on go1.26.4.
      </p>
    ),
  },
  {
    id: 'scheduler.threads',
    q: 'GOMAXPROCS=4. 500 goroutines are each blocked in a slow read(2) on a regular file. Roughly how many OS threads exist?',
    options: ['4', '5 (4 + sysmon)', '~500', 'The program crashes at 256 threads'],
    answer: 2,
    explain: (
      <p>
        Regular-file I/O isn’t netpolled on Linux, so each blocked read pins an M in the kernel. Their Ps get handed off to fresh Ms, which run the next goroutine, which also blocks… ~500 threads. Above
        10 000 (<code>debug.SetMaxThreads</code>) the runtime throws <code>fatal error: thread exhaustion</code>.
      </p>
    ),
  },
  {
    id: 'scheduler.net',
    q: 'Same setup, but the 500 goroutines are blocked in conn.Read on idle TCP connections. How many threads?',
    options: ['~500', 'About GOMAXPROCS plus a few (sysmon, idle Ms)', 'Exactly 1', 'One per CPU core, regardless of GOMAXPROCS'],
    answer: 1,
    explain: (
      <p>
        Sockets are non-blocking and registered with epoll. On EAGAIN the goroutine <code>gopark</code>s in “IO wait” and its M moves on to other work. No thread is held per connection — that’s why a
        Go server can hold 100k idle connections.
      </p>
    ),
  },
  {
    id: 'scheduler.gosched',
    q: 'Where does a goroutine go when it calls runtime.Gosched()?',
    options: ['The front of its P’s local queue', 'Its P’s runnext slot', 'The tail of its P’s local queue', 'The global run queue'],
    answer: 3,
    explain: (
      <p>
        <code>gosched_m → goschedImpl → globrunqput</code>. Same for sysmon-triggered preemption. That’s why the Gosched puzzle prints A B C: the yielding G waits behind everything local.
      </p>
    ),
  },
  {
    id: 'scheduler.overflow',
    q: 'A P’s local ring holds 256 Gs and its runnext is occupied. The running G calls go f(). What happens?',
    options: [
      'f is dropped into the global queue alone',
      'f goes to runnext; the old runnext is kicked out and, because the ring is full, 128 ring Gs plus the kicked G move to the global queue',
      'The runtime blocks until the ring has room',
      'The ring grows to 512 slots',
    ],
    answer: 1,
    explain: (
      <p>
        <code>runqput(next=true)</code> puts f in runnext and tries to append the displaced G to the ring. The ring is full, so <code>runqputslow</code> moves half the ring plus that G to the global queue
        in one locked batch. The Queue overflow scenario in the lab shows this at a scale of 8.
      </p>
    ),
  },
  {
    id: 'scheduler.61',
    q: 'Why does findRunnable check the global queue first on every 61st schedule?',
    options: [
      'To balance load across NUMA nodes',
      'So the global queue can’t be starved by goroutines that keep refilling the local queue/runnext',
      'Because 61 is the number of size classes',
      'To give sysmon a chance to run',
    ],
    answer: 1,
    explain: <p>If a P always has local work (e.g. two goroutines waking each other through runnext), it would never look at the global queue. The %61 tick guarantees progress for global Gs.</p>,
  },
  {
    id: 'scheduler.container',
    q: 'Go 1.26 binary, go.mod says go 1.26, pod has limits.cpu: 500m on a 32-core node, GOMAXPROCS env unset. What is runtime.GOMAXPROCS(0)?',
    options: ['1', '2', '32', '0.5 rounded up to 1'],
    answer: 1,
    explain: <p>Container-aware default: min(32, max(2, ceil(0.5))) = 2. The limit is floored at 2 so GC workers aren’t serialized with the only P. CPU requests are ignored.</p>,
  },
  {
    id: 'scheduler.spawn',
    q: 'After `go f()` returns in the caller, which statement is true?',
    options: ['f has started executing', 'f is runnable in the caller’s P runnext, and another idle P may be woken to steal it', 'f runs on a brand-new OS thread', 'f is on the global run queue'],
    answer: 1,
    explain: (
      <p>
        <code>newproc</code> creates the G (reusing a dead one from the P’s free list if possible), puts it in runnext and calls <code>wakep()</code>. The caller keeps running. Nothing guarantees f has
        started.
      </p>
    ),
  },
]

export const interview: InterviewQ[] = [
  {
    id: 'why-p',
    level: 'core',
    q: 'Why does the scheduler need P? Why not just goroutines and threads?',
    a: (
      <p>
        With only G and M, run queues must be either global (one lock for everything) or per-thread (work gets stranded when a thread blocks in a syscall). P holds the run queue, mcache and timers and
        can be detached from a blocked M and handed to another one. Result: lock-free local scheduling, allocator caches that scale with GOMAXPROCS rather than thread count, bounded parallelism with
        unbounded threads.
      </p>
    ),
  },
  {
    id: 'threads',
    level: 'core',
    q: 'How many OS threads can a Go program have?',
    a: (
      <p>
        GOMAXPROCS bounds <em>running</em> Ms, not threads. The cap is <code>debug.SetMaxThreads</code>, default 10 000; exceeding it is a fatal error, not a returned error. Typical extra threads:
        sysmon, Ms blocked in syscalls/cgo, idle Ms, locked Ms, the template thread.
      </p>
    ),
  },
  {
    id: 'syscall',
    level: 'senior',
    q: 'Walk me through what happens when a goroutine makes a blocking syscall.',
    a: (
      <>
        <p>
          <code>entersyscall</code> saves SP/PC, sets <code>m.oldp</code>, marks the G <code>_Gsyscall</code>. The P stays attached (cheap path). If the syscall is still running on the next sysmon
          tick (~20 µs) and there’s other work, sysmon retakes the P and <code>handoffp</code> starts an M for it (idle or new). With nothing queued it may leave the P for up to 10 ms.
        </p>
        <p>
          On return, <code>exitsyscall</code>: fast path if the old P is still ours; else grab an idle P; else G → global queue and the M parks. Calls known to block (<code>entersyscallblock</code>) hand
          off immediately.
        </p>
      </>
    ),
  },
  {
    id: 'netread',
    level: 'core',
    q: 'And a network read that would block?',
    a: <p>Non-blocking fd, edge-triggered epoll. EAGAIN → <code>gopark</code> with wait reason “IO wait”. The M keeps its P and runs another G. The netpoller readies the G later — no thread per connection.</p>,
  },
  {
    id: 'runnext',
    level: 'senior',
    q: 'What is runnext and what problem does it solve?',
    a: (
      <p>
        A one-slot, per-P “run me next” lane. <code>go</code> and <code>goready</code> put the new/woken G there, kicking the previous occupant to the ring tail. The G taken from runnext inherits the
        current time slice (schedtick isn’t bumped), so producer/consumer pairs stay on one P with hot caches, but sysmon can still preempt the pair after 10 ms. Stealers leave runnext alone except on
        the last pass after a 3 µs back-off.
      </p>
    ),
  },
  {
    id: 'steal',
    level: 'senior',
    q: 'Explain work stealing in detail.',
    a: (
      <p>
        <code>stealWork</code> makes up to 4 passes over all Ps in a random order (random start, coprime stride), skipping idle Ps. <code>runqgrab</code> takes half the victim’s ring, rounded up. Only
        the last pass may run the victim’s expired timers or take its runnext. Stealing only happens if this M is spinning or spinners are fewer than half the busy Ps.
      </p>
    ),
  },
  {
    id: 'spinning',
    level: 'senior',
    q: 'What is a spinning M and why does the runtime limit them?',
    a: (
      <p>
        An M that holds a P but has no work and is actively looking (stealing) before it parks. Spinning burns CPU, parking/unparking costs latency. <code>wakep</code> only starts a new spinner if none
        exist; the last spinner that finds work wakes a replacement. That gives quick ramp-up without thundering herds or lost wake-ups.
      </p>
    ),
  },
  {
    id: 'sysmon',
    level: 'core',
    q: 'What does sysmon do?',
    a: (
      <p>
        A dedicated M without a P, sleeping 20 µs → 10 ms (backs off when idle). It retakes Ps from syscalls, preempts Gs running &gt;10 ms, polls the network if nobody has for 10 ms, forces a GC if
        none ran for 2 minutes, wakes the scavenger, re-evaluates GOMAXPROCS (1.25+), and prints <code>schedtrace</code>.
      </p>
    ),
  },
  {
    id: 'preemptive',
    level: 'core',
    q: 'Is the Go scheduler preemptive?',
    a: (
      <p>
        Yes since 1.14. Cooperative preemption at function prologues (poisoned <code>stackguard0</code>) plus signal-based async preemption (SIGURG) for loops without calls. Time slice ≈10 ms,
        enforced by sysmon. No priorities, no per-G fairness guarantee.
      </p>
    ),
  },
  {
    id: 'sigurg',
    level: 'staff',
    q: 'Why SIGURG, and can any instruction be preempted asynchronously?',
    a: (
      <p>
        SIGURG is passed through by debuggers, unused by libc, and harmless if spurious (the handler re-checks <code>wantAsyncPreempt</code>). Not every PC is safe: the runtime itself, nosplit/assembly
        without safe-point metadata, <code>m.locks&gt;0</code>, mid-malloc. <code>isAsyncSafePoint</code> rejects those and the request stays pending until the next synchronous check.
      </p>
    ),
  },
  {
    id: 'gomaxprocs-k8s',
    level: 'senior',
    q: 'Pod with limits.cpu: 2 on a 64-core node. What is GOMAXPROCS and why does it matter?',
    a: (
      <p>
        Go ≥1.25 with a ≥1.25 go.mod: 2, tracking changes. Older: 64. With 64 Ps and a 2-CPU CFS quota, the process burns its 200 ms of CPU per 100 ms period in a burst and is throttled for the rest —
        p99 spikes. Requests never count; a 500m limit still gives 2 (floor). Setting GOMAXPROCS explicitly disables the automatic behaviour.
      </p>
    ),
  },
  {
    id: 'stack',
    level: 'core',
    q: 'How big is a goroutine stack and how does it grow?',
    a: <p>2 KiB minimum (adaptive start since 1.19). Growth doubles by copying into a new contiguous stack with pointer adjustment. Shrinks by half during GC if &lt;¼ is used. Max 1 GB on 64-bit, then fatal “stack overflow”.</p>,
  },
  {
    id: 'lockosthread',
    level: 'senior',
    q: 'What does runtime.LockOSThread do? What if the goroutine exits while locked?',
    a: (
      <p>
        Wires the G to its M: that M runs nothing else, and every reschedule of the G hands the P to that specific M (two thread switches). Used for thread-local OS state (namespaces, GUI main threads,
        some C libraries). If the goroutine exits still locked, the thread is terminated rather than reused (since 1.10), so tainted thread state can’t leak.
      </p>
    ),
  },
  {
    id: 'chansend',
    level: 'senior',
    q: 'Unbuffered send when a receiver is already parked: how many copies, and who runs next?',
    a: <p>One copy, directly onto the receiver’s stack (<code>sendDirect</code>). The receiver is readied into the sender’s runnext; the sender keeps running until it blocks or is preempted.</p>,
  },
  {
    id: 'sleep',
    level: 'senior',
    q: 'Why can time.Sleep(1ms) take much longer?',
    a: <p>Timers live in per-P heaps and fire from the scheduler (findRunnable, netpoll timeouts, stealing). If every P is busy with long-running Gs, the woken G waits for a free P — up to the 10 ms preemption slice — plus OS timer slack.</p>,
  },
  {
    id: 'deadlock',
    level: 'senior',
    q: 'When does the runtime report “all goroutines are asleep – deadlock!”?',
    a: <p><code>checkdead</code> fires only when no M is running Go code and no timers are pending. One leaked goroutine among live ones is never reported; an HTTP server with a deadlock isn’t either, because the netpoller keeps it alive.</p>,
  },
  {
    id: 'leaks',
    level: 'senior',
    q: 'How do you find goroutine leaks?',
    a: (
      <p>
        Trend <code>runtime.NumGoroutine()</code>; <code>/debug/pprof/goroutine?debug=2</code> groups stacks with wait reasons and minutes blocked; <code>goleak</code> in tests;{' '}
        <code>testing/synctest</code> for deterministic concurrency tests. Go 1.26 adds a <code>goroutineleak</code> profile (<code>GOEXPERIMENT=goroutineleakprofile</code>) where the GC proves a blocked
        goroutine can never be woken.
      </p>
    ),
  },
  {
    id: 'race-order',
    level: 'staff',
    q: 'Why does goroutine ordering change under -race?',
    a: <p>The race runtime sets <code>randomizeScheduler</code>: it skips runnext half the time and shuffles overflow batches, to flush out code that depends on scheduling order.</p>,
  },
  {
    id: 'schedtrace',
    level: 'senior',
    q: 'What does GODEBUG=schedtrace=1000 show?',
    a: (
      <>
        <p>Once a second: GOMAXPROCS, idle Ps, threads, spinning threads, global queue length, and each P’s local queue length. Add scheddetail=1 for per-G/M/P state.</p>
        <Code light>{`SCHED 1004ms: gomaxprocs=8 idleprocs=6 threads=12 spinningthreads=1 needspinning=0 idlethreads=4 runqueue=0 [3 0 0 0 0 0 0 0]`}</Code>
      </>
    ),
  },
  {
    id: 'go126-syscall',
    level: 'staff',
    q: 'What changed about syscalls in Go 1.26?',
    a: <p><code>_Psyscall</code> was removed. A P whose G is in a syscall stays <code>_Prunning</code>; sysmon uses the G’s <code>_Gscan</code> bit (<code>setBlockOnExitSyscall</code>) to block the exit while it takes the P. Release notes also report ~30% lower cgo call overhead.</p>,
  },
  {
    id: 'mutex-starve',
    level: 'staff',
    q: 'How does sync.Mutex interact with the scheduler under contention?',
    a: <p>Normal mode lets a running goroutine barge in (good throughput). After a waiter waits &gt;1 ms the mutex enters starvation mode: Unlock hands ownership directly to the head waiter, puts it in runnext and yields so it runs immediately with the inherited time slice.</p>,
  },
  {
    id: 'goid',
    level: 'core',
    q: 'Does `go f()` start f immediately? Can you rely on ordering between goroutines?',
    a: <p>No and no. The G goes to runnext; another P may steal it; order depends on GOMAXPROCS, timing and -race. Use channels, WaitGroup, or mutexes to establish happens-before.</p>,
  },
]

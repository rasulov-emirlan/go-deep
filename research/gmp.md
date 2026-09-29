# Go runtime scheduler (GMP): research notes

Source of truth: **Go 1.26.4** at `/usr/local/go/src/runtime`. Line numbers refer to that tree (`proc.go:3389` = `findRunnable`).
Puzzle outputs marked **[verified]** were run on this box (go1.26.4, linux/amd64, 8 CPUs).
Web sources: go.dev release notes [1.14](https://go.dev/doc/go1.14), [1.25](https://go.dev/doc/go1.25), [1.26](https://go.dev/doc/go1.26); Vyukov, *Scalable Go Scheduler Design Doc* (2012, https://golang.org/s/go11sched, linked from the `proc.go` header).

---

## 0. One-paragraph model

- **G** is a goroutine: a stack plus saved registers (`gobuf`).
- **M** is an OS thread.
- **P** is a "processor". It is the *permission to run Go code* and owns the scheduling resources: a local run queue, an mcache, a timer heap, and free-G/sudog caches. There are exactly `GOMAXPROCS` Ps.

An M must hold a P to execute Go code (`proc.go:25-33`). An M can exist without a P while it is blocked in a syscall or in cgo, while it is idle/parked, or when it is sysmon. That split is the whole point: **thread count is unbounded (up to 10 000), while parallelism is bounded by P count.**

### Why P exists (Vyukov 2012)

The Go 1.0 scheduler was G–M only, and it had four problems:
1. A single global `Sched.Lock` guarded every runnable-G operation.
2. Ms passed Gs between each other, which hurt locality and added latency.
3. Every M had its own mcache (~2 MB), including Ms blocked in syscalls, so memory was wasted.
4. Threads blocked and unblocked too aggressively in syscalls.

P fixes these:
- The run queue moves to P, so it is lock-free and local.
- The mcache moves to P, so memory scales with GOMAXPROCS and not with thread count.
- A blocked M can hand its P, with all its runnable work, to another M.

---

## 1. Structs (`runtime2.go`)

### `type g struct` (`runtime2.go:473`)

| field | meaning |
|---|---|
| `stack {lo,hi}` | current stack bounds |
| `stackguard0` | Compared in every function prologue. Normally `stack.lo+stackGuard`. It is **poisoned to `stackPreempt`** to request cooperative preemption (`runtime2.go:476-482`). |
| `m` | the M currently running this G, or nil |
| `sched gobuf` | saved SP/PC/BP/ctxt, restored by `gogo` |
| `atomicstatus` | the state (see below) |
| `goid`, `parentGoid` | IDs are handed out in per-P batches (`goidcache`, `proc.go` newproc1) |
| `waitreason` | why it is `_Gwaiting` (shown in stack dumps: "chan receive", "select", "sleep" …) |
| `preempt`, `preemptStop`, `preemptShrink`, `asyncSafePoint` | preemption flags (`runtime2.go:514-521`) |
| `lockedm` | set by `LockOSThread` |
| `schedlink` | intrusive link used by run queues |
| `waiting *sudog` | the sudogs this G is parked on (channels/select) |
| `syscallsp/pc/bp` | where it entered the syscall |

### `type m struct` (`runtime2.go:618`)

| field | meaning |
|---|---|
| `g0` | Scheduler stack: a large OS/system stack. `schedule()` runs on g0. |
| `gsignal` | signal-handling G |
| `curg` | the user G that is running |
| `p` | the attached P (nil in syscall/idle) |
| `nextp` | P to acquire on wakeup |
| `oldp` | P held before the syscall (`runtime2.go:644`) |
| `spinning` | out of work and actively looking (`runtime2.go:652`) |
| `lockedg` | the G this M is locked to |
| `locks` | >0 means non-preemptible |
| `syscalltick` | snapshot used by the syscall exit fast path |
| `signalPending` | an async-preempt signal is in flight |

### `type p struct` (`runtime2.go:772`)

| field | meaning |
|---|---|
| `status` | `_Pidle`, `_Prunning`, `_Pgcstop`, `_Pdead`. **Go 1.26: `_Psyscall` is gone (`_Psyscall_unused`)**: "A P is identified as 'in a system call' by looking at the goroutine's state" (`runtime2.go:143-146`). |
| `schedtick` | Incremented on each `execute` that does **not** inherit time. Used for `%61` and by sysmon. |
| `syscalltick` | incremented per syscall; sysmon compares it |
| `sysmontick` | sysmon's last observation |
| `runqhead, runqtail, runq [256]guintptr` | lock-free SPMC ring. Only the owner produces; the owner and thieves consume. |
| `runnext` | a 1-slot "run me next" LIFO fast lane (`runtime2.go:806-818`) |
| `timers` | per-P timer heap |
| `mcache`, `gFree`, `sudogcache`, `deferpool`, `gcw` | per-P caches |
| `preempt` | set together with async preemption (`runtime2.go:911-913`) |

### `type schedt struct` (`runtime2.go:930`)

Global state guarded by `sched.lock`:
- `runq gQueue`: the global run queue (unbounded linked list)
- `midle`, `nmidle`: idle Ms
- `pidle`, `npidle`: idle Ps
- `nmspinning`, `needspinning`
- `maxmcount` (=10000, `proc.go:863`)
- `lastpoll`, `pollUntil`, `gcwaiting`, `stopwait`, `sysmonwait`

### G states (`runtime2.go:37-118`)

| const | val | meaning |
|---|---|---|
| `_Gidle` | 0 | just allocated |
| `_Grunnable` | 1 | on a run queue, not executing |
| `_Grunning` | 2 | executing user code; owns an M and a P |
| `_Gsyscall` | 3 | In a syscall. Has an M. **In 1.26 the P stays attached (`_Prunning`) until someone retakes it.** |
| `_Gwaiting` | 4 | blocked in the runtime (chan, mutex, netpoll, sleep); not on any run queue; `waitreason` says why |
| `_Gmoribund_unused` | 5 | – |
| `_Gdead` | 6 | unused; sits on a gFree list for reuse (the stack may be kept) |
| `_Genqueue_unused` | 7 | – |
| `_Gcopystack` | 8 | its stack is being moved |
| `_Gpreempted` | 9 | stopped itself for a `suspendG` preemption (GC stack scan); like waiting, but nobody owns it yet |
| `_Gleaked` | 10 | **new in 1.26**: the GC proved a blocked goroutine can never wake (goroutineleak profile, `mgc.go:1318`) |
| `_Gscan` | 0x1000 | OR-ed bit: the GC is scanning the stack (`_Gscanrunnable` …) |

Main transitions:
```
newproc:        Gidle → Gdead → Grunnable
execute:        Grunnable → Grunning
gopark:         Grunning → Gwaiting        → (goready/ready) → Grunnable
Gosched/preempt:Grunning → Grunnable
entersyscall:   Grunning → Gsyscall        → exitsyscall → Grunning (fast) | Grunnable (no P)
suspendG:       Grunning → Gpreempted → Gwaiting (by the suspender) → Grunnable
goexit0:        Grunning → Gdead (gfput to P's free list)
```

---

## 2. Run queues

### Local runq: `runqput` (`proc.go:7478`)

- The `go` statement calls `newproc` (`proc.go:5295`), which does `runqput(pp, newg, next=true)`: **the new G goes into `runnext`.** The old `runnext`, if any, is kicked to the tail of the ring. It then calls `wakep()` if `mainStarted`.
- The ring holds 256 slots. Producer: `store-release` of `runqtail`. Consumers: CAS on `runqhead`.
- When the ring is full, `runqputslow` (`proc.go:7524`) moves **half (128) plus the new G** to the global queue in one batch under `sched.lock`.
- `runqget` (`proc.go:7598`) tries **runnext first** and returns `inheritTime=true`. Then it takes from the ring head (`inheritTime=false`).
- `inheritTime` means `execute` does not bump `schedtick` (`proc.go:3346-3348`). A runnext chain therefore shares one time slice. That is how sysmon still preempts a ping-pong pair: it looks at `schedtick` + 10 ms (`proc.go:6655-6666`).
- If there is no sysmon (wasm), runnext is disabled (`proc.go:7479-7489`).
- The race detector randomizes the scheduler (`randomizeScheduler`): runnext is skipped 50% of the time and slow-put batches are shuffled. **Ordering puzzles behave differently under `-race`.**

### Global runq

- `sched.runq` is an unbounded `gQueue` behind `sched.lock`.
- Gs land there from:
  - `runqputslow` overflow
  - `runtime.Gosched()` / preemption (`goschedImpl` → `globrunqput`, `proc.go:4330-4338`). Exception: a G preempted for STW goes back to runnext.
  - `injectglist` when there are no Ps
  - syscall exit when no P is available
- `globrunqgetbatch(n)`: `n = min(n, size, size/gomaxprocs+1)`, with `n ≤ 128` (`len(runq)/2`). This gives a fair share.

### `schedule()` → `findRunnable()` order (`proc.go:4135`, `proc.go:3389`)

1. If GC STW is waiting, `gcstopm`. Run `runSafePointFn`.
2. `pp.timers.check(now)`: run due timers on **this** P.
3. Trace reader G, then GC mark worker (`findRunnableGCWorker`).
4. **Fairness:** `if pp.schedtick%61 == 0 && !sched.runq.empty()`, take **one** G from global (`proc.go:3441-3448`). 61 is prime and "not too small, not too big". Without it, two goroutines respawning each other could starve the global queue forever.
5. Wake the finalizer G and cleanup Gs if needed.
6. **Local runq** (runnext, then ring).
7. **Global runq** batch (up to 128) into the local queue.
8. **Netpoll, non-blocking** (`netpoll(0)`). Only one thread polls at a time (`sched.pollingNet`). The first G is returned; the rest go through `injectglist`.
9. **Steal.** Only if this M is already spinning, or `2*nmspinning < gomaxprocs - npidle`. That caps spinners at half the busy Ps. Calls `stealWork`.
10. Idle-priority GC mark work.
11. Release P: `pidleput`. The M stops spinning, then **re-checks** global, all runqs (`checkRunqsNoP`), idle GC, and timers. This is the "delicate dance" from the `proc.go:36-93` header comment: *decrement nmspinning → StoreLoad barrier → recheck all work sources*, which pairs with the submitters' *enqueue → barrier → check nmspinning*.
12. **Blocking netpoll** (`netpoll(delay)`) until the next timer. Only one M does this (`sched.lastpoll.Swap(0)`).
13. `stopm()`: park the M on `sched.midle` (futex sleep).

### Work stealing: `stealWork` (`proc.go:3828`)

- `stealTries = 4` passes. Each pass visits every P in a **random order**: `stealOrder.start(cheaprand())`, which enumerates `(i + X) % n` with `X` coprime to n (`proc.go:7993-8009`).
- Idle Ps (`idlepMask`) are skipped.
- `runqsteal` → `runqgrab` (`proc.go:7662`) takes **`n - n/2`, i.e. half rounded up**.
- **Only on the last pass** (`stealTimersOrRunNextG`):
  - it may run the victim P's **expired timers** (`p2.timers.check`);
  - it may steal the victim's **`runnext`**. Before doing that it **sleeps 3 µs** if the victim is running, so the victim gets a chance to run its own runnext (`proc.go:7670-7695`). A chan handoff is about 50 ns, so this avoids thrashing ping-pong pairs across Ps.

### Spinning Ms, `wakep`, `startm`, `handoffp`

- **`wakep()`** (`proc.go:3212`) starts at most one new spinning M, and only if `nmspinning == 0` (CAS 0→1) and an idle P exists. It is called from `ready`, `newproc`, `goschedImpl`, and when `findRunnable` returns `tryWakeP`.
- **`resetspinning()`** (`proc.go:4021`): when a spinning M finds work it stops spinning. If it was the *last* spinner, it calls `wakep()` to keep one searcher alive. This is the "chain reaction" that ramps up parallelism without thundering herds.
- **`startm(pp, spinning)`** (`proc.go:3035`) reuses an idle M from `sched.midle` or creates one with `newm` (`checkmcount`).
- **`handoffp(pp)`** (`proc.go:3131`) is called when an M must give up its P (syscall retake, `entersyscallblock`, locked G). It starts an M for the P if any of these holds:
  - there is local or global work, a trace reader, or GC work;
  - there are no spinners and no idle Ps (start a spinning M);
  - it is the last non-idle P and a netpoller is needed.

  Otherwise it puts the P on the idle list and wakes the netpoller for the P's next timer.

---

## 3. sysmon (`proc.go:6486`)

sysmon is a dedicated **M with no P**, started in `runtime.main` (`newm(sysmon, nil)`). Because it has no P it can run while every P is stuck, and write barriers are not allowed in it.

- **Sleep:** 20 µs at first. After 50 consecutive idle cycles (~1 ms) the sleep doubles, up to a cap of 10 ms (`proc.go:6497-6506`). If all Ps are idle or GC is waiting, it enters a deep sleep on `sched.sysmonnote` until the next timer or `forcegcperiod/2`.
- **Each tick:**
  - **Netpoll** if nobody has polled for more than 10 ms; runnable Gs go through `injectglist`.
  - **GOMAXPROCS re-evaluation** at most once per second (`sysmonUpdateGOMAXPROCS`, when `updatemaxprocs=1`; new in 1.25).
  - Wake the scavenger.
  - **`retake(now)`** (`proc.go:6630`), described below.
  - **forcegc**: if no GC has run for 2 min (`forcegcperiod`), inject the forcegc G.
  - `schedtrace` output (`GODEBUG=schedtrace=1000,scheddetail=1`).

### `retake`

For each `_Prunning` P:
- **Long-running G:** if `pp.schedtick` has not changed for **10 ms** (`forcePreemptNS`, `proc.go:6628`), call `preemptone(pp)`.
- **Syscall (1.26 mechanics):** `setBlockOnExitSyscall(pp)` grabs the G's `_Gscan` bit while it is in `_Gsyscall`, which blocks the G from leaving the syscall. The P is **retaken if the syscall has spanned at least one sysmon tick (≥20 µs)**, *unless* the P's runq is empty **and** there are spinning/idle Ps **and** the syscall is under 10 ms. Retaking means `thread.takeP()` → `handoffp(pp)`.
- Rule of thumb: **a syscall that lasts ≥ ~20 µs with work queued loses its P; with nothing queued it keeps the P up to 10 ms.**

---

## 4. Syscalls and cgo

- **`entersyscall`** → `reentersyscall` (`proc.go` ~4600):
  - saves SP/PC and poisons `stackguard0`;
  - sets `m.oldp = pp`;
  - casts G to `_Gsyscall`.

  **The P is not released** (the P state is unchanged since 1.26). It is "cheap": no handoff.
- **`entersyscallblock`** is used for calls known to block (for example some `notesleep` paths). It does `handoffp(releasep())` **immediately**.
- **`exitsyscall`** (`proc.go:4883`) has three paths:
  - *fast*: still owns its P → back to `_Grunning`, `syscalltick++`;
  - *slow*: the P was retaken → `exitsyscallTryGetP(oldp)`, preferring the old P, else an idle P;
  - *slowest*: no P → the G becomes `_Grunnable` and goes to the global runq, and the M `stopm`s.
- **Consequences:**
  - The number of threads blocked in syscalls is *not* limited by GOMAXPROCS.
  - 1000 goroutines each in a blocking `read(2)` on a file can mean ~1000 threads. File I/O is **not** netpolled on Linux; regular files are always "ready" for epoll.
  - `debug.SetMaxThreads` (default **10000**, `proc.go:863`) turns this into a crash: `runtime: program exceeds N-thread limit / fatal error: thread exhaustion` **[verified with SetMaxThreads(20) + 50 blocking nanosleeps]**. `checkmcount` excludes extra Ms used for C-created threads (`proc.go:963-975`, go.dev/issue/60004).
- **cgo:**
  - A C call is treated as a syscall (`entersyscall` in `cgocall`): the G is `_Gsyscall` and sysmon can retake the P.
  - A C→Go callback on a C-created thread borrows an "extra M" (`needm`).
  - 1.26 cut baseline cgo call overhead by about 30%, per the release notes. That is plausibly linked to the removal of `_Psyscall` (inference, not stated in the notes).

---

## 5. Netpoller (`netpoll.go`, `netpoll_epoll.go`)

- Linux uses **epoll in edge-triggered mode**: `EPOLLIN|EPOLLOUT|EPOLLRDHUP|EPOLLET`. Each fd is registered once at open (`netpoll_epoll.go:51`).
- Each `pollDesc` has `rg`/`wg` semaphores. Their value is `pdNil`, `pdReady`, `pdWait`, or a `*g` (`netpoll.go:54-101`).
- A `net.Conn.Read` that hits `EAGAIN` → `netpollblock` → **`gopark`**. The G becomes `_Gwaiting` ("IO wait"). **No thread is blocked; the M runs other Gs.**
- Where `netpoll()` is called:
  - `findRunnable`, non-blocking, before stealing, and blocking as the last resort before `stopm`;
  - sysmon, if more than 10 ms since the last poll;
  - `startTheWorld`.
- `netpollBreak` (an eventfd) interrupts a blocking `epoll_wait` when an earlier timer is added.
- Deadlines (`SetDeadline`) are runtime timers that ready the parked G with a timeout error.

## 6. Timers (`time.go`)

- **Before 1.14:** 64 global timer buckets, each with its own `timerproc` goroutine. That meant lock contention and extra context switches.
- **Since 1.14:** **each P owns a heap of timers** (`type timers struct`, `time.go:131`), which is a **4-ary min-heap** (`timerHeapN = 4`, `time.go:1343`). Timers are run by the scheduler itself:
  - `findRunnable` step 2;
  - stolen P timers in `stealWork` (last pass);
  - `checkTimersNoP`;
  - netpoll sleep duration = the next timer.

  There is no timerproc goroutine. The 1.14 release notes say timers are "more efficient, with less lock contention and fewer context switches".
- **1.23:** `time.Timer`/`Ticker` channels became unbuffered (cap 0). Unreferenced timers are GC-eligible even if not stopped.
- `time.Sleep` → `timeSleep` (`time.go:330`) → `gopark(waitReasonSleep)`. The timer readies the G.

---

## 7. Preemption

`preempt.go` header, lines 5-50, defines three kinds of safe point: **blocked**, **synchronous**, and **asynchronous**.

### Cooperative (all versions)

- Every non-`nosplit` function prologue compares SP with `g.stackguard0`.
- To request preemption, the runtime sets `gp.preempt=true` and `gp.stackguard0 = stackPreempt` (a huge value), so the next check fails.
- `morestack` → `newstack` (`stack.go:1026`) sees `stackguard0 == stackPreempt` (`stack.go:1093`) and calls `gopreempt_m` → `goschedImpl(preempted=true)`. The G goes to the **global** runq.
- Other sync points: channel ops, `Gosched`, `gopark`, allocation, and so on.
- **Weakness:** a loop with no function calls (`for {}` or `for i:=0;i<1e10;i++{sum+=i}`) never reaches a prologue.

### Async preemption (Go 1.14+)

1. `preemptone(pp)` (`proc.go:6866`) sets the cooperative flags and also `pp.preempt=true`, then calls `preemptM(mp)` (`signal_unix.go:369`).
2. `preemptM` sends **SIGURG** to that thread (`sigPreempt = _SIGURG`, `signal_unix.go:74`), deduplicated by `mp.signalPending`.
3. SIGURG was chosen because debuggers pass it through, it has no libc use, and spurious delivery is harmless.
4. The signal handler (`doSigPreempt`) checks `wantAsyncPreempt(gp)` (G or P flagged, and `_Grunning`, `preempt.go:369`) and `isAsyncSafePoint` (not in the runtime, not in nosplit/assembly without safe-point metadata, enough stack, and so on).
5. If both hold, it rewrites the signal context so the thread "calls" `asyncPreempt`. `asyncPreempt` spills all registers and enters the scheduler. The stack scan of that frame is conservative.
6. Triggers: sysmon's 10 ms `retake`, and GC `suspendG` for stack scanning (uses `preemptStop` → `_Gpreempted`).
7. Disable with `GODEBUG=asyncpreemptoff=1`.
8. It is unsupported on some platforms (wasm; the 1.14 notes list windows/arm, darwin/arm, js/wasm, plan9).
9. **Side effect:** more signals means more `EINTR` from slow syscalls made through the `syscall` / `x/sys/unix` packages. The 1.14 notes say to loop and retry. The `os` and `net` packages already retry.

### Tight loop before and after 1.14 **[verified]**

```go
runtime.GOMAXPROCS(1)
go func(){ for {} }()
time.Sleep(10*time.Millisecond)
fmt.Println("main done")
```

- On 1.26 it prints `main done`.
- With `GODEBUG=asyncpreemptoff=1`, which reproduces the pre-1.14 behaviour, it **hangs forever** (the timeout killed it, exit 124).
- Why it hangs: main sleeps, the spinner takes the only P, and nothing can stop it.
- Pre-1.14 there was a second hazard even with GOMAXPROCS>1: the GC's STW waits for all Gs, so one tight loop froze the entire program.

---

## 8. GOMAXPROCS

- **Default ≤1.24:** `runtime.NumCPU()`, i.e. the affinity mask at startup.
- **Go 1.25, container-aware** (`cgroup_linux.go:85-120`):
  - The default is `min(logical CPUs from sched_getaffinity, ceil(cgroup quota/period))`, with the cgroup limit **floored at 2**. So `limits.cpu: 1.5` gives 2, and `limits.cpu: 500m` also gives 2.
  - Only the CPU **limit** (CFS bandwidth) counts, **not** CPU *requests*.
  - The runtime also **re-evaluates periodically** (about once per second in sysmon) on all OSes, if the affinity or the limit changes.
  - Both behaviours turn off if you set `GOMAXPROCS` via env or `runtime.GOMAXPROCS(n)`.
  - GODEBUG switches are `containermaxprocs=0` and `updatemaxprocs=0` (`runtime1.go:375,403`). Like all GODEBUG defaults they depend on the main module's `go` line, so a module with `go 1.24` keeps the old behaviour.
  - New API `runtime.SetDefaultGOMAXPROCS()` (`debug.go:117`) re-enables the automatic default after a manual set.
  - This makes `uber-go/automaxprocs` mostly obsolete.
  - Why the floor of 2: a GOMAXPROCS of 1 serializes GC workers with user code. Why it matters at all: a quota-throttled container with GOMAXPROCS=64 burns its CFS quota in bursts, and you see 100 ms throttling stalls at tail latency.
- `runtime.GOMAXPROCS(n)` does a stop-the-world `procresize`. It returns the previous value; `GOMAXPROCS(0)` just queries.
- There is no upper cap today; the old 256/1024 limit was removed in Go 1.10.

---

## 9. `runtime.LockOSThread`

- Wires G↔M: `g.lockedm` / `m.lockedg`. Two counters exist:
  - `lockedExt` for user nesting, up to 2^32;
  - `lockedInt` for the runtime.
- `schedule()` on a locked M: `stoplockedm` parks the M until its G is runnable. When another M finds a locked G, `startlockedm` **hands the P directly** to the owning M and parks itself (`proc.go:4143-4146`, `proc.go:4225`). This costs two thread switches.
- **The M does not run other goroutines while locked.** Every other G runs on other Ms.
- **When to use it:** OS per-thread state such as `setns`/namespaces, UI main-thread APIs, thread-local C libraries, `syscall.Setuid` pre-1.16. `init`-time `LockOSThread` pins `main` to the main thread.
- **If a goroutine exits while still locked, the thread is terminated, not reused** (since 1.10). That is how tainted thread state stays contained.
- Calling `LockOSThread` lazily starts the "template thread" (`proc.go:5624-5626`), which clones clean threads.

---

## 10. Goroutine stacks

- **Minimum and initial size:** `stackMin = 2048` (2 KiB, `stack.go:78`).
- **Adaptive start:** since Go 1.19 (`adaptivestackstart`, default on, `runtime1.go:410`), `startingStackSize` is recomputed at each GC as the **average scanned stack size**, rounded to a power of 2, minimum 2 KiB (`stack.go:1386-1430`). New Gs may therefore start with 4 or 8 KiB in a program whose goroutines are deep.
- Interview answer: **"2 KB minimum; adaptive since 1.19".** The "8 KB" answer is from Go 1.2–1.3. Go 1.2 raised the minimum from 4 KB to 8 KB, and Go 1.4 lowered it to 2 KB once stacks were copyable.
- **Growth:**
  - The prologue check fails → `morestack` → `newstack` (`stack.go:1026`).
  - The new size is **`oldsize*2`** (`stack.go:1150`).
  - `copystack` (`stack.go:900`) allocates a new contiguous stack, copies it, and **adjusts all pointers into the stack** using stack maps. This is why Go forbids storing Go stack pointers in C and why `unsafe.Pointer`-to-stack tricks break.
- **History:** contiguous copying stacks replaced segmented stacks in **Go 1.3**. Segmented stacks suffered the "hot split" problem. Go 1.4 then cut the initial size to 2 KB.
- **Shrink:** during GC (`shrinkstack`, `stack.go:1257`), a stack is halved if **less than 1/4** of it is used (`stack.go:1297`). Shrinking only happens at a safe point.
- **Max:** 1 GB on 64-bit and 250 MB on 32-bit (`proc.go:160-162`). Exceeding it gives `fatal error: stack overflow` with "goroutine stack exceeds 1000000000-byte limit". It is not recoverable.
- A dead G's stack is kept on `gFree` if it is the standard size. `gfput` frees non-standard stacks.

---

## 11. Park / ready, channels, runnext ping-pong

- **`gopark(unlockf, lock, reason, …)`** (`proc.go:445`) → `mcall(park_m)`, which switches to g0.
  - The G becomes `_Gwaiting` and `dropg` detaches it from the M.
  - `unlockf` runs *after* the G is safely parked. That closes the lost-wakeup race; for example, `chanparkcommit` unlocks `c.lock`.
  - Then `schedule()` runs.
- **`goready(gp)`** (`proc.go:481`) → `ready(gp, next=true)` (`proc.go:1120`):
  - `_Gwaiting → _Grunnable`;
  - **`runqput(currentP, gp, next=true)`**, so the woken G goes into the waker's P's `runnext`;
  - then `wakep()`.
- **Channel send with a waiting receiver:** `chansend` (`chan.go:176`) → `send` (`chan.go:318`) copies the value **directly onto the receiver's stack** (`sendDirect`) and calls `goready(receiver)` (`chan.go:350`). There is no buffer copy and no lock handoff. Receive is symmetric (`recv`, `chan.go:702-745`).
- **Why runnext:** producer/consumer pairs stay on one P, the cache stays hot, and the woken G **inherits the time slice**. That lets a ping-pong pair run at near function-call speed.
- **Fairness guard:** sysmon's schedtick check preempts a chain that exceeds 10 ms. Thieves must wait 3 µs before stealing runnext.
- **sync.Mutex in starvation mode:** entered after a waiter waits more than 1 ms (`starvationThresholdNs = 1e6`, `internal/sync/mutex.go:55`). Unlock then does a **direct handoff**: `semrelease1(handoff=true)` puts the waiter in runnext and `goyield`s so it runs immediately with the inherited slice (`sema.go:260-285`).

---

## 12. Goroutine leaks

- **What a leak is:** a G stuck in `_Gwaiting` forever. Typical causes:
  - a send on an unbuffered chan with no receiver (early-return path);
  - a receive on a chan nobody closes;
  - `select` without `ctx.Done()`;
  - forgotten `time.Ticker` (pre-1.23 the ticker itself leaked);
  - `wg.Wait` with a missing `Done`.
- **Cost:** its stack (≥2 KiB, often more), everything reachable from it, and possibly fds.
- **Detection:**
  - `runtime.NumGoroutine()` trends;
  - `pprof` goroutine profile (`/debug/pprof/goroutine?debug=2` groups by stack plus wait reason and minutes);
  - `go.uber.org/goleak` in tests;
  - `testing/synctest` (1.25 GA) for deterministic tests;
  - **Go 1.26: the `goroutineleak` pprof profile** (`GOEXPERIMENT=goroutineleakprofile`). The GC finds Gs blocked on primitives that are **unreachable** from any runnable G and marks them `_Gleaked`. It is described as production-ready, with zero overhead unless it is used.
- **Deadlock detector:** `checkdead` prints "all goroutines are asleep - deadlock!". It only fires when **no M is running** at all, so a single leaked G among live ones is never detected. A running timer or netpoll also suppresses it.

---

## 13. Interview questions (crisp answers)

1. **Why does P exist; why not just G and M?**
   Per-thread run queues fail when threads block in syscalls: the work would be stranded with the blocked thread. P holds the run queue, mcache, and timers, and can move off a blocked M to a fresh one. That gives lock-free local scheduling, memory that scales with GOMAXPROCS, and bounded parallelism with unbounded threads (Vyukov 2012).
2. **How many OS threads can a Go program have?**
   Unbounded by GOMAXPROCS. The limit is `debug.SetMaxThreads`, default **10 000**. Going past it is fatal ("thread exhaustion"), not an error. Threads that normally exist: Ms running Gs (≤GOMAXPROCS), sysmon, Ms blocked in syscalls or cgo, locked Ms, idle Ms, and the template thread.
3. **A goroutine makes a blocking syscall. What happens?**
   `entersyscall`: the G becomes `_Gsyscall` and keeps its M; the P stays attached. If the syscall runs ≥1 sysmon tick (~20 µs) *and* there is other work, sysmon `retake`s the P and `handoffp`s it to another M, which may be a new thread. On return, `exitsyscall` tries the old P, then any idle P. Otherwise the G goes to the global queue and the M parks.
4. **And a network read?**
   It does not block a thread. The fd is non-blocking and registered with epoll (edge-triggered). On EAGAIN the G `gopark`s in "IO wait". The netpoller (from `findRunnable` or sysmon) readies it later.
5. **What is GOMAXPROCS by default in a Kubernetes pod with `limits.cpu: 2` on a 64-core node?**
   Go ≥1.25 with `go ≥1.25` in go.mod gives **2**, and it tracks limit changes. Go ≤1.24 gives 64. Requests are ignored. A limit of 0.5 still gives **2**, because of the floor.
6. **`for {}` in a goroutine with GOMAXPROCS=1; does main ever run again?**
   Since 1.14, yes: sysmon sees the same schedtick for 10 ms and sends SIGURG, which forces an async preemption. Before 1.14, or with `asyncpreemptoff=1`, no: the program hangs, and even GC STW hangs with more Ps. **[verified]**
7. **Initial goroutine stack size? How does it grow?**
   2 KiB minimum (`stackMin`), adaptive average since 1.19. Growth is by copying into a 2× contiguous stack with pointer adjustment. Shrinking happens at GC when less than 1/4 is used. The max is 1 GB (64-bit).
8. **What does `runtime.Gosched()` do exactly?**
   The G becomes `_Grunnable` and goes on the **global** run queue (not the local one), then `schedule()`. So on one P, every other local G runs before it (see puzzle P3).
9. **What is `runnext`?**
   A one-slot per-P fast lane holding the most recently readied or spawned G. It runs next and inherits the current time slice. It exists for producer/consumer locality. It also causes the famous "last goroutine prints first" ordering.
10. **How often is the global run queue checked?**
    Whenever the local queue is empty. In addition, **every 61st schedtick** one G is taken from global first, for fairness.
11. **Work stealing details?**
    Up to 4 passes over all Ps in random coprime-stride order, skipping idle Ps. Each steal takes half of the victim's runq, rounded up. Timers and `runnext` are only stolen on the final pass, and runnext only after a 3 µs back-off.
12. **What is a spinning M?**
    An M with a P but no work, which is busy-looking for work (stealing) before it parks. There are at most GOMAXPROCS/2 busy-ratio spinners. `wakep` only starts a new one if none are spinning. The last spinner to find work wakes a replacement. This avoids both thread thrash and lost wakeups.
13. **What does sysmon do?**
    It is a P-less M looping with a 20 µs→10 ms back-off. Each iteration it:
    - retakes Ps from syscalls;
    - preempts Gs running longer than 10 ms;
    - polls the network if nothing has polled for more than 10 ms;
    - forces GC every 2 min;
    - wakes the scavenger;
    - re-evaluates GOMAXPROCS (1.25+);
    - prints schedtrace.
14. **Why SIGURG for preemption?**
    It needs a signal that is unlikely to be used by the app or libc and is passed through by debuggers. Spurious delivery is harmless since the handler checks `wantAsyncPreempt`. The side effect is more `EINTR` for raw syscalls.
15. **Can every instruction be preempted asynchronously?**
    No. Not in the runtime, not with `m.locks>0`, not in nosplit or assembly without safe-point info, and not while `m.mallocing`. `isAsyncSafePoint` checks this. If the point is unsafe, the preempt request stays pending until the next sync check.
16. **What does `LockOSThread` do, and what happens if the goroutine exits while locked?**
    It wires the G to its M; the M runs nothing else, and switching costs P handoffs. On exit while locked, the thread is destroyed (1.10+).
17. **Unbuffered channel send when a receiver is already waiting: how many copies, who runs next?**
    One copy, directly to the receiver's stack. The receiver goes into the sender's P `runnext`. The **sender keeps running** until it blocks or yields.
18. **Is the Go scheduler preemptive?**
    Yes, since 1.14: cooperative at function prologues plus signal-based async. The time slice is ~10 ms, enforced by sysmon. It is not priority-based and has no fairness guarantee per G.
19. **Why can `time.Sleep(1ms)` sleep longer?**
    The timer fires from the scheduler (timers checked in `findRunnable` or during netpoll wait). If all Ps are busy with long-running Gs, it can wait up to the sysmon preemption slice. The OS timer resolution adds more.
20. **How does the runtime detect "all goroutines are asleep - deadlock!"?**
    `checkdead` counts running Ms, excluding sysmon and locked-idle Ms. It fires only if none are running and no timers are pending. A single leaked G does not trigger it. Nor does a deadlock in an HTTP server, because the netpoll/listener keeps it "alive".
21. **What is `GODEBUG=schedtrace=1000`?**
    Every 1 s, sysmon prints `gomaxprocs`, `idleprocs`, `threads`, `spinningthreads`, `runqueue` (global), and the per-P local runq sizes. `scheddetail=1` adds the per-G/M/P state.
22. **What changed about syscalls in Go 1.26?**
    `_Psyscall` was removed. A P in a syscall is `_Prunning` with a `_Gsyscall` G. sysmon blocks the G's exit via the `_Gscan` bit (`setBlockOnExitSyscall`) and takes the P. The release notes also report cgo call overhead down ~30%.
23. **Does `go f()` start f immediately?**
    No. It creates a G (`_Grunnable`) in the **current P's runnext** and calls `wakep` to maybe start another M. The creator keeps running until it blocks, yields, or is preempted. On another P, a spinning M may steal it.
24. **When does a local runq overflow and what happens?**
    At 256 queued Gs (plus runnext). The next put moves 128 of them plus the new G to the global queue in a batch.
25. **Why does `-race` change goroutine ordering?**
    The race runtime sets `randomizeScheduler`: it skips runnext half the time and shuffles overflow batches. That is deliberate, to shake out order-dependence.

### Output-prediction puzzles (all **[verified]** on go1.26.4)

**P1: runnext, last spawned prints first**
```go
runtime.GOMAXPROCS(1)
var wg sync.WaitGroup
for i := 0; i < 10; i++ { wg.Add(1); go func(){ defer wg.Done(); fmt.Print(i, " ") }() }
wg.Wait()
```
Output: `9 0 1 2 3 4 5 6 7 8`. Each `go` puts the new G in runnext and kicks the previous one to the ring tail. When main blocks, runnext (9) goes first, then the FIFO 0..8. Output is non-deterministic under `-race` or with GOMAXPROCS>1.

**P2: overflow + %61 fairness (300 goroutines, same code with 300)**

Order: `299, 128..186, 0, 187..246, 1, 247..255, 257..298, 2..127, 256`.
- At i=257 the ring is full with 0..255, so `runqputslow` moves 0..127 plus 256 to the global queue.
- Main blocks; 299 (runnext) runs.
- The local FIFO 128..298 runs, except that roughly every 61 schedticks one G is taken from global (0, then 1).
- When local is empty, the global batch 2..127, 256 drains.

This is a great visualization.

**P3: Gosched goes to global**
```go
runtime.GOMAXPROCS(1)
wg.Add(3)
go func(){ defer wg.Done(); fmt.Println("A") }()
go func(){ defer wg.Done(); fmt.Println("B") }()
go func(){ defer wg.Done(); runtime.Gosched(); fmt.Println("C") }()
wg.Wait()
```
Output: `A B C`. C is runnext and runs first, but Gosched sends it to the **global** queue. Then A and B run from local, then C from global. Naive answer: "C A B" or "C first".

**P4: Gosched ping-pong on 1 P**
```go
runtime.GOMAXPROCS(1)
go func(){ for i:=0;i<3;i++ { fmt.Println("g",i); runtime.Gosched() }; done<-true }()
for i:=0;i<3;i++ { fmt.Println("main",i); runtime.Gosched() }
<-done
```
Output: `main 0, g 0, main 1, g 1, main 2, g 2`.

**P5: unbuffered chan ping-pong ordering**
```go
runtime.GOMAXPROCS(1)
ch := make(chan int)
go func(){ for i:=0;i<3;i++ { ch<-i; fmt.Println("sent",i) }; close(ch) }()
for v := range ch { fmt.Println("recv", v) }
```
Output: `sent 0, recv 0, recv 1, sent 1, sent 2, recv 2`.

Walk-through:
1. main parks on recv.
2. The sender finds main waiting, copies 0 directly, and readies main into runnext, but **keeps running** and prints `sent 0`.
3. `ch<-1`: nobody is parked on recv, so the sender parks.
4. main prints `recv 0`. The next recv finds the parked sender with value 1, readies it, and main keeps running: `recv 1`. The next recv parks main.
5. The sender prints `sent 1`. `ch<-2` finds main parked, hands off, and the sender keeps running: `sent 2`, close.
6. main prints `recv 2`.

The lesson: "unbuffered = synchronous" does **not** mean the print lines alternate.

**P6: tight loop.** See §7: it finishes on ≥1.14 and hangs with `asyncpreemptoff=1`.

**P7: thread exhaustion**
```go
debug.SetMaxThreads(20)
// 50 goroutines each in syscall.Nanosleep(2s)
```
Output: `runtime: program exceeds 20-thread limit` / `fatal error: thread exhaustion`. Swap in `time.Sleep`, which parks with no thread, and it prints `ok`.

---

## 14. Visualization and exercise ideas (2D, interactive)

1. **GMP board (core sandbox).**
   - Columns of P cards. Each has a 256-slot ring drawn as a segmented circle or bar, a highlighted `runnext` slot, and an attached M (thread icon). Above them sits a global queue lane; below, a netpoller "waiting room" and a syscall "bench".
   - Buttons: `go f()`, `ch <- v`, `Gosched`, `syscall(ms)`, `net read`, `time.Sleep`, `LockOSThread`. A step/play clock shows `schedtick` per P.
   - Animate G tokens moving between areas, each colored by state.
2. **Predict-the-output drills.** Show a snippet (P1–P5) and let the user drag print lines into order. Then replay it on the board step by step, highlighting runnext kicks, the global queue, and parking. Include a "-race toggle" that randomizes, to teach why this is not a contract.
3. **Overflow + %61 lab.**
   - A slider sets how many goroutines to spawn (10–400). Watch the ring fill and the half-batch spill to global.
   - A tick counter flashes on multiples of 61 and plucks one G from global. The final order strip matches P2.
4. **Work-stealing race.**
   - 4–8 Ps with uneven loads. An idle P "spins" (a pulsing ring) and tries a random coprime-stride order (draw the stride arrows). It grabs half, and a 3 µs clock-face appears before it touches runnext.
   - A metric panel shows nmspinning ≤ busy/2. The user can toggle the "last spinner wakes another" rule and see CPU underuse appear.
5. **Syscall handoff timeline.**
   - A Gantt chart of Ms (rows) against time. A G enters a syscall; a sysmon lane ticks at 20 µs, 40 µs, …; the P detaches and re-attaches to a new M row.
   - Sliders: syscall duration, whether the runq has work. This shows the ≥20 µs vs 10 ms rule. Add a thread-count gauge plus a SetMaxThreads limit that crashes on overflow.
6. **sysmon heartbeat.** A backoff graph with sleep doubling from 20 µs to 10 ms. Event pins show retake, preempt, netpoll, and forcegc.
7. **Preemption lab.**
   - A code editor holds `for {}` and a stack-prologue view. With the "pre-1.14" toggle the poisoned stackguard is never checked and the program hangs. With "1.14+", a SIGURG lightning bolt makes the context get rewritten to `asyncPreempt`.
   - Show the unsafe-point case: preemption deferred to the next safe point.
8. **Stack growth visualizer.** A contiguous block doubles 2→4→8 KiB. Pointer arrows into the stack get re-aimed after the copy. GC shrink happens when usage is below 1/4. There is a "recursion depth" slider and a 1 GB overflow ending.
9. **Channel handoff close-up.** Two G cards, `sudog` queues on an `hchan` box, a direct stack-to-stack copy arrow, and `goready` → the runnext slot. A mutex starvation variant shows a 1 ms timer, then a direct handoff.
10. **Container GOMAXPROCS calculator.** Inputs: node cores, affinity, cgroup quota/period, requests, go.mod version, and env GOMAXPROCS. The output shows the resulting P count with a formula trace (`min(cpus, max(2, ceil(quota/period)))`). A throttling-timeline demo contrasts P=64 with a 2-CPU quota against P=2.
11. **Leak hunter.** A goroutine-count sparkline plus a pprof-style grouped stack list. The user finds the missing `ctx.Done()` case. A 1.26 goroutineleak view greys out unreachable blocked Gs.
12. **schedtrace decoder.** Paste or animate `SCHED` lines and map each field onto the board.
13. **"Explain the state" quiz.** Show a G token somewhere on the board; the user names its `_G*` state and the function that put it there (gopark/ready/execute/entersyscall).

Implementation tip: drive every visualization from a tiny deterministic JS simulator of the rules above: runnext, a 256-slot ring, %61, the steal-half/4-pass loop, and sysmon ticks. Then the puzzles and the board share one engine, and P1/P2/P3/P5 outputs can be unit-tested against the verified results.

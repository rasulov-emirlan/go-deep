# os-syscalls — Syscalls & kernel mode

Environment for every "measured" claim: Firecracker microVM, kernel 6.18.44, 4 vCPU Xeon @2.1GHz (TSC clocksource), **no KPTI** (`meltdown: Not affected`), no `perf`. Go 1.26 is NOT installed here (only 1.24.7 and 1.25.1 under /usr/local); experiments ran on **go1.25.1**, and every runtime claim about 1.26 was read from the `go1.26.0` tag source (raw.githubusercontent.com/golang/go/go1.26.0/src/...). Code in /tmp/research/os-syscalls/.

## 1. Mechanism (whiteboard order)

**Naive version: no split.** Every program runs with full CPU privilege. Any bug or malware can write to the disk controller, rewrite page tables, read another program's memory, or halt the CPU. One buggy program takes down everything.

**Why the split exists (4 hardware pieces):**
1. *Privilege levels.* x86: CPL 0 (kernel) vs CPL 3 (user) (rings 1-2 unused by Linux). ARM64: EL1 (kernel) vs EL0 (user). Privileged instructions (`hlt`, `lgdt`, `mov cr3`, `wrmsr`, `in/out`, `sysret`) fault (#GP) at CPL 3.
2. *Memory protection.* Page-table entries carry a User/Supervisor bit. User code cannot touch pages marked supervisor, so the kernel can live inside every process's address space without being readable. On x86-64 the user half is `0x0000000000000000-0x00007fffffffffff` (~128 TB, different per process) and the upper half `ffff800000000000+` is kernel space, "shared between all processes" (kernel doc x86_64/mm.rst).
3. *Controlled entry.* User code cannot `jmp` into the kernel: the only doors are ones the kernel registered (syscall MSR, IDT entries for interrupts/exceptions).
4. *Timer interrupt.* The kernel arms a timer so a spinning process cannot keep the CPU forever (see os-scheduling).

**What a syscall physically is (x86-64):**
- User code: `mov eax, <nr>` ; args in `rdi, rsi, rdx, r10, r8, r9` ; `syscall`. Result in `rax`; on failure `rax` is in `[-4095, -1]` = `-errno` (man syscall(2); Go's asm does `CMPQ AX, $0xfffffffffffff001; JLS ok; NEGQ AX`).
- The 4th arg is `r10`, not `rcx`, **because `syscall` itself clobbers `rcx` (saves user RIP there) and `r11` (saves RFLAGS)**. Go's `Syscall6` asm table documents this ("differs from standard ABI which passes 4th arg in CX").
- Hardware on `syscall`: `RCX<-RIP`, `R11<-RFLAGS`, CPL<-0, CS/SS loaded from `MSR_STAR`, RFLAGS masked by `MSR_SYSCALL_MASK` (interrupts off), `RIP<-MSR_LSTAR`. Linux writes `MSR_LSTAR = entry_SYSCALL_64` at boot (`arch/x86/kernel/cpu/common.c: wrmsrq(MSR_LSTAR, entry_SYSCALL_64)`). No stack switch is done by hardware: the entry code does it.
- Kernel entry code (`arch/x86/entry/entry_64.S`, v6.18): `swapgs` (get per-CPU base) -> stash user RSP -> (KPTI only) `SWITCH_TO_KERNEL_CR3` -> load kernel stack -> push a `struct pt_regs` (ss, sp, flags, cs, ip, orig_ax, then all GPRs, with `rax=-ENOSYS`) -> Spectre-era hygiene macros `IBRS_ENTER; UNTRAIN_RET; CLEAR_BRANCH_HISTORY` -> `call do_syscall_64`.
- `do_syscall_64(regs, nr)`: seccomp/ptrace/audit hooks (`syscall_enter_from_user_mode`), then table dispatch `sys_call_table[nr](regs)`, store result in `regs->ax`, then `syscall_exit_to_user_mode` -> `exit_to_user_mode_loop` which, **before returning**, runs pending work: `if TIF_NEED_RESCHED schedule()`, deliver signals (`arch_do_signal_or_restart`), etc. This is where a preemption requested by the timer tick actually takes effect for a task that was in user mode/syscall.
- Return: if `rcx==rip`, `r11==rflags` and CS/SS canonical -> fast `sysret` (restore regs, swap CR3 back if KPTI, `swapgs`, `sysretq`); otherwise slow `iret` path (`do_syscall_64` comment: "Returns true to return using SYSRET, or false to use IRET").
- ARM64: `svc #0`, number in `x8`, args `x0-x5`, result `x0` (Go: `internal/runtime/syscall/linux/asm_linux_arm64.s`: `MOVD num, R8; ... SVC; CMN $4095, R0`). Exception level EL0->EL1, return with `eret`.

**Argument safety.** The kernel never trusts a user pointer: `access_ok()` (`__access_ok` checks the range is below the user/kernel boundary), then `copy_from_user`/`copy_to_user` which wrap the access in `stac()/clac()` (`__uaccess_begin/end`, SMAP) with an exception-table fixup so a bad address returns `-EFAULT` instead of oopsing. Also required so a user cannot pass a kernel address and make the kernel read its own secrets.

**Cost, honest version.** The mode switch itself is cheap (tens of ns: `syscall`+`sysret`+register save). What makes syscalls "expensive" is (a) mitigations on entry/exit (KPTI CR3 swap, IBRS/retpoline/branch-history clearing), (b) cache/TLB/branch-predictor pollution from running different code, (c) the work the syscall does. A **mode switch** (same task, user->kernel->user) is NOT a **context switch** (different task scheduled). A blocking syscall (`read` on empty pipe) causes a context switch; `getppid` does not.

**Interrupts vs exceptions vs traps.** *Interrupt* = asynchronous, from hardware (timer, NIC): handled via IDT, unrelated to current instruction. *Exception* = synchronous fault from the current instruction (page fault #PF, #GP, divide error); *fault* is re-executable after fix (demand paging), *trap* (e.g. `int3`, syscall on some archs) reports after the instruction. The **timer interrupt** is how the kernel regains control from user code: tick handler marks `TIF_NEED_RESCHED`; the switch happens on interrupt/syscall exit. A **page fault** is an exception that the kernel usually resolves silently (see os-memory).

**vDSO.** Kernel maps a small shared object (`[vdso]`) plus a read-only data page (`[vvar]`) into every process (visible in `/proc/self/maps`: `[vvar]`, `[vvar_vclock]`, `[vdso]`). `clock_gettime`/`gettimeofday` (and `time`, `getcpu`, since 6.11 `getrandom`) become ordinary function calls that read the kernel-maintained time data with a seqlock loop (`vdso_read_begin/retry`) and the TSC (`__arch_get_hw_counter`). No mode switch. Only works if the clocksource is vDSO-capable (`vc->clock_mode != VDSO_CLOCKMODE_NONE`; TSC/kvm-clock yes, e.g. hpet/acpi_pm no -> falls back to a real syscall). vDSO calls do **not** appear in `strace` (vdso(7)).

**libc wrapper vs raw.** glibc `getpid()`, `write()` set up registers, run `syscall`, translate `-errno` into `errno` + `-1`, and handle cancellation. `syscall(2)` is the generic escape hatch. Go on Linux bypasses libc entirely (unless cgo) and issues `SYSCALL` itself.

**Batching / avoiding crossings.** `writev/readv`, `sendmmsg/recvmmsg` (many datagrams, one crossing), `epoll_wait` returning many events, `sendfile/splice`, vDSO, and **io_uring**: two shared-memory rings (SQ/CQ); one `io_uring_enter` submits a batch and reaps many completions; with `SQPOLL` a kernel thread polls the SQ so the app makes ~zero syscalls.

**Sandboxing at the boundary.** seccomp-bpf: a BPF program runs at syscall entry over (nr, arch, args-as-values; cannot dereference pointers -> no TOCTOU) and returns ALLOW/ERRNO/TRAP/KILL/USER_NOTIF (kernel doc seccomp_filter.rst). Docker's default profile is a denylist/allowlist of syscalls. gVisor: the app's syscalls never reach the host kernel's handlers; the "Sentry" (user-space Go kernel) implements them. Interception platforms: **ptrace** (old), **Systrap** (default since mid-2023; seccomp-bpf returns SIGSYS to an in-process handler + shared memory to Sentry), **KVM** (VMX-based; best on bare metal). gVisor's syscall path is far slower than native (extra context hops) - that is the price of not exposing the host kernel surface.

## 2. Edge cases & gotchas

- **`strace` slows syscalls ~200x.** Measured: 200k `getppid` = 112 ns/call bare, **23.1 us/call under `strace -f`**, 11.0 us even with `-e trace=none`. Why: ptrace stops the tracee twice per syscall and context-switches to the tracer. Never `strace` a prod hot path; use `strace -c` briefly, `perf trace`, or eBPF (bpftrace) instead. `perf` not installed here: UNVERIFIED on this box.
- **`strace -c` counts but its "seconds" are ptrace-inflated** - trust `calls` and `errors`, not time. `strace -T` shows time-in-syscall (`<0.000005>`) - includes tracer noise.
- **vDSO calls are invisible to strace.** Measured: 100k `time.Now()` -> 8.5 ms (85 ns each) with `strace -f` attached and **0** `clock_gettime` lines. Why: no kernel entry happens.
- **`time.Now()` = TWO vDSO calls** (`CLOCK_REALTIME` then `CLOCK_MONOTONIC`, `runtime/time_linux_amd64.s`, on the g0 stack) ~67-85 ns here vs a raw `clock_gettime` syscall 186-190 ns. `nanotime()` (used by scheduler/timers) is one call.
- **EINTR & restart.** A signal handler interrupting a blocking syscall makes it return `EINTR` unless the handler was installed with `SA_RESTART` AND the syscall is restartable. **Never restarted even with SA_RESTART** (signal(7)): `epoll_wait`, `poll`, `select`, `nanosleep`/`clock_nanosleep`, `pause`, `sigtimedwait`, socket calls with `SO_RCVTIMEO/SO_SNDTIMEO`, `io_getevents`, SysV `semop/msgrcv`. Restartable: `read/write/wait4/accept/connect/flock/futex`... Go installs all its handlers with `SA_ONSTACK|SA_RESTART|SA_SIGINFO` (verified: `strace -e rt_sigaction` and `runtime/os_linux.go: sa_flags = ...|_SA_RESTART`), and stdlib loops on EINTR (`internal/poll.ignoringEINTRIO`, `syscall/exec_linux.go`). Bug source: **raw `syscall.Syscall(SYS_NANOSLEEP...)` gets EINTR from Go's own SIGURG preemption signal** (measured below).
- **Errno is per-thread in libc but in Go it is just a return value** (`Errno` type); no TLS, no `errno` races. Check `errors.Is(err, syscall.EAGAIN)`; `syscall.Errno.Is` maps to `os.ErrNotExist` etc.
- **`errno` values > 4095 range trick**: only `-4095..-1` are errors; `mmap` can legitimately return "negative" looking addresses in 32-bit; on x86-64 user addresses are < 2^47 so it is safe.
- **KPTI/Spectre mitigations are hardware-dependent.** `/sys/devices/system/cpu/vulnerabilities/*` tells you what is active. On this VM Meltdown = "Not affected" so no KPTI; `spectre_v2 = Enhanced/Automatic IBRS`. On pre-2018 Intel without PCID KPTI flushes the TLB on every crossing. Published estimates vary widely (Gregg, 2018: ~0.5% with PCID at low syscall rates, up to 5-30% for syscall/interrupt-heavy loads) - **do not quote a single number**; treat as "cost scales with syscall rate". (Search-snippet only; article itself not fetchable here: UNVERIFIED.)
- **KPTI does not remove the kernel mapping fully**: user-mode page tables keep a minimal kernel stub (entry/exit code, IDT, `cpu_entry_area`); the full kernel map is only loaded on entry (kernel doc x86/pti.rst). So "kernel is mapped in every process" is true, but with KPTI it is a *tiny* mapping in user mode.
- **Typical cost**: measured `RawSyscall(getppid)` 127-130 ns; `Syscall` (with entersyscall/exitsyscall) 215-223 ns => Go's bookkeeping ~90 ns. Blocking-capable calls cost more (`os.File.Write` 1 byte to /dev/null: 290 ns incl. fd mutex + poll). Numbers scale with CPU/mitigations: quote "~100-300 ns" not a constant.
- **Batching payoff, measured**: 16 separate 1-byte `f.Write` = 4645 ns; one `writev` with 16 iovecs = 423 ns (11x); one 16-byte `Write` = 271 ns. Why: 15 saved crossings (~290 ns each).
- **Sysmon handoff is not "20 us" exactly.** See section 4: rule is "same syscall observed across two sysmon ticks (>=20 us, up to 10 ms when sysmon has backed off)" AND retake only if P has local work OR no idle/spinning P OR syscall > 10 ms.
- **A goroutine in a syscall cannot be preempted.** `preemptone` is useless; only P retake helps. A long blocking syscall on `RawSyscall` with `GOMAXPROCS=1` freezes every goroutine (measured 300 ms, counter delta 0 with `asyncpreemptoff=1`).
- **io_uring vs seccomp**: a syscall filter sees only `io_uring_enter`, not the opcodes in the ring, so io_uring can bypass a per-syscall denylist. Docker/containerd default seccomp profiles block io_uring; kernel has `kernel.io_uring_disabled` sysctl (0/1/2; here 0). (Web snippets; not primary: partially UNVERIFIED.)
- **Syscall number spaces**: x86-64 vs i386 (`int 0x80`/compat) vs x32 (`__X32_SYSCALL_BIT`), and arm64 use different tables; seccomp filters must check `arch`.

## 3. Common misconceptions

- "A syscall is a context switch." No: same task, privilege change only (~100 ns). A *blocking* syscall may cause one.
- "User/kernel split means kernel memory is not in my address space." It is mapped in every process (upper half) but protected by the U/S bit; KPTI shrinks what is mapped while in user mode.
- "Syscalls use software interrupts (int 0x80)." Legacy 32-bit. x86-64 uses `syscall/sysret`, arm64 `svc`.
- "vDSO is a syscall that's faster." It isn't a syscall at all; it's user-space code reading shared kernel-updated memory. Falls back to a real syscall when the clocksource isn't vDSO-safe.
- "`time.Now()` enters the kernel." Not on Linux with TSC-like clocksources (2 vDSO calls).
- "Go's syscall.Syscall and RawSyscall differ only in speed." RawSyscall skips `entersyscall/exitsyscall`: scheduler thinks the G is running Go code, P not handed off, G can be signal-preempted (EINTR). Use RawSyscall only for calls that never block.
- "Blocking syscall -> Go spawns a thread immediately." Only after sysmon retakes the P (>=20 us tick; can be up to ~10 ms), or immediately for `entersyscallblock` paths.
- "`strace` shows everything." Not vDSO, not io_uring ops, not syscalls of processes it isn't attached to; and it perturbs timing massively.
- "Seccomp is a sandbox." It only filters syscall entry; combine with namespaces/caps/LSM. gVisor goes further by reimplementing the kernel.
- "SIGKILL can interrupt any syscall." Only interruptible sleeps; a task in uninterruptible `D` state (NFS, some block I/O) ignores it until the I/O completes.

## 4. Go tie-ins (verified in go1.26.0 source unless noted)

- `syscall.Syscall` = `runtime_entersyscall(); RawSyscall6(...); runtime_exitsyscall()` (`syscall/syscall_linux.go`). `RawSyscall6` = `internal/runtime/syscall/linux.Syscall6` (asm `SYSCALL`). Most of `os`/`net` file I/O goes through `Syscall`. cgo calls also use entersyscall (cgocall); **1.26: cgo call overhead ~30% lower** (release notes).
- **`entersyscall` (1.26)**: `reentersyscall` saves pc/sp/bp, sets `stackguard0=stackPreempt` + `throwsplit` (no stack growth allowed: stack can't move while raw pointers are in flight), CAS `_Grunning -> _Gsyscall`, remembers `m.oldp`. If a STW is pending it gives up the P immediately. **Change vs 1.25:** in 1.25.1 it did `atomic.Store(&pp.status, _Psyscall)`; in 1.26 `_Psyscall` is dead (`_Psyscall_unused`, runtime2.go: "A P is identified as 'in a system call' by looking at the goroutine's state"). The P stays `_Prunning`; sysmon uses `setBlockOnExitSyscall`. Existing bank answer says "P moves to _Psyscall" -> true <=1.25, not 1.26.
- **`exitsyscall`**: CAS `_Gsyscall -> _Grunning`; fast path: `m.p` still there (nobody retook it) -> continue, `syscalltick++`. Slow path: `exitsyscallTryGetP` tries to steal `oldp` back, else grab an idle P, else `exitsyscallNoP`: G goes to global runq and the M parks.
- **sysmon** (`runtime.sysmon`, no P, own thread): `usleep(delay)` with delay=20 us while it keeps finding work; after 50 idle cycles it doubles up to **10 ms**; goes into deep sleep (`notetsleep`) when all Ps idle. Each loop: netpoll if not polled >10 ms, `retake(now)`, forced GC, and (1.25+) `sysmonUpdateGOMAXPROCS` once/s.
- **`retake`**: for each `_Prunning` P: (a) if the same `schedtick` for >= `forcePreemptNS = 10ms` -> `preemptone` (SIGURG async preempt) and `sysretake=true`; (b) if P's G is in `_Gsyscall`: on first sight record `syscalltick` and leave ("retake the P if it's there for more than 1 sysmon tick (at least 20us)"); (c) **don't retake if** `runqempty(pp) && nmspinning+npidle > 0 && syscallwhen+10ms > now`; else `takeP` + `handoffp` (start an M for it if there is work).
- **Measured handoff** (GOMAXPROCS=1, main enters a 30 ms `nanosleep` via `Syscall`, a goroutine is in its local runq): other goroutine runs after min 26 us / median ~100 us / p90 ~200 us / max 2-5 ms. With the other goroutine only on the *global* queue (spinning with `Gosched`): median **13 ms** (rule (c): empty local runq + idle P present => wait up to 10 ms). During a 300 ms `Syscall`: `Threads:` 5 in `/proc/self/status`, the counting goroutine advanced 514k iterations.
- **RawSyscall pitfall demo** (`/tmp/research/os-syscalls/h`): GOMAXPROCS=1, spinner goroutine + `RawSyscall(SYS_NANOSLEEP, 300ms)`: sysmon's 10 ms rule fires `preemptone` -> SIGURG -> syscall returns `EINTR` after ~10 ms ("interrupted system call"); with `GODEBUG=asyncpreemptoff=1` nothing can interrupt it: **whole program stalled 300 ms, counter delta 0**.
- **Which I/O is a real blocking syscall?** Sockets/pipes are non-blocking + epoll (`runtime/netpoll_epoll.go`): goroutine parks, no M held. Regular files (epoll says always ready) and many `os` calls use blocking syscalls -> P handoff -> thread growth (cap 10000, `debug.SetMaxThreads`).
- **Thread count**: hello-world `strace -f -c` showed 4 `clone`s, `gettid` x9, 61 `nanosleep` (sysmon `usleep`), 114 `rt_sigaction` (runtime installs handlers for all signals), `sigaltstack` x10. Threads are created with `clone(CLONE_VM|FS|FILES|SIGHAND|SYSVSEM|THREAD)` (`os_linux.go cloneFlags`).
- **Signals**: async preempt uses `SIGURG` (`sigPreempt = _SIGURG`), chosen because it is harmless to ignore. Any Go program hitting EINTR from *its own* raw syscalls must retry.
- `getrandom` in Go 1.24+ uses the vDSO (`vgetrandom`, Linux 6.11+; `runtime/vgetrandom_linux.go`) - build-tagged for amd64/arm64/etc.
- Observing: `strace -f -c -p PID`, `strace -f -T -e trace=...`, `GODEBUG=schedtrace=1000`, `go tool trace` (syscall blocks show as "syscall" spans), runtime/metrics `/sched/threads:threads` (new in 1.26).
- Benchmarks are in `/tmp/research/os-syscalls/{main_test.go,b/,h/,ho2/,l/}`; run with `/usr/local/go1.25.1/bin/go test -bench .`.

## 5. Illustration plan

**Scene A - "The one door" (crossing into the kernel)**, ring/sequence diagram
1. Stage: process address space bar split user (low 128 TB) / kernel (high), CPU badge `CPL 3`. Point: kernel is mapped in every process but supervisor-only.
2. User code `mov rax,39; syscall`; registers rax, rdi.. highlighted. Point: number in rax, args in fixed registers.
3. CPU does three things: `RCX<-RIP`, `R11<-RFLAGS`, `RIP<-LSTAR`, CPL 0, IRQs masked. Point: hardware, not software, picks the entry address (kernel wrote LSTAR at boot).
4. **STOP** "Why is the 4th argument r10, not rcx?" (rcx now holds return address).
5. Entry stub: swapgs, kernel stack, (CR3 swap if KPTI), `pt_regs` pushed, mitigation macros. Point: state saved on a *kernel* stack.
6. `sys_call_table[rax]` runs; `copy_from_user` with `access_ok` + fault fixup. **STOP** "What if user passes a kernel pointer?" (`-EFAULT`).
7. Exit loop: `need_resched?` -> `schedule()`; signal pending -> handler frame. Point: this is where timer-driven preemption bites.
8. `sysret` (or `iret` slow path), rax = result or -errno. Point: `[-4095,-1]` is the error range.

**Scene B - "What a syscall costs"**, horizontal log-scale ruler
1. Ruler: 1 ns function call. 2. vDSO `time.Now` ~70 ns (two vDSO calls; strace sees nothing). 3. Raw syscall ~130 ns (this VM, no KPTI). 4. Go `Syscall` ~220 ns (+entersyscall/exitsyscall). 5. Context switch via pipe ping-pong ~1.8 us same CPU. 6. **STOP** "Is a syscall a context switch?". 7. Same call under `strace` 23 us (x200). 8. KPTI adds CR3 swaps: bar slides right only on affected CPUs. 9. Batch: 16 writes 4.6 us vs one writev 0.42 us.

**Scene C - "Go leaves the P behind" (G/M/P swimlanes over time)**
1. G1 running on M1/P1, G2 runnable in P1's local queue. 2. G1 calls `syscall.Read` (file): `entersyscall`, G1 -> `_Gsyscall`, P1 still attached. 3. sysmon tick #1 (20 us): notes syscalltick. 4. sysmon tick #2: retake conditions checked (local work? idle P?). **STOP** "When does sysmon NOT retake?" (empty runq + idle P + <10 ms). 5. `handoffp(P1)` -> M2 runs G2. 6. Syscall returns: `exitsyscall` tries oldp, then idle P, else G1 to global queue and M1 parks. 7. Variant lane: `RawSyscall` -> no state change, sysmon sends SIGURG -> **STOP** "Why did my nanosleep return EINTR?".

**Scene D - "Fewer trips / stricter door"**
1. 16 small writes = 16 crossings. 2. `writev` = 1 crossing. 3. io_uring: SQ/CQ rings in shared memory, `io_uring_enter` once. 4. SQPOLL kernel thread: zero syscalls. 5. seccomp filter box at the door (ALLOW/ERRNO/KILL). 6. **STOP** "Can seccomp see io_uring ops?" 7. gVisor Sentry sits between app and host kernel (Systrap: SIGSYS -> Sentry).

## 6. Existing interview questions (src/bank/cats/*.json)

- `devops-syscalls`: correct; x86-64 mechanism right; "~100 ns+" fair. Misses: `r10`/rcx clobber, vDSO is not a syscall, KPTI dependence, EINTR/restart, strace overhead, arm64 `svc`. Category list fine.
- `goroutines-scheduler-syscalls-handoff`: right idea; says P "moves to `_Psyscall`" (true up to 1.25, removed in 1.26: state derived from G status). "~20 us" is the sysmon tick floor, not a guarantee; misses the no-retake rule (empty local runq + idle P => up to 10 ms), RawSyscall, `entersyscallblock`. Statement "getrandom vDSO on Linux 6.11+ with Go 1.24+" verified (`vgetrandom_linux.go`).
- `devops-context-switch`: "~1-5 us including user->kernel transition" - conflates mode/context switch; measured 1.8 us same CPU, 12.5 us cross-CPU in this VM (IPI wakeup).
- `devops-epoll`, `goroutines-scheduler-netpoller`: fine; add that `epoll_wait` is never auto-restarted after a signal (EINTR).
- `goroutines-scheduler-preemption`: SIGURG async preempt right; note a goroutine in a syscall cannot be preempted (needs P retake).
- `goroutines-scheduler-max-goroutines` (10000 thread cap) correct (`sched.maxmcount`, message `runtime: program exceeds 10000-thread limit`, verified in proc.go).

## 7. Sources

- Linux v6.18 `arch/x86/entry/entry_64.S`, `arch/x86/entry/syscall_64.c`, `kernel/entry/common.c`, `arch/x86/kernel/cpu/common.c` (LSTAR), `arch/x86/include/asm/uaccess*.h`, `lib/vdso/gettimeofday.c` (raw.githubusercontent.com/torvalds/linux/v6.18/...), read 2026-09-29.
- Kernel docs: `Documentation/arch/x86/pti.rst`, `Documentation/arch/x86/x86_64/mm.rst`, `Documentation/userspace-api/seccomp_filter.rst` (v6.18).
- man-pages (github.com/mkerrisk/man-pages master): `syscall(2)` (register table, x86-64 args), `vdso(7)` (strace note, why it exists), `signal(7)` (SA_RESTART lists), `seccomp(2)`.
- Go 1.26.0 source: `runtime/proc.go` (entersyscall, exitsyscall, sysmon, retake, handoffp), `runtime2.go` (`_Psyscall_unused`), `syscall/syscall_linux.go`, `internal/runtime/syscall/linux/asm_linux_{amd64,arm64}.s`, `runtime/time_linux_amd64.s`, `runtime/os_linux.go`, `runtime/signal_unix.go`, `runtime/vgetrandom_linux.go`; Go 1.25.1 source (local) for `_Psyscall`; release notes go1.26.md (golang/website repo `_content/doc/go1.26.md`; go.dev itself blocked).
- gVisor platforms: https://gvisor.dev/docs/architecture_guide/platforms/ and Systrap blog https://gvisor.dev/blog/2023/04/28/systrap-release/ (search snippets only; pages not fetched).
- KPTI cost: Brendan Gregg, https://www.brendangregg.com/blog/2018-02-09/kpti-kaiser-meltdown-performance.html (snippet only, UNVERIFIED numbers).
- io_uring/seccomp: Jens Axboe "Efficient IO with io_uring" (kernel.dk/io_uring.pdf), moby/moby#47532 (default seccomp blocks io_uring) - snippets only.
- Experiments: /tmp/research/os-syscalls (Go 1.25.1, kernel 6.18.44 VM). Not verified: perf trace output (no perf), macOS/arm64 behaviour, exact KPTI overhead on this box (KPTI off).

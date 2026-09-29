# verify: syscalls (src/topics/syscalls)
Re-measured 2026-09-29 on the shared 4-vCPU Firecracker VM (kernel 6.18.44, Go 1.25.1, no KPTI). Other agents were loading the VM, so timings are noisy; code in /tmp/verify/syscalls.

## Claims checked
- x86-64 ABI: rax=nr, args rdi rsi rdx r10 r8 r9, rcx<-RIP, r11<-RFLAGS (man syscall(2), entry_64.S comments v6.18) -> OK
- LSTAR written with entry_SYSCALL_64 at boot (arch/x86/kernel/cpu/common.c v6.18); swapgs/pt_regs/sysret vs iret -> OK
- -4095..-1 = -errno; Go asm negates into syscall.Errno -> OK (research note; not re-read)
- vDSO: time.Now = 2 vDSO calls (CLOCK_REALTIME + CLOCK_MONOTONIC, time_linux_amd64.s); strace shows 0 clock_gettime in 100k time.Now -> OK (measured)
- KPTI stop card: meltdown "Not affected" on this VM -> OK
- Go 1.26 removed _Psyscall: 1.25.1 runtime2.go/retake use _Psyscall; go1.26.0 runtime2.go has only `_Psyscall_unused` ("identified as in a system call by looking at the goroutine's state"), retake uses setBlockOnExitSyscall -> OK
- retake rule (same syscalltick over 2 sysmon ticks; skip if runq empty && nmspinning+npidle>0 && <10 ms) -> OK, identical in 1.25.1 and 1.26.0
- RawSyscall: sysmon sends SIGURG, returns EINTR; with asyncpreemptoff=1 whole program stalls for the syscall -> OK (measured: EINTR after 13-25 ms, stall 331 ms for a 300 ms sleep)
- Go handlers use SA_RESTART (strace rt_sigaction) -> OK
- seccomp verdicts, io_uring bypass, kernel.io_uring_disabled (kernel doc v6.18: exists; sysctl introduced 6.6) -> OK / hedged with "Linux 6.6+"
- Timings (cost flow), old -> now: time.Now 70->65 ns; raw getppid 130->120; Syscall 220->200 (bookkeeping ~80, not ~90); 16x1-byte Write 4.6->4.5 us; writev(16) 0.42->0.31 us (raw Syscall); pipe hand-off same CPU 1.8->2.3 us (Go) / 1.4-1.7 (C); cross-CPU 12.5->15 us (Go) / 14-29 (C, noisy)
- strace overhead: page said ~23 us, ~200x. Re-run: 41-62 us (C and Go, -f or not) => 300-500x. FIXED to "25-60 us across runs, hundreds of times slower"; bar drawn at 40 us
- Handoff latency: page said local-queue G2 ~100 us median; "G2 on the global queue only ~13 ms median". Re-run (GOMAXPROCS=1, local): min 17-50 us, median 150-250 us, max ~0.6 ms. Global-queue 13 ms NOT reproducible (measured 175-190 us; with GOMAXPROCS>=2 an idle P just runs G2). FIXED: removed the 13 ms claim, quote 25-250 us on one VM
- "After 10 ms sysmon sends SIGURG" -> hedged ">=10 ms (measured 13-25 ms)"

## Changes
1. cost flow: all bar labels/numbers replaced with re-measured ones; strace ~25-60 us; ctx switch ~2 us / ~15 us.
2. handoff stop card: dropped unreproducible 13 ms figure; RawSyscall caption gives measured EINTR delay.
3. addressSpace: user-half sub label now "(4-level paging)" (5-level LA57 changes the split); ioring sysctl "Linux 6.6+".
4. Illustrations: crossing ladder tones fixed (red only on the current step's box/arrow: entry stub, table dispatch, copy_from_user, need_resched, sysret; syscall arrow greys after step 1); door ladder step 4 now drops old messages and shows io_uring_enter near the top; lane subtitles shortened (BPF, user, "runs Go") so they no longer touch the header border.
Illustration fixes: 3 flows edited. All steps re-shot at 390 and 1280, no overflow.

## Unverified / notes
- KPTI cost and gVisor/Systrap statements rest on research-note snippets; captions keep them qualitative.
- Bank: `goroutines-scheduler-syscalls-handoff` says P moves to _Psyscall (true <=1.25, not 1.26). `devops-context-switch` "1-5 us" ok as order of magnitude.

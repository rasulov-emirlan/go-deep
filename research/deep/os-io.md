# os-io — I/O: page cache, epoll & io_uring

Env note: the container's `/usr/local/go/bin/go` is **go1.24.7** (not 1.26 as the brief says); kernel 6.18.44, 4 vCPU, KVM guest, virtio disk with `write_cache=write back`. Experiments live in `/tmp/research/os-io/` (`a.go`, `b.go`, `st.txt`, `st2.txt`). Quotes from man-pages come from the mkerrisk/man-pages mirror on raw.githubusercontent.com (man7.org itself is blocked by the egress proxy).

## 1. Mechanism (whiteboard order)

**Blocking I/O, naive server.** `read()` on a socket sleeps the thread until data arrives. One thread per connection = 10k stacks + context switches. Fine at 100 conns, dies at 10k (C10K).

**Non-blocking + readiness polling.** Set `O_NONBLOCK`; `read()` returns `EAGAIN` instead of sleeping. Now you need "tell me when fd X is ready":
- `select(2)`: pass three bitsets (`fd_set`), hard cap `FD_SETSIZE`=1024; the kernel scans all n fds each call, and you must rebuild the sets each call. O(n) per call, O(n) copying.
- `poll(2)`: array of `pollfd`, no 1024 cap, but still copied in and scanned every call: O(n).
- `epoll(7)`: interest list lives **in the kernel** (`epoll_ctl` ADD/MOD/DEL once). Each registered fd gets a callback on its wait queue; when it becomes ready the callback puts it on a ready list. `epoll_wait` returns only the ready ones: cost O(ready), not O(registered). (The "why": registration cost is paid once, not per wait.)

**Level vs edge triggered.**
- Level (default): `epoll_wait` keeps reporting the fd while the condition holds (buffer non-empty). Forgiving: read a bit, come back.
- Edge (`EPOLLET`): reported once per *transition* (new data arrived). You must drain until `EAGAIN` or you never hear about the rest. man epoll(7): edge-triggered "should use nonblocking file descriptors to avoid having a blocking read or write starve a task that is handling multiple file descriptors". Also starvation risk: one busy fd you keep draining starves the others, so keep a ready list and round-robin.
- `EPOLLONESHOT`: after one event the fd is disabled until you re-arm with `EPOLL_CTL_MOD`. Use when multiple threads call `epoll_wait` and you must guarantee one thread handles an fd at a time.

**Thundering herd.** N threads/processes blocked on one listening socket/epoll fd; one connection arrives; *all* wake, one wins `accept`, rest go back to sleep (wasted wakeups + cache traffic).
- `EPOLLET` on a shared epoll fd: man epoll(7) says "just one of the threads (or processes) is awoken".
- `EPOLLEXCLUSIVE` (Linux 4.5, `EPOLL_CTL_ADD` only): when the same fd is in *several* epoll instances, wake one or more of the instances that set it instead of all; `EINVAL` if used with `MOD` or on an epoll fd; only combinable with `EPOLLIN/OUT/WAKEUP/ET`. man says it "is thus useful for avoiding thundering herd problems in certain scenarios" ("one *or more*" — not a strict exclusivity guarantee).
- `SO_REUSEPORT`: kernel load-balances new connections across N listening sockets (one per worker) — the common modern fix (nginx `reuseport`, Go via `net.ListenConfig.Control`).

**Readiness (epoll) != completion (io_uring).** epoll says "you *could* read now without blocking"; you still do the `read()` syscall yourself (1 syscall for wait + 1 per op). It says nothing useful for regular files/disk (see §2). io_uring (Linux 5.1, Axboe) is *completion* based: you queue *operations* ("read 4 KB from fd 7 at offset X into this buffer") and the kernel does the work and posts a result. Two shared mmap'd ring buffers between user and kernel:
- **SQ** (submission queue): user writes SQEs (op, fd, buffer, user_data), bumps the tail.
- **CQ** (completion queue): kernel posts CQEs (`user_data`, `res`), user reads from head.
- `io_uring_enter` submits N SQEs and/or waits for M CQEs in **one** syscall (batching); with `SQPOLL` a kernel thread polls the SQ so steady-state needs *zero* syscalls. Also: registered files/buffers (skip per-op fd lookup/pinning), linked SQEs, multishot accept/recv, provided buffer rings.
- Works for regular files too (async buffered/direct I/O), which epoll never could.

**Page cache & write-back.** All buffered file I/O goes through the page cache (unused RAM caching file pages).
- `read()`: hit → memcpy from cache; miss → schedule disk read, sleep. **Read-ahead** detects sequential access and prefetches ahead (default `read_ahead_kb` = 128 here, `/sys/block/*/queue/read_ahead_kb`).
- `write()`: copy into a page-cache page, mark it **dirty**, return. **`write()` returning success means "kernel has it in RAM", not "disk has it".** Flusher threads write back later: here `dirty_expire_centisecs`=3000 (30 s), `dirty_writeback_centisecs`=500 (5 s), `dirty_background_ratio`=10, `dirty_ratio`=20 (percent of available memory; above `dirty_ratio` writers are throttled and do write-back themselves = latency cliff).
- Crash/power loss loses dirty pages. Process crash does *not* (kernel still has them).

**Durability ladder.**
- `fsync(fd)`: flush the file's dirty data **and metadata**, "including writing through or flushing a disk cache if present. The call blocks until the device reports that the transfer has completed" (man fsync(2)). Does *not* guarantee the **directory entry** for a new file is durable: fsync the parent directory too.
- `fdatasync(fd)`: skips metadata not needed to read the data back (mtime no; size change yes) → often one fewer journal commit.
- `O_DSYNC` / `O_SYNC`: every `write()` behaves as if followed by fdatasync/fsync. `O_DIRECT` alone gives *no* durability promise ("does not give the guarantees of the O_SYNC flag").
- Measured here (200 x 4 KiB appends): no sync 14.6 ms, write+fsync 91 ms, write+fdatasync 95 ms (≈ 6x; ~0.45 ms per fsync on a virtual disk; on a real NVMe with PLP it can be 20–100 µs, on consumer SSD without PLP or on HDD ms-scale). Report ratio only; absolute is VM-specific.

**Zero-copy.** Naive file→socket: disk→page cache→(read) user buf→(write) socket buf→NIC: 2 extra copies + 2 syscalls. `sendfile(out_fd, in_fd)` moves page-cache pages straight into the socket with no user-space round trip. `splice` moves data between an fd and a **pipe** in-kernel by reference (pipe buffers hold page refs); socket→socket needs a pipe in the middle. `copy_file_range` does file→file in-kernel (reflink/server-side copy on some FS).

**O_DIRECT.** Bypass the page cache: DMA straight to/from user buffer. Needs alignment of buffer address, length and file offset (typically logical block size, 512 B/4 KiB; FS-specific). Used by DBs that run their own buffer pool (avoid double caching, control eviction); loses read-ahead and the shared cache; and still needs fsync for metadata.

**mmap vs read.** mmap maps page-cache pages into your address space: no copy, faults on first touch (minor fault if cached, major if disk). Wins for random access to large, hot, read-mostly files; loses when: I/O errors arrive as **SIGBUS** (not an errno), a page fault blocks the *thread* invisibly (in Go: blocks an M, no handoff signal like syscall entry, so the P is stuck until sysmon/preemption—UNVERIFIED detail), TLB shootdowns on munmap, and no control over write-back ordering (`msync`). Truncating a mapped file under you → SIGBUS.

**File descriptors.** Three layers: per-process **fd table** (int → pointer, holds `FD_CLOEXEC` flag) → system-wide **open file description** (offset, status flags like O_APPEND/O_NONBLOCK) → **inode**. `dup`/`fork` copy the fd-table entry, *sharing* the open file description (so shared offset, and `O_NONBLOCK` set via one fd affects every dup). Two separate `open()`s of the same path get separate descriptions and offsets. Limits: per-process `RLIMIT_NOFILE` (`ulimit -n`; 20000 in this container), system `fs.file-max` (1645588 here). Inherited over `fork` and, unless `O_CLOEXEC`/`FD_CLOEXEC`, across `execve` (classic leak of secrets/sockets into child processes; `epoll_ctl` note: closing an fd doesn't remove it from epoll while another dup of the same description is open).

**Pipes & socket buffers.** Pipe = kernel ring of pages, default capacity 64 KiB here (`fcntl F_GETPIPE_SZ`=65536; max in `/proc/sys/fs/pipe-max-size`); write blocks (or `EAGAIN`) when full; writes ≤ `PIPE_BUF` (4096) are atomic. TCP sockets have send/recv buffers (autotuned via `tcp_rmem`/`tcp_wmem`); a full send buffer is what makes `write` block/`EAGAIN` for slow peers → backpressure.

## 2. Edge cases & gotchas

- **Regular files can't be epolled.** `epoll_ctl(ADD)` on a regular file returns `EPERM` ("target file fd does not support epoll", epoll_ctl(2)). Verified here: `syscall.EpollCtl` on `/etc/hostname` → `operation not permitted`; strace of Go shows `epoll_ctl(3, ADD, 10, EPOLLIN|EPOLLOUT|EPOLLRDHUP|EPOLLET) = -1 EPERM`. Why: a disk read isn't "not ready", it's "not yet read" — the kernel would have to *start* the I/O to make it ready; readiness is a property of already-buffered data. (Bank answer `goroutines-scheduler-netpoller` says epoll "reports regular files as always ready" — that is what select/poll do on regular files, and kqueue on BSD; on Linux epoll refuses with EPERM.)
- **Edge-triggered + partial read = hang.** Read one buffer's worth, don't drain to `EAGAIN` → no more events even though data is buffered. Why: edge fires on new arrival only.
- **Level-triggered + not reading = busy loop** (`epoll_wait` returns immediately forever). Same for `EPOLLOUT` armed on an idle writable socket: always ready → 100% CPU.
- **epoll + fork/dup:** events are keyed on (fd number, open file description). Close an fd but keep a dup (or child inherited it) → still registered, still delivering events for a "closed" fd. Why: registration is on the description.
- **`fsync` errors are not retryable — "fsyncgate" (2018).** On Linux < 4.13, and still for many cases after, a failed writeback marks the dirty pages **clean** (drops the data from the dirty set) and records `EIO` once; the next `fsync()` can return success although data never hit disk. Postgres retried after failure, then checkpointed and recycled WAL → silent data loss (reported Mar 2018 by Craig Ringer; LWN "PostgreSQL's fsync() surprise", Apr 2018). Kernel 4.13 (`errseq_t`): error reported to every fd that was open when the error occurred / to each fd that hasn't yet seen it, but the failed pages are still not re-dirtied. Postgres fix (Nov 2018, backpatched to 9.4–11, in 12): `data_sync_retry=off` by default → **PANIC** on fsync failure and recover from WAL. Lesson: on fsync error, crash and replay from the log; don't retry. (Details from WebSearch snippets of LWN/PG wiki; those pages are blocked here — treat numbers/versions as second-hand, see Sources.)
- **fsync "lies" (device level).** The man page promises the *device* reports completion; a drive/RAID controller with volatile write cache that acks before persisting (or ignores FLUSH) defeats it. Linux issues `FLUSH CACHE`/FUA when the queue says `write cache`; devices with power-loss-protected caches ack fast legitimately. VM caveat: guest fsync only reaches host disk if the hypervisor honours flushes (cache=none/directsync vs unsafe). macOS `fsync` does *not* flush the drive cache; `F_FULLFSYNC` does — Go's `os.File.Sync` uses it on Darwin (`internal/poll/fd_fsync_darwin.go:22`).
- **fsync of the file ≠ file exists after crash.** Create + write + fsync(file) but no fsync(dir) can lose the whole file on ext4 in a crash. Why: the dirent lives in the directory's blocks.
- **Atomic rename recipe:** write temp, fsync temp, rename, fsync dir.
- **`O_APPEND` atomicity.** man open(2): with `O_APPEND` "the modification of the file offset and the write operation are performed as a single atomic step" — so concurrent appenders don't overwrite each other's offset. Verified: 8 goroutines x 20000 x 64 B appends to one `O_APPEND` file → 10 240 000 bytes exactly, no loss. Limits: (a) atomic w.r.t. *position*, not "no interleaving beyond one write() call" for all sizes/FS — POSIX only guarantees it per write, and a short write / huge write / signals can split; (b) **NFS**: "may lead to corrupted files on NFS filesystems" (client emulates append, race); (c) `pwrite` on an O_APPEND fd appends anyway on Linux (documented Linux bug) and Go's `WriteAt` refuses (`errWriteAtInAppendMode`); (d) atomic ≠ durable. Line-atomicity across *processes* for log files works in practice for writes below ~PIPE_BUF-ish/page sizes on local FS but is not a documented guarantee for regular files — UNVERIFIED as a hard number.
- **`write()` to a pipe/socket may be short**; always loop (`io.Copy`, `bufio.Writer.Flush` handle it).
- **Page cache counts against your cgroup** (see os-containers): a container that writes lots of files gets `memory.max` pressure from dirty/cached pages; reclaimable clean cache is dropped first, dirty pages must be written back first (throttling). Demonstrated in os-containers experiment (30 MB `dd` → 31.5 MB of `cache`, all `dirty`).
- **`ulimit -n` exhaustion** → `accept: too many open files` (`EMFILE`); listener spin-loops if you don't back off (Go's `http.Server` sleeps with exponential backoff up to 1 s on temporary Accept errors). Leaks: unclosed `resp.Body`, `rows`, `os.File` (finalizer closes eventually, non-deterministically). Debug: `ls -l /proc/<pid>/fd | wc -l`, `lsof -p`.
- **io_uring security.** Huge kernel attack surface: Google's kCTF VRP (Jun 2023 blog) reported ~60% of submitted exploits targeted io_uring; ChromeOS disabled it, Android blocks it with seccomp, Docker's default seccomp profile no longer allows `io_uring_*` syscalls. Sysctl `kernel.io_uring_disabled` (0 enabled — value here; 1 = restricted to `io_uring_group`; 2 = off). Also: registered-buffer pinning counts against `RLIMIT_MEMLOCK`.
- **io_uring is not automatically faster.** For plain sockets at moderate load epoll+read is fine; wins come from batching syscalls, SQPOLL, fixed buffers, and *real* async file I/O (buffered file reads that miss cache otherwise block a thread).
- **`sendfile` limits:** input must be mmap-able (file), no TLS (data must be encrypted in user space → kTLS needed), 2 GiB per call on Linux (`0x7ffff000` bytes cap; Go loops).
- **`O_DIRECT` alignment `EINVAL`** when buffer/len/offset not block-aligned. In Go allocate an aligned buffer manually.
- **Read-ahead surprises:** random-access on a big file + default 128 KiB read-ahead reads 32x more than needed; `posix_fadvise(RANDOM)`/`madvise` to turn it off.

## 3. Common misconceptions

- "epoll is asynchronous I/O." No — it is *readiness notification*; the read still happens in your thread. Real async = completion model (io_uring, Windows IOCP).
- "epoll is O(1)." It is O(ready events) per wait (plus O(log n) rb-tree ops for add/del) — not O(1) in n, but independent of the number of idle fds.
- "epoll is always faster than poll." With few, mostly-active fds `poll` is comparable; epoll's win is many idle connections.
- "Edge-triggered is faster so always use it." It fewer wakeups but demands drain-to-EAGAIN discipline; bugs are hangs.
- "write() succeeded so the data is safe." Only in RAM; needs fsync/fdatasync (and dir fsync, and error handling).
- "fsync after a failed fsync will retry safely." No (fsyncgate).
- "Go file I/O is non-blocking like Go network I/O." Network yes (netpoller); regular files block an OS thread (the runtime hands off the P).
- "O_DIRECT = durable / = faster." Neither; it skips the cache, no flush guarantee, often slower for small/unaligned or re-read data.
- "mmap avoids all copies so is always faster." Faults, TLB and SIGBUS costs; sequential `read` with read-ahead often ties or wins.
- "A file descriptor is per-file." It is per-process handle → shared open file description; `fork`/`dup` share offsets.
- "sendfile works for any Go `io.Copy`." Only file→TCP (and unix) conn on Linux; wrapped readers (`bufio`, `io.LimitReader` excluded—see below) or TLS conns fall back to a buffer loop.

## 4. Go tie-ins (verified against /usr/local/go/src, go1.24.7, and by strace)

- **Netpoller is edge-triggered.** `runtime/netpoll_epoll.go:51`: `ev.Events = EPOLLIN|EPOLLOUT|EPOLLRDHUP|EPOLLET`, registered once per fd (`netpollopen`); epfd created with `EPOLL_CLOEXEC`. Why ET works for Go: the `poll.FD` read loop does `read` → on `EAGAIN` parks the goroutine in `runtime_pollWait`; a later edge wakes exactly that goroutine, which retries. It never needs level re-notification. No `EPOLLEXCLUSIVE`/`ONESHOT` (grep of `runtime/` finds no EPOLLEXCLUSIVE) — one epoll fd per process, no herd since a single `netpoll` caller collects events.
- **Who calls epoll_wait:** `findRunnable` (non-blocking poll when looking for work, blocking poll by the last idle M), and `sysmon` if no one polled in >10 ms (`proc.go:6231`, `lastpoll+10*1000*1000 < now`). Ready goroutines are injected into run queues.
- **Regular files:** `os.OpenFile` tries to register with the poller (`os/file_unix.go`, `kindOpenFile` → `pollable`); for regular files `epoll_ctl` fails with `EPERM` (strace shows it for every `os.Open`), Go silently marks the file as non-pollable and uses blocking syscalls. A blocking syscall → `entersyscall`; if it lasts longer than sysmon's tick (20 µs minimum, up to 10 ms; UNVERIFIED exact threshold) sysmon retakes the P (handoff to another M) — hence many threads under heavy parallel disk I/O (`debug.SetMaxThreads` default 10000). Pipes and sockets (and `os.NewFile` on a non-blocking fd) *are* pollable, and `SetDeadline` works on them; on regular files it returns `ErrNoDeadline`.
- **`io.Copy` zero-copy on Linux (verified by strace):**
  - `*os.File` → `*net.TCPConn`: `sendfile(8, 10, NULL, 2147483647) = 1048576` (`net/sendfile_linux.go` via `TCPConn.ReadFrom`).
  - `*os.File` → `*os.File`: `copy_file_range(8, NULL, 11, NULL, 2147479552, 0)` (`internal/poll/copy_file_range_linux.go`).
  - `TCPConn` → `TCPConn` (proxy): `splice(10, NULL, 13, NULL, 1048576, SPLICE_F_NONBLOCK)` then `splice(12,...)` through a pooled pipe (`internal/poll/splice_linux.go`, 1 MiB max chunk). This makes reverse proxies in Go cheap. Anything wrapped (`io.TeeReader`, `bufio.Reader`, `tls.Conn`) breaks the type assertion and falls back to a 32 KiB buffer copy. `http.ServeContent`/`ServeFile` → sendfile when the ResponseWriter is a plain TCP conn and no compression/TLS.
- **`os.File.Sync`** = `fsync(2)` (`FlushFileBuffers` on Windows, `F_FULLFSYNC` on macOS). There is no exported `Fdatasync`; use `syscall.Fdatasync(int(f.Fd()))` (note `f.Fd()` puts the file in blocking mode) or `golang.org/x/sys/unix`. `Close()` does not sync, and `Close` errors can be the first report of NFS/writeback failures — check them.
- **Errors:** after `f.Sync()` returns error, treat file state as unknown; don't retry-and-proceed (fsyncgate). bbolt/etcd WAL/Pebble all crash on fsync failure.
- **`bufio.Writer`** batches small writes into 4096-byte default buffer → fewer syscalls; it is *user-space* buffering *above* the page cache: `Flush()` only moves data to the kernel, not to disk. Forgetting `Flush` loses the tail on exit. `bufio` does not make anything durable.
- **fd limits:** `syscall/rlimit.go` raises soft `RLIMIT_NOFILE` to the hard limit at startup (Go 1.19+); `os/exec` resets it for children (original saved in `origRlimitNofile`) so Go's raised limit doesn't break `select()`-based children. All Go-opened fds are `O_CLOEXEC` (`file_unix.go:279`); `exec.Cmd` passes only stdin/out/err + `ExtraFiles`.
- **io_uring in Go:** not in stdlib. Verified: no `io_uring` references in `/usr/local/go/src`. golang/go#31908 ("internal/poll: transparently support new linux io_uring interface", opened 2019-05-08) is still **open, milestone Unplanned, NeedsInvestigation** (fetched from GitHub). Reasons quoted in discussions: completion model needs stable/pinned buffers and ownership of in-flight buffers, poorly matched to goroutine-synchronous API and moving stacks (buffers must be heap/pinned). Third-party: `iceber/iouring-go`, `godzie44/go-uring`, `dshulyak/uring`, `hodgesds/iouring-go`, `pawelgaczynski/giouring` — all niche; treat as experimental. Also kernel's `io_uring_disabled` and default Docker seccomp mean it may be unavailable in your prod container.
- **`O_APPEND` in Go:** `os.O_APPEND` flag passes to `open(2)`; `f.Write` = one `write(2)` per call (no buffering), so concurrent `Write` calls from goroutines on one `*os.File` are safe and each is one atomic append on local FS (verified above). `os.File` also has an internal `fdmutex` serializing Read/Write on the same file (reads and writes lock separately on pollable fds; for regular files each Write takes the write lock).
- **`net.ListenConfig{Control: ...SO_REUSEPORT}`** for kernel-level accept balancing; `http.Server` accept loop is single goroutine per listener.

## 5. Illustration plan

### Scene A — "Wait for 10 000 sockets": select/poll → epoll (7 frames)
1. Stage: 10 000 fd dots, 3 of them lit (ready), one thread. Point: the question "which are ready?".
2. `select`: whole bitset copied in, kernel walks all 10 000, returns; dots scanned turn grey one by one. Point: O(n) per call even with 3 ready.
3. `poll`: same with an array; no 1024 cap but same scan.
4. `epoll_ctl` ADD: dots register into a kernel-side tree once; each dot grows a tiny callback wire to a "ready list". Point: cost paid once.
5. A packet arrives on fd 4278: callback fires, fd lands on ready list. Point: readiness is pushed, not pulled.
6. `epoll_wait` returns list of 3 events. Point: O(ready).
7. **STOP:** "level vs edge": 100 bytes arrive, app reads 40. LT reports again; ET is silent → hang. Point: ET requires drain-to-EAGAIN.
8. **STOP:** "thundering herd": 8 workers on one epoll/listener; a connection wakes all 8, one accepts; then `EPOLLEXCLUSIVE`/`SO_REUSEPORT` wakes one.

### Scene B — "Go's netpoller and the file that can't be polled" (8 frames)
1. Goroutine G1 `conn.Read` → `read()` = `EAGAIN`. Point: non-blocking fd.
2. G1 parks on `pollDesc`; M and P go run G2. Point: no thread held.
3. Packet arrives → edge (`EPOLLET`) recorded; `findRunnable`/sysmon calls `epoll_wait`, G1 goes to run queue. Point: who polls (10 ms sysmon backstop).
4. G1 resumes, reads data. Point: single registration for lifetime of conn.
5. G3 `os.File.Read` on a regular file: Go tries `epoll_ctl` → `EPERM` (show red). Point: files aren't pollable.
6. G3 does blocking `read()`; M1 stuck in kernel; P still attached.
7. **STOP:** after sysmon's next tick (≥20 µs, backing off to 10 ms) it retakes P and hands it to M2 (new thread if none idle); 500 goroutines doing disk reads → hundreds of threads. Point: why parallel disk I/O grows the thread count.
8. io_uring sidebar: SQ/CQ rings replace this dance — "Go doesn't use it (issue #31908 unplanned)".

### Scene C — "write() is a promise to the page cache" (9 frames)
1. App buffer → `write()` → page cache page turns dirty (orange); syscall returns. Point: returned before disk.
2. Timeline: 5 s flusher wake, 30 s expire; dirty page ages. Point: window of loss on power cut.
3. **STOP:** kill -9 the process → data survives (kernel owns it); pull the plug → gone.
4. `fsync`: page → block layer → disk volatile cache → FLUSH → platter/NAND. Point: three places data can sit.
5. Disk cache lies (drive acks from cache without persist). Point: fsync trusts the device.
6. New file: fsync(file) done but directory entry dirty → crash → file missing. **STOP.**
7. Writeback fails (EIO): page flips dirty→clean, error stored once.
8. **STOP (fsyncgate):** app retries fsync → returns 0 → data silently gone. Fix: PANIC, replay WAL.
9. `O_DIRECT` bypass path shown as a dashed line skipping the cache, still no flush guarantee.

### Scene D — "Copying a file to a socket" (6 frames)
1. read()+write(): 4 hops, 2 CPU copies + 2 DMA. 2. `sendfile`: page cache → socket buffer, no user hop. 3. Proxy socket→socket: `splice` via pipe by page reference. 4. Go `io.Copy(tcpConn, file)` → strace shows `sendfile`. 5. **STOP:** wrap the reader in `bufio.Reader`/`TeeReader` → back to 32 KiB read/write loop. 6. TLS conn → user-space encrypt forces the copy (unless kTLS).

## 6. Existing interview questions (`src/bank/cats/*.json`)

- `devops-file-descriptor` — good. Misses: fd → open file description sharing (dup/fork share offset) is only hinted; doesn't mention `EMFILE` backoff. "Go raises soft limit since 1.19" is correct (syscall/rlimit.go).
- `devops-epoll` — correct on O(n) vs O(ready), LT/ET. Misses: `EPOLLEXCLUSIVE`/herd, ET+nonblocking drain rule is only implied, "epoll = readiness not completion" contrast is one line, no regular-file EPERM. "No 1024-fd limit like select" correct.
- `goroutines-scheduler-netpoller` — mostly right (10 ms sysmon poll verified, thread handoff). **Wrong/imprecise:** "epoll reports regular files as always ready" — on Linux `epoll_ctl` returns `EPERM` for regular files (verified); "always ready" is poll/select/BSD behaviour. Also doesn't say Go registers ET.
- `goroutines-scheduler-syscalls-handoff` — related (blocking syscall P handoff), not re-read in full; check it matches the ~20 µs sysmon retake and `entersyscallblock`.
- `databases-wal` — related to fsync/durability; check it mentions fsync-before-ack and fsyncgate (not verified).
- `concurrency-patterns-graceful-shutdown` — see os-containers (SIGTERM).
- `devops-syscalls` — related to syscall cost; not reviewed in detail.
- No existing question on page cache/write-back/fsync/O_DIRECT/sendfile/io_uring → **gaps**.

## 7. Sources

- epoll(7), epoll_ctl(2), fsync(2), open(2) (O_APPEND/O_DIRECT/O_SYNC/EINVAL alignment), pipe(7), sendfile(2), splice(2), mmap(2), readahead(2), fork(2): https://raw.githubusercontent.com/mkerrisk/man-pages/master/man7/epoll.7 (and sibling paths `man2/*.2`), fetched 2026-09-29, man-pages mirror (contents match man7.org; man7.org blocked). Used for ET/ONESHOT/EXCLUSIVE semantics, EPERM, fsync wording, O_APPEND atomic + NFS caveat, O_DIRECT vs O_SYNC.
- io_uring: https://raw.githubusercontent.com/axboe/liburing/master/man/io_uring_setup.2 and `io_uring_enter.2` (fetched, skimmed for SQ/CQ, SQPOLL, single-syscall submit+wait).
- Linux `vm.rst` sysctls: https://raw.githubusercontent.com/torvalds/linux/master/Documentation/admin-guide/sysctl/vm.rst (dirty_* semantics; I read the *values* from /proc/sys/vm in the container).
- Go source (go1.24.7 local): `runtime/netpoll_epoll.go`, `runtime/proc.go` (sysmon poll 10 ms), `internal/poll/{splice_linux,copy_file_range_linux,fd_fsync_darwin}.go`, `net/sendfile_linux.go`, `os/file_unix.go`, `syscall/rlimit.go`. Experiments: strace outputs in `/tmp/research/os-io/st.txt`, `st2.txt`.
- golang/go#31908 io_uring proposal state: https://github.com/golang/go/issues/31908 (WebFetch 2026-09-29: open, Unplanned, NeedsInvestigation). Reasoning about buffer-ownership mismatch is from WebSearch summaries (secondary; UNVERIFIED wording).
- fsyncgate: LWN "PostgreSQL's fsync() surprise" https://lwn.net/Articles/752063/ ; PG wiki https://wiki.postgresql.org/wiki/Fsync_Errors ; Dan Luu https://danluu.com/fsyncgate/ — **could not fetch** (egress blocked); facts (pages marked clean, error reported once, Linux 4.13 errseq_t change, PANIC default from Nov 2018 backpatched to 9.4+, `data_sync_retry`) come from WebSearch result summaries and the fsync(2) man page's 4.13 sentence. Treat exact dates/versions as UNVERIFIED-second-hand.
- io_uring attack surface: Google Security Blog, "Learnings from kCTF VRP's 42 Linux kernel exploits submissions" (2023-06) https://security.googleblog.com/2023/06/learnings-from-kctf-vrps-42-linux.html — via WebSearch summary only (page not fetched). Docker default-seccomp change: also via summary, UNVERIFIED version. `io_uring_disabled` sysctl semantics from memory, value 0 checked in container; UNVERIFIED for the 1/2 meanings.
- Not verified: hard "atomic across processes up to N bytes" for O_APPEND; SIGBUS/blocking-M behaviour of mmap page faults in Go; real-disk fsync latencies (only this VM measured).

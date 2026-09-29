# verify: os-io (page src/topics/os-io)
Env: Go 1.24.7 (default), 1.25.1 and 1.26.0 via GOTOOLCHAIN, strace, kernel 6.18. Scratch: /tmp/verify/os-io/.

## Claims checked
- io.Copy(conn, file) uses sendfile (Go 1.24, 1.25, 1.26) -> OK (strace). Real return was `= 3922432` for a 4 MiB file, and there are several sendfile calls (one EAGAIN retry), not "one call"; the old `= 1048576` figure on the diagram was not from a run -> FIXED (caption + strace lines now `sendfile(6, 8, NULL, 2147483647) = 3922432`).
- io.LimitReader keeps sendfile -> OK (`sendfile(6, 8, NULL, 3145728) = 3145728`; net/sendfile*.go unwraps *io.LimitedReader).
- bufio.Reader keeps sendfile -> OK on 1.24/1.25/1.26 (bufio.Reader.WriteTo hands over to File.WriteTo -> File.writeTo -> poll.SendFile).
- TeeReader, custom wrapper reader, io.SectionReader -> 32 KiB read/write loop on 1.24, 1.25, 1.26 -> OK (strace: `write(..., 32768)` x ~100).
- bufio.Writer on the conn -> 32 KiB loop on Go 1.24, but SENDFILE on Go 1.25.1 and 1.26.0 (strace). Cause (source): 1.24 net/sendfile_linux.go asserts `r.(*os.File)`; 1.25+ net/sendfile.go asserts `r.(syscall.Conn)`, so os.fileWithoutWriteTo (what File.WriteTo passes on after bufio.Writer.ReadFrom -> TCPConn.ReadFrom) now qualifies. The research note and the page were wrong for 1.25+ -> FIXED: page no longer lists bufio.Writer as a breaker, stop card states the version difference. (Confirms builder hint on 1.24.)
- File.writeTo only accepts a TCP/unix stream conn (os/zero_copy_linux.go isUnixOrTCP) -> OK. tls.Conn is not a raw conn -> falls back, OK.
- TCP->TCP io.Copy uses splice via pipe, 1 MiB chunks (`splice(8,NULL,11,NULL,1048576,SPLICE_F_NONBLOCK)`) -> OK.
- epoll_ctl on a regular file -> EPERM; Go registers with EPOLLIN|EPOLLOUT|EPOLLRDHUP|EPOLLET, gets EPERM, and falls back to blocking read; pipes and sockets register fine (strace of os.Open/os.Pipe) -> OK. man epoll_ctl(2) text "regular file or a directory" -> OK.
- Netpoller edge-triggered (runtime/netpoll_epoll.go:51 EPOLLET) -> OK. sysmon polls if nobody polled for >10 ms (proc.go:6231) -> OK.
- sysmon P retake: source (proc.go retake) retakes after >= 1 sysmon tick only if the P has runnable work or no idle/spinning Ms; otherwise waits up to 10 ms. Caption said unconditional -> HEDGED/FIXED.
- fsync timing: page said 200x4KiB appends 91 ms vs 15 ms "about 6x". Re-run (O_APPEND file, 3 runs): fsync 44-58 ms vs no-sync 0.4-0.7 ms (~100x). Old numbers not reproducible (ratio depends heavily on setup) -> FIXED to "about 50 ms vs under 1 ms, only the ratio matters".
- dirty_expire_centisecs=3000, dirty_writeback_centisecs=500 -> OK (/proc/sys/vm). io_uring_disabled=0 here.
- fsync(2) man text: does not necessarily ensure the directory entry reached disk; EIO "may relate to data written to some other file descriptor on the same file", Linux 4.13 errseq reporting -> OK. Page said fsync(file) "does not cover" the dir entry -> HEDGED to "does not necessarily cover".
- O_DIRECT EINVAL on misalignment -> hedged to "typically" (filesystem dependent).
- http.Server accept backoff 5 ms doubling to 1 s (net/http/server.go:3430-3437) -> OK.
- golang/go#31908 open, milestone Unplanned, NeedsInvestigation (WebFetch today) -> OK.
- EPOLLEXCLUSIVE "one or more", Linux 4.5, SO_REUSEPORT -> OK per man epoll(7) (research note quotes); not re-fetched.
- "500 goroutines ... hundreds of threads" was an unmeasured claim -> HEDGED (slow file reads; default max 10,000 threads).
- fsyncgate details (Postgres PANIC etc.) only in research note, page states only "state unknown, treat as fatal" -> OK.

## Not verifiable here
- Diagram-level DMA/flush sequence is conceptual. Real-disk fsync latencies. Kill/power-cut behaviour (standard).

## Changes (src/topics/os-io/flows.tsx)
sysmon retake caption; thread-pile-up stop; fsync timing caption; directory-fsync hedge; O_DIRECT "typically"; sendfile caption (1.24 to 1.26, LimitReader, bufio.Reader); strace text lines; fallback caption (no bufio.Writer); bufio stop card rewritten with version difference.

## Bank correction proposals
- goroutines-scheduler-netpoller says epoll "reports regular files as always ready": on Linux epoll_ctl returns EPERM (select/poll report always-ready). Also Go registers with EPOLLET.

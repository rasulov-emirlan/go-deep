# verify-tcp — independent re-check of src/topics/tcp

Experiments: /tmp/verify/tcp/{nagle,rst,ka,bq} (Go 1.24.7, kernel 6.18). Kernel docs: torvalds/linux ip-sysctl.rst + include/net/tcp.h via raw GitHub.

| Claim | Check | Result |
|---|---|---|
| Full accept queue: SYN dropped, client gets i/o timeout, not refused | bq: listen(fd,1), never accept: 2 dials OK (backlog+1), 3rd-5th `i/o timeout` | OK |
| SYN retry 1s/3s/7s; tcp_syn_retries=6 ~131 s | kernel doc (67 s last retransmit, 131 s final) | OK |
| ACK dropped when queue full, server keeps SYN-ACK retry, spikes 1 s/3 s | mechanism from research note; not reproduced | hedged ("can stall") |
| tcp_abort_on_overflow=1 sends RST, "can harm clients" | kernel doc text | OK |
| TIME_WAIT 60 s on Linux | include/net/tcp.h `TCP_TIMEWAIT_LEN (60*HZ)` | OK (was UNVERIFIED in note) |
| Ports 32768-60999, 28k/60 s ~ 470/s | /proc ip_local_port_range; 28232/60=470.5 | OK |
| http.Transport MaxIdleConnsPerHost default 2 | net/http source (DefaultMaxIdleConnsPerHost) | OK |
| tw_reuse default 2 = loopback only, outgoing only | kernel doc; container sysctl = 2 | OK |
| tw_recycle removed in 4.12 | note (Bernat / linux-man); not re-fetched | OK (secondary source) |
| Go sets SO_REUSEADDR on listeners, NODELAY + keepalive 15/15/9 on dialed and accepted | ka: getsockopt on dial/accept/listener | OK |
| Go keepalive 15 s + 9x15 s = 150 s; raw Linux off / 7200 s | ka + kernel doc | OK |
| DefaultTransport "dials with 30 s" | transport.go: Timeout 30 s AND KeepAlive 30 s | fixed (ambiguous wording) |
| tcp_retries2=15 ~ 15 min | kernel doc: 924.6 s | OK |
| TCP_USER_TIMEOUT not in stdlib, use Dialer.Control | note (grep of net); Go 1.26/1.27 notes have none | OK |
| Nagle+delayed ACK: 40 ms | tcp.h TCP_DELACK_MIN = HZ/25 (40 ms). nagle: 20 requests, NODELAY off: 44-48 ms each except the FIRST (25 us, quick-ACK phase); NODELAY on: <50 us; bufio single Write with Nagle on: <50 us | fixed: caption said "+40 ms on every request", old number "worst 48 ms / 113 us" replaced by the 20-request run |
| RST on close with unread data: "the 413 never arrives" | rst: on Linux loopback the 413 WAS readable (Read returned 8 bytes nil; ReadAll returned the bytes, then ECONNRESET). net/http server.go comment: RST "seems to occur mostly on BSD", many stacks drop unread client read buffer when a write fails | fixed: "often lost", explicit that Linux loopback still delivered already-arrived bytes |
| net/http server "does a lingering read" | server.go closeWriteAndWait: CloseWrite then `time.Sleep(rstAvoidanceDelay=500ms)`; no read loop there | fixed wording |
| Write after peer close: 1st nil, 2nd EPIPE | rst: `write1 <nil> write2 broken pipe` | OK |
| SIGPIPE kills only on fd 1/2 | os/signal docs (note) | OK |
| Zero window / persist probes, SetWriteDeadline absolute | note experiments (SetDeadline verified there) | OK |
| Snippet bufio.NewWriter/Write/Flush | vetted with Go | OK |

## Changes
1. Step 3->4 caption of "FIN, half-close, RST" and its stop card (RST/413 over-claim).
2. Nagle stop card measured numbers; step-3 caption "about +40 ms once past the initial quick-ACK phase".
3. Silent-peer stop: DefaultTransport wording (30 s dial timeout and 30 s keepalive).
4. Accept-queue stop: "can stall in 1 s / 3 s steps".

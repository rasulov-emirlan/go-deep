# verify-dns-lb — independent re-check of src/topics/dns-lb

Sources: Go 1.24.7 source (transport.go, request.go), grpc-go master (keepalive.go, dns_resolver.go), awsdocs GitHub mirrors
(elb-application-load-balancers-user-guide troubleshooting, elb-network-load-balancers-user-guide), snippet compiled against grpc v1.84.0.
docs.aws.amazon.com / web.archive.org are blocked by the proxy.

| Claim | Check | Result |
|---|---|---|
| ALB: target closes idle conn before LB idle timeout -> 502; target keep-alive must exceed LB idle | AWS ALB troubleshooting: 502 cause "target closed the connection with RST or FIN while LB had an outstanding request. Check whether keep-alive of target is shorter than idle timeout of LB" | OK |
| ALB idle 60 s default | not re-fetched (note: AWS summary) | unverified, standard |
| NLB TCP idle 350 s, no FIN, RST on next packet, keepalives reset it | NLB user guide: "sends data after idle timeout -> receives TCP RST"; 350 s; "Clients or targets can use TCP keepalive packets to reset". (Mirror says 350 s not modifiable; newer AWS news says configurable, page says "by default") | OK |
| ALB idle timeout is NOT reset by TCP keepalives (need 1 byte of data) | ALB troubleshooting text | added to NLB stop card |
| Go retry rule | transport.go shouldRetryRequest + isReplayable: retry only if conn reused AND (nothing written [any method, body nil/GetBody] OR replayable [GET/HEAD/OPTIONS/TRACE or Idempotency-Key/X-Idempotency-Key, body nil/NoBody/GetBody] AND first-byte non-EOF read error or server-closed-idle) | fixed: card omitted "nothing written" path; POST caption now "not replayed once its bytes were written" |
| PUT/DELETE not in Go's list | isReplayable | OK |
| grpc MaxConnectionAge +/-10 % jitter, default infinity | keepalive.go | OK |
| grpc-go DNS re-resolve on ResolveNow, min 30 s | dns_resolver.go MinResolutionInterval = 30s | OK |
| snippet keepalive.ServerParameters{MaxConnectionAge} | compiled | OK |
| ndots:5, 3 search suffixes, 8 queries (3x2+2), trailing dot -> 2 | k8s docs (note); arithmetic | OK |
| glibc A+AAAA same socket -> conntrack race -> 5 s; Go separate source ports | note (fake DNS server experiment); Weave/k8s#56903 | OK; kernel-fix versions unverified, not claimed on the page |
| "Go HTTP/2 client pins to one connection per host" | over-general (opens more conns when stream limit hit in some configs) | hedged: "tends to keep one connection" |
| terminationGracePeriodSeconds 30 s default, covers preStop + shutdown; Shutdown skips hijacked conns | k8s docs (note), net/http Shutdown docs | OK |
| Sleep 5-15 s | illustrative | left; labelled by page as example range |

## Changes
1. Retry card + POST caption (see above). 2. HTTP/2 pinning hedge. 3. NLB card: ALB needs real data. 4. Renamed stop "Not the 5 s stall" -> "A different stall: 5 s" (was confusing).
Diagram note: l4 step "Fix 1" draws the new connection landing on pod D; real LB may pick any pod (caption says "can pick").

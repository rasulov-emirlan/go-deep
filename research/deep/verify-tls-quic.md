# verify-tls-quic — independent re-check of src/topics/tls-quic

Experiments: /tmp/verify/tls-quic/t (Go 1.24.7, local CA), snip (snippets vetted). RFC hosts are blocked (rfc-editor, datatracker, uni-bremen);
RFC 9000 text was NOT read directly. quic-go v0.63.0 and x/net/quic sources used as secondary evidence.

| Claim | Check | Result |
|---|---|---|
| New TLS 1.3 over TCP = 2 RTT before request | ladder arithmetic (SYN, CH) | OK |
| Resumption skips cert flight, still 1 TLS RTT | mechanism | OK |
| 0-RTT "zero extra round trips" | TCP handshake still needed | fixed: "No TLS round trip before it" |
| Replay to Server B works | requires B to accept the ticket (shared keys); step 7 then shows B with another key | fixed: caption says B shares A's ticket keys |
| 425 Too Early + Early-Data: 1 (RFC 8470), client retries | RFC not readable here; note summary | hedged (unchanged, secondary source) |
| Go server never accepts 0-RTT | handshake_server_tls13.go: "because 0-RTT is not supported" | OK |
| Client resumes only with ClientSessionCache | t: no cache resumed=false x2; cache: false then true | OK |
| Resumed handshake skips GetCertificate; stale cert after rotation | t: 3 calls for 4 dials; after swap to leaf2 both resumed dials still show leaf1, no GetCertificate call | OK |
| Tickets valid up to 7 d | common.go ticketKeyLifetime/maxSessionTicketLifetime = 7d, rotation 24 h | OK |
| Missing intermediate -> unknown authority; full chain OK | t: exact error `x509: certificate signed by unknown authority`, OK with intermediate | OK |
| "Go, curl and Java do not fetch it (AIA)" | Go: no AIA fetching (verify.go has no IssuingCertificateURL use). Java/Windows/macOS/curl-schannel may fetch | fixed: "Go and OpenSSL-based clients such as curl" |
| MTU 1420 -> MSS 1380; ping -s 1472 fails, -s 1372 works | 1420-40, 1420-28=1392 | OK |
| tlsmlkem=0 reverts hybrid hello | Go 1.24 notes (research) | OK |
| TCPMSS clamp / tcp_mtu_probing=1 / ICMP type 3 code 4 (v6 type 2) | standard; kernel doc (note) | OK |
| QUIC per-stream ordering; only stream B waits | RFC 9000 concept | OK, added caveat: frames of several streams can share a packet |
| "flow-control limits are per connection" | QUIC has per-stream AND connection limits | fixed wording |
| Migration diagram used SAME CID on Wi-Fi and LTE | RFC 9000 s9.5 (from memory/search summary): MUST NOT reuse a CID across paths; quic-go conn_id_manager.go: "Once a connection ID is allocated for a path, it cannot be used for a different path" | fixed: LTE uses CID 8, caption "fresh connection ID" |
| Server sends PATH_CHALLENGE, <=3x bytes to unvalidated address | RFC 9000 s8.1; x/net loss.go implements 3x | OK (secondary) |
| net/http has no HTTP/3 | Go 1.26 and current 1.27 draft notes: no mention | OK |

## Changes
0-RTT caption + diagram text; replay caption; AIA client list; QUIC shared-limits caption; HOL stop card caveat; migration CID + caption.
Not changed but worth knowing: setting `TLSClientConfig` on a hand-built http.Transport disables auto-HTTP/2 unless ForceAttemptHTTP2 is set.

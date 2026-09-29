import type { El, FlowDef } from '../../components/flow'
import { Code } from '../../components/Code'

/*
 * Lane map used by the ladder diagrams of this topic: clients on the left, the lock service and the
 * storage on the right. ink = normal, grey = old, red = what the step is about, dashed = absent / unconfirmed.
 */
const lane = (id: string, text: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...more }) as El
const X = { a: 70, b: 205, lock: 345, store: 485 }

/* ---------- 01 · the TTL lie ---------- */
export const ttlLie: FlowDef = {
  h: 440,
  steps: [
    {
      caption: 'A takes a lock with `SET key id NX PX 30000`: set only if absent, expire in 30 s so a crashed holder cannot block everyone.',
      add: [
        lane('a', 'Client A', X.a, 425),
        lane('b', 'Client B', X.b, 425),
        lane('lock', 'Lock svc', X.lock, 425),
        lane('store', 'Storage', X.store, 425),
        { t: 'msg', id: 'm1', from: 'a', to: 'lock', y: 72, text: 'SET NX PX 30s' },
        { t: 'msg', id: 'm2', from: 'lock', to: 'a', y: 98, text: 'OK' },
      ],
    },
    {
      caption: 'A starts working. The lock service counts the TTL down. It can only watch a clock; it cannot see whether A is alive and running.',
      add: [
        { t: 'box', id: 'work', x: 30, y: 118, w: 80, h: 30, text: 'working' },
        { t: 'box', id: 'ttl', x: 290, y: 118, w: 110, h: 30, text: 'TTL 30 s' },
      ],
    },
    {
      caption: 'A freezes: a stop-the-world GC, a VM pause, `SIGSTOP`, CPU throttling, a slow syscall. Go’s own GC pauses are short; any stall counts.',
      set: {
        work: { x: 20, w: 100, h: 70, text: 'frozen', sub: 'GC/VM/STOP', tone: 'red', dashed: true },
        ttl: { text: 'TTL 4 s' },
      },
    },
    {
      caption: 'The TTL runs out. The lock service deletes the key. A is frozen and knows nothing about it.',
      set: { ttl: { x: 280, w: 130, text: 'TTL 0 · gone', tone: 'red', dashed: true } },
    },
    {
      caption: 'B asks for the lock and gets it. From the service’s point of view that is correct: the key was free.',
      add: [
        { t: 'msg', id: 'm3', from: 'b', to: 'lock', y: 215, text: 'SET NX PX 30s' },
        { t: 'msg', id: 'm4', from: 'lock', to: 'b', y: 241, text: 'OK' },
      ],
    },
    {
      caption: 'B writes v2 to the storage.',
      add: [
        { t: 'msg', id: 'm5', from: 'b', to: 'store', y: 275, text: 'write v2' },
        { t: 'box', id: 'val', x: 420, y: 298, w: 130, h: 34, text: 'value: v2' },
      ],
    },
    {
      caption: 'A thaws and still believes it holds the lock. It writes v1.',
      set: { work: { tone: 'grey', dashed: false, text: 'awake', sub: '' } },
      add: [{ t: 'msg', id: 'm6', from: 'a', to: 'store', y: 368, text: 'write v1', tone: 'red' }],
      stop: {
        title: 'Check expiry first?',
        edge: true,
        body: (
          <>
            <p>Checking the clock proves nothing: the freeze can land between the check and the write.</p>
            <Code>{`
if time.Now().Before(lease) {
    // <- freeze lands here
    store.Write(v1)
}
`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'The storage accepts it. B’s v2 is overwritten: two holders, and lost data.',
      set: { val: { h: 46, text: 'value: v1', sub: 'v2 overwritten', tone: 'red' } },
      stop: {
        title: 'Two more ways in',
        edge: true,
        body: (
          <>
            A clock jump on the lock server can expire keys early. With Redis replication, the master can die before copying the key, a replica is promoted, and B locks again. No pause needed.
          </>
        ),
      },
    },
  ],
}

/* ---------- 02 · fencing tokens ---------- */
export const fencing: FlowDef = {
  h: 470,
  steps: [
    {
      caption: 'Fix: every grant carries a number, always higher than the last. The lock service gives A token 33.',
      add: [
        lane('a', 'Client A', X.a, 455),
        lane('b', 'Client B', X.b, 455),
        lane('lock', 'Lock svc', X.lock, 455),
        lane('store', 'Storage', X.store, 455),
        { t: 'msg', id: 'm1', from: 'lock', to: 'a', y: 75, text: 'token 33' },
      ],
    },
    {
      caption: 'A stalls, and its lease runs out while it is frozen, exactly as before.',
      add: [
        { t: 'box', id: 'frozen', x: 20, y: 105, w: 100, h: 70, text: 'frozen', sub: 'GC/VM/STOP', tone: 'red', dashed: true },
        { t: 'box', id: 'exp', x: 280, y: 105, w: 130, h: 30, text: 'lease expired', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'B takes the lock and gets token 34, higher than 33.',
      add: [{ t: 'msg', id: 'm2', from: 'lock', to: 'b', y: 215, text: 'token 34' }],
    },
    {
      caption: 'B writes with its token. The storage remembers the highest token it has seen: 34.',
      add: [
        { t: 'msg', id: 'm3', from: 'b', to: 'store', y: 255, text: 'v2 · token 34' },
        { t: 'box', id: 'max', x: 420, y: 275, w: 130, h: 30, text: 'max seen: 34' },
      ],
    },
    {
      caption: 'A thaws, still believing it holds the lock, and writes with the token it was given: 33.',
      set: { frozen: { tone: 'grey', dashed: false, text: 'awake', sub: '' } },
      add: [{ t: 'msg', id: 'm4', from: 'a', to: 'store', y: 335, text: 'v1 · token 33', tone: 'red' }],
    },
    {
      caption: '33 is below 34, so the storage rejects the write. Exclusion is enforced at the resource, not by the lock.',
      set: { max: { tone: 'red' } },
      add: [{ t: 'msg', id: 'm5', from: 'store', to: 'a', y: 365, text: 'REJECTED', tone: 'red' }],
      stop: {
        title: 'What must storage do?',
        edge: true,
        body: (
          <>
            <p>Keep the highest token and refuse lower ones, in one atomic conditional write.</p>
            <Code>{`
UPDATE doc SET body=$1, token=$2
WHERE id=$3 AND token <= $2
-- 0 rows updated => stale holder
`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'In etcd the token is the lock key’s revision, a cluster-wide counter ordered by Raft. Send it with every write.',
      add: [{ t: 'box', id: 'etcd', x: 115, y: 400, w: 330, h: 48, text: 'etcd: token = key revision', sub: 'Raft-ordered, cluster-wide' }],
      stop: {
        title: 'Redis has no token',
        edge: true,
        body: <><code>SET NX</code> returns a random string, not an increasing number. A separate <code>INCR</code> is not atomic with the grant, and it can go wrong across a failover.</>,
      },
    },
    {
      caption: 'With this check, the lock only reduces collisions. The storage’s compare-and-set is what guarantees exclusion.',
      drop: ['m1', 'm2', 'm3', 'm4', 'm5', 'frozen', 'exp', 'max', 'etcd'],
      add: [{ t: 'box', id: 'cas', x: 80, y: 150, w: 400, h: 76, text: 'Storage compare-and-set = real lock', sub: 'the lock service only cuts conflicts', tone: 'ink' }],
      stop: {
        title: 'Only if it can check',
        edge: true,
        body: <>etcd’s docs say its lock cannot protect an external resource unless that resource validates versions. An API that ignores tokens needs idempotency keys instead.</>,
      },
    },
  ],
}

/* ---------- 03a · etcd lock queue + lease keepalive ---------- */
const C = { a: 70, b: 205, c: 345, etcd: 485 }
export const etcdLock: FlowDef = {
  h: 565,
  steps: [
    {
      caption: 'Three clients each put their own key under `/lock/`, attached to their lease: a timer they must keep renewing.',
      add: [
        lane('a', 'Client A', C.a, 550),
        lane('b', 'Client B', C.b, 550),
        lane('c', 'Client C', C.c, 550),
        lane('etcd', 'etcd', C.etcd, 550),
        { t: 'msg', id: 'p1', from: 'a', to: 'etcd', y: 72, text: 'put key+lease' },
        { t: 'msg', id: 'p2', from: 'b', to: 'etcd', y: 96, text: 'put key+lease' },
        { t: 'msg', id: 'p3', from: 'c', to: 'etcd', y: 120, text: 'put key+lease' },
      ],
    },
    {
      caption: 'Raft orders the writes: revisions 101, 102, 103. The lowest revision holds the lock, so A does. That number is also the fencing token.',
      add: [
        { t: 'msg', id: 'r1', from: 'etcd', to: 'a', y: 158, text: 'rev 101' },
        { t: 'msg', id: 'r2', from: 'etcd', to: 'b', y: 182, text: 'rev 102' },
        { t: 'msg', id: 'r3', from: 'etcd', to: 'c', y: 206, text: 'rev 103' },
      ],
    },
    {
      caption: 'B and C wait. Each watches only the key just below its own, so a release wakes one waiter, not all of them.',
      add: [
        { t: 'box', id: 'hold', x: 20, y: 222, w: 100, h: 30, text: 'HOLDER' },
        { t: 'msg', id: 'w2', from: 'b', to: 'etcd', y: 278, text: 'watch 101', dashed: true },
        { t: 'msg', id: 'w3', from: 'c', to: 'etcd', y: 302, text: 'watch 102', dashed: true },
      ],
    },
    {
      caption: 'The holder streams keepalives on its lease. Each one resets the TTL on the server.',
      add: [
        { t: 'msg', id: 'k1', from: 'a', to: 'etcd', y: 340, text: 'keepalive' },
        { t: 'msg', id: 'k2', from: 'etcd', to: 'a', y: 364, text: 'TTL reset' },
      ],
    },
    {
      caption: 'A stalls or is cut off. Keepalives stop arriving, and the TTL runs down on the server, not on A.',
      set: { hold: { text: 'frozen', tone: 'red', dashed: true } },
      add: [{ t: 'msg', id: 'k3', from: 'a', to: 'etcd', y: 400, text: 'keepalive', lost: true, tone: 'red' }],
      stop: {
        title: 'etcd’s timer numbers',
        edge: true,
        body: <>A session defaults to a 60 s TTL. etcd raises tiny TTLs to a minimum: 1.5 s with default settings.</>,
      },
    },
    {
      caption: 'The lease expires and etcd deletes key 101. B’s watch fires, B’s key 102 is now lowest, and B holds the lock.',
      add: [
        { t: 'box', id: 'exp', x: 410, y: 420, w: 140, h: 30, text: 'lease expired', tone: 'red', dashed: true },
        { t: 'msg', id: 'gone', from: 'etcd', to: 'b', y: 476, text: 'key 101 gone', tone: 'red' },
        { t: 'box', id: 'hold2', x: 155, y: 492, w: 100, h: 30, text: 'HOLDER' },
      ],
      set: { hold: { tone: 'grey' } },
    },
    {
      caption: 'A thaws and only learns on its next call: the lease is gone, `Session.Done()` closes. Work must be cancelled from that signal.',
      set: { hold: { text: 'awake', dashed: false } },
      add: [
        { t: 'msg', id: 'k4', from: 'a', to: 'etcd', y: 538, text: 'keepalive', tone: 'red' },
        { t: 'msg', id: 'k5', from: 'etcd', to: 'a', y: 560, text: 'lease gone', tone: 'red' },
      ],
      stop: {
        title: 'ZooKeeper: Disconnected ≠ Expired',
        edge: true,
        body: <>Same shape there: ephemeral sequential znodes tied to a session. <code>Disconnected</code> means the link dropped and the session may live; only <code>Expired</code> means the lock is gone. Treat Disconnected as possibly lost.</>,
      },
    },
  ],
}

/* ---------- 03b · leader election via lease ---------- */
export const leader: FlowDef = {
  h: 470,
  steps: [
    {
      caption: 'Leader election is the same lock with a long-lived holder: whoever holds the lease key leads. A takes it.',
      add: [
        lane('a', 'Leader A', X.a, 455),
        lane('b', 'Standby B', X.b, 455),
        lane('lease', 'Lease', X.lock, 455),
        lane('store', 'Storage', X.store, 455),
        { t: 'msg', id: 'm1', from: 'a', to: 'lease', y: 75, text: 'acquire' },
        { t: 'msg', id: 'm2', from: 'lease', to: 'a', y: 99, text: 'OK' },
      ],
    },
    {
      caption: 'A renews on a timer: every 2 s (`RetryPeriod`) in Kubernetes defaults. Each renewal extends the lease to 15 s (`LeaseDuration`).',
      add: [
        { t: 'msg', id: 'm3', from: 'a', to: 'lease', y: 135, text: 'renew 2s' },
        { t: 'msg', id: 'm4', from: 'a', to: 'lease', y: 165, text: 'renew 4s' },
      ],
    },
    {
      caption: 'B tries every 2 s and is told the lease is held. It waits as standby.',
      add: [
        { t: 'msg', id: 'm5', from: 'b', to: 'lease', y: 200, text: 'acquire?' },
        { t: 'msg', id: 'm6', from: 'lease', to: 'b', y: 224, text: 'held', dashed: true },
      ],
    },
    {
      caption: 'A’s renewals stop getting through: a crash, a partition, or a stall.',
      add: [{ t: 'msg', id: 'm7', from: 'a', to: 'lease', y: 262, text: 'renew', lost: true, tone: 'red' }],
    },
    {
      caption: 'Rule: if A cannot renew within `RenewDeadline` (10 s) it must stop leading itself, before the lease expires at 15 s. Self-fencing.',
      add: [{ t: 'box', id: 'self', x: 10, y: 288, w: 140, h: 46, text: 'step down', sub: 'after 10 s, exit', tone: 'ink' }],
    },
    {
      caption: 'At 15 s the lease is free and B takes it. The 5 s gap is the safety margin, but only if A’s own timer actually ran.',
      add: [
        { t: 'msg', id: 'm8', from: 'b', to: 'lease', y: 356, text: 'acquire' },
        { t: 'msg', id: 'm9', from: 'lease', to: 'b', y: 380, text: 'OK' },
      ],
    },
    {
      caption: 'Now the same story with A frozen: its deadline check never ran. It wakes, still believes it leads, and writes. Two believers.',
      set: { self: { text: 'frozen', sub: 'timer never ran', tone: 'red', dashed: true } },
      add: [{ t: 'msg', id: 'm10', from: 'a', to: 'store', y: 425, text: 'leader write', tone: 'red' }],
      stop: {
        title: 'Election is not exclusion',
        edge: true,
        body: <>Kubernetes leader election is best effort and does not fence. Safety needs an epoch or revision check on the writes, such as a <code>resourceVersion</code> compare-and-set.</>,
      },
    },
  ],
}

/* ---------- 04 · efficiency vs correctness ---------- */
export const kinds: FlowDef = {
  h: 545,
  steps: [
    {
      caption: 'Before you pick a lock, ask what a double holder costs.',
      add: [{ t: 'box', id: 'q', x: 140, y: 10, w: 280, h: 50, text: 'Would two holders hurt?' }],
    },
    {
      caption: 'Efficiency lock: it only avoids duplicate work, like a cron job or a cache rebuild. A rare double run is wasteful, not harmful.',
      add: [
        { t: 'line', id: 'l1', x1: 230, y1: 60, x2: 135, y2: 108, arrow: true, text: 'no' },
        { t: 'box', id: 'eff', x: 10, y: 110, w: 250, h: 76, label: 'EFFICIENCY', text: 'dedupe cron, warm cache', sub: 'Redis SET NX PX is enough' },
      ],
    },
    {
      caption: 'Correctness lock: a double holder double-charges or corrupts data. A TTL lock alone is not enough here.',
      add: [
        { t: 'line', id: 'l2', x1: 330, y1: 60, x2: 425, y2: 108, arrow: true, text: 'yes', tone: 'red' },
        { t: 'box', id: 'cor', x: 300, y: 110, w: 250, h: 76, label: 'CORRECTNESS', text: 'charge a card, ledger', sub: 'double holder = bad data', tone: 'red' },
      ],
    },
    {
      caption: 'First choice: if the resource can compare-and-set, do that. The version check is the real guard; a lock just cuts wasted conflicts.',
      add: [
        { t: 'line', id: 'l3', x1: 425, y1: 186, x2: 425, y2: 224, arrow: true, text: 'can check?' },
        { t: 'box', id: 'cas', x: 300, y: 226, w: 250, h: 70, label: 'FIRST CHOICE', text: 'conditional write', sub: 'version or token' },
      ],
    },
    {
      caption: 'Data in Postgres: take `pg_advisory_xact_lock` in the same transaction as the write. If the connection dies, the transaction aborts: the database fences itself.',
      add: [
        { t: 'line', id: 'l4', x1: 425, y1: 296, x2: 425, y2: 340, arrow: true, text: 'one DB' },
        { t: 'box', id: 'pg', x: 300, y: 342, w: 250, h: 70, label: 'SAME TRANSACTION', text: 'advisory xact lock', sub: 'lock + write together' },
      ],
      stop: {
        title: 'Session lock + pooler',
        edge: true,
        body: <><code>pg_advisory_lock</code> belongs to a database connection. Behind a transaction pooler that connection is shared, so the lock can leak. Use the <code>_xact_</code> variants or session pooling.</>,
      },
    },
    {
      caption: 'A third-party API that ignores tokens cannot be fenced. Use an idempotency key. Fencing works only if every resource checks.',
      add: [
        { t: 'line', id: 'l5', x1: 425, y1: 412, x2: 425, y2: 456, arrow: true, text: 'outside DB' },
        { t: 'box', id: 'ext', x: 300, y: 458, w: 250, h: 70, label: 'NO CHECK POSSIBLE', text: 'idempotency key', sub: 'the API dedupes' },
      ],
    },
  ],
}

/* ---------- 05 · the Redlock debate ---------- */
const N = [60, 170, 280, 390, 500]
const nodeEl = (i: number): El => ({ t: 'node', id: 'n' + i, x: N[i], y: 100, text: 'ABCDE'[i] }) as El
const toNode = (id: string, from: number, i: number, tone: 'ink' | 'red', text?: string): El =>
  ({ t: 'line', id, x1: from, y1: 214, x2: N[i], y2: 128, arrow: true, tone, text }) as El
export const redlock: FlowDef = {
  h: 470,
  steps: [
    {
      caption: 'Redlock: five independent Redis masters, no replication between them. Five instances on one host count as one failure domain.',
      add: [{ t: 'text', id: 'hd', x: 280, y: 44, text: '5 independent masters', tone: 'grey', size: 14 }, ...[0, 1, 2, 3, 4].map(nodeEl), { t: 'box', id: 'c1', x: 60, y: 216, w: 120, h: 40, text: 'Client 1' }],
    },
    {
      caption: 'Client 1 sends `SET NX PX` to each node in turn, with a short per-node timeout. A, B and C grant it: 3 of 5, a majority.',
      add: [toNode('a1', 100, 0, 'ink'), toNode('a2', 120, 1, 'ink', 'SET NX PX'), toNode('a3', 140, 2, 'ink')],
      set: { n0: { sub: 'key' }, n1: { sub: 'key' }, n2: { sub: 'key' } },
    },
    {
      caption: 'It times the whole attempt. It holds the lock only with a majority and elapsed < TTL. Validity is TTL minus elapsed minus a drift allowance.',
      add: [
        { t: 'box', id: 'spent', x: 30, y: 300, w: 36, h: 28, tone: 'grey' },
        { t: 'box', id: 'valid', x: 66, y: 300, w: 464, h: 28, text: 'validity = TTL − elapsed − drift' },
        { t: 'text', id: 'spentl', x: 48, y: 350, text: 'asking', tone: 'grey', size: 13 },
      ],
    },
    {
      caption: 'The clock on C jumps forward (an NTP step, an admin). C’s key expires early, while client 1 still believes it holds the lock.',
      set: { n2: { sub: 'gone', tone: 'red', dashed: true } },
    },
    {
      caption: 'Client 2 locks C, D and E: also a majority. This is the critique’s example of two holders.',
      add: [
        { t: 'box', id: 'c2', x: 380, y: 216, w: 120, h: 40, text: 'Client 2', tone: 'red' },
        toNode('b1', 420, 2, 'red'),
        toNode('b2', 440, 3, 'red'),
        toNode('b3', 460, 4, 'red'),
      ],
      set: { n3: { sub: 'key' }, n4: { sub: 'key' } },
    },
    {
      caption: 'The critique’s first point: Redlock’s token is a random string, so a storage cannot tell which holder is newer.',
      add: [{ t: 'box', id: 'crit', x: 10, y: 385, w: 265, h: 66, label: 'CRITIQUE', text: 'no fencing token', sub: 'random string, not rising', tone: 'red' }],
      stop: {
        title: 'The critique’s argument',
        edge: true,
        body: <>The argument is that Redlock assumes bounded network delay, pauses and clock error, and real systems break all three. It also gives no fencing token. The suggested fix: a consensus system plus fencing. Paraphrased, not quoted.</>,
      },
    },
    {
      caption: 'The reply: a unique token can drive a compare-and-set, and no lock survives a pause after its last check.',
      add: [{ t: 'box', id: 'rep', x: 285, y: 385, w: 265, h: 66, label: 'REPLY', text: 'unique token + CAS', sub: 'bounded drift, mono clock' }],
      stop: {
        title: 'The reply’s argument',
        edge: true,
        body: <>The argument is that bounded clock drift is enough, elapsed time is measured after acquiring, and a pause after the check hurts every lock, ZooKeeper too. A unique token plus compare-and-set can fence. Paraphrased, not quoted.</>,
      },
    },
    {
      caption: 'They mostly disagree about the system model. Match the lock to what a double holder costs.',
      drop: ['crit', 'rep'],
      add: [
        { t: 'box', id: 'v1', x: 10, y: 385, w: 265, h: 66, label: 'EFFICIENCY', text: 'Redlock or Redis OK', sub: 'a double run is cheap' },
        { t: 'box', id: 'v2', x: 285, y: 385, w: 265, h: 66, label: 'CORRECTNESS', text: 'etcd/ZK + fencing', sub: 'or CAS at the resource', tone: 'red' },
      ],
      stop: {
        title: 'Where they land',
        edge: true,
        body: <>A lock with no check at the resource cannot survive an unbounded pause; etcd’s docs make the same point. A consensus lock makes the service consistent, not the client’s belief. Redlock’s own doc only promises exclusion while the holder finishes within the validity time.</>,
      },
    },
  ],
}

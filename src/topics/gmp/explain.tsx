import type { ReactNode } from 'react'
import type { EventKind } from '../../sim/sched'

/** Why-cards for every scheduler event the guided tours can stop on. */
export const why: Partial<Record<EventKind, { title: string; body: ReactNode; edge?: boolean }>> = {
  spawn: {
    title: 'go f() does not run f',
    body: (
      <p>
        <code>newproc</code> creates the goroutine and puts it in the current P’s <b>runnext</b> slot, a one-seat “you’re next” chair. The goroutine that said <code>go</code> keeps running. Nothing has
        started yet.
      </p>
    ),
  },
  kick: {
    title: 'runnext holds only one',
    body: (
      <p>
        A second <code>go</code> takes the runnext chair and pushes the previous occupant to the <b>back</b> of the local queue. That’s why, on one P, the <em>last</em> goroutine you spawn usually runs
        first.
      </p>
    ),
  },
  'run-runnext': {
    title: 'runnext jumps the line',
    body: (
      <p>
        When the running goroutine blocks, the P checks runnext <em>before</em> the queue. The runnext goroutine also inherits the rest of the time slice. This keeps a producer and consumer bouncing on
        one hot CPU cache.
      </p>
    ),
  },
  'run-local': {
    title: 'local queue, no lock',
    body: <p>Each P owns a 256-slot ring of runnable goroutines. Only the owner adds to it, so taking the next one needs no global lock. This is the whole reason P exists.</p>,
  },
  overflow: {
    title: 'local queue full → half goes global',
    body: (
      <p>
        The ring holds 256 (drawn smaller here). When it’s full, <code>runqputslow</code> moves <b>half of it plus the newcomer</b> to the global queue in one locked batch. Other Ps can then pick them
        up.
      </p>
    ),
  },
  'run-global': {
    title: 'local empty → take a batch from global',
    body: (
      <p>
        With nothing local, the P locks the global queue and grabs a fair share, <code>min(len/GOMAXPROCS + 1, 128)</code>. It runs one and puts the rest in its own queue, so it doesn’t come back for
        every goroutine.
      </p>
    ),
  },
  fairness: {
    title: 'every 61st turn: global first',
    body: <p>If a P always had local work it would never look at the global queue, and those goroutines would starve. So every 61st schedule the P takes one goroutine from global first.</p>,
    edge: true,
  },
  gosched: {
    title: 'Gosched sends you to the GLOBAL queue',
    body: (
      <p>
        <code>runtime.Gosched()</code> doesn’t go to the back of the local line. It goes to the <b>global</b> queue, so every local goroutine runs before it comes back. Most people expect the local
        queue.
      </p>
    ),
    edge: true,
  },
  preempt: {
    title: 'ran 10 ms → preempted → global queue',
    body: (
      <p>
        sysmon noticed this goroutine held its P for 10 ms. It asked it to stop: at the next function call, or, for a loop with no calls, with a <b>SIGURG</b> signal (Go 1.14+). Preempted goroutines go to
        the <b>global</b> queue, like Gosched.
      </p>
    ),
  },
  'preempt-ignored': {
    title: 'no safe point → can’t stop it (Go ≤ 1.13)',
    body: (
      <p>
        Before 1.14 preemption was only checked in function prologues. <code>for {'{}'}</code> never calls a function, so the request is ignored forever and everything else on this P starves. Before
        1.14 it could even freeze GC’s stop-the-world.
      </p>
    ),
    edge: true,
  },
  wakep: {
    title: 'idle P + work → wake one spinning thread',
    body: (
      <p>
        New work appeared and a P is idle, so the runtime wakes <b>one</b> thread to go looking. It never wakes several at once. When that one finds work it wakes the next, so parallelism ramps up one
        thread at a time.
      </p>
    ),
  },
  steal: {
    title: 'work stealing: take half',
    body: (
      <p>
        This P’s queue and the global queue are empty, so it picks other Ps in random order and steals <b>half</b> of the first non-empty queue it finds (rounded up). No global lock is involved.
      </p>
    ),
  },
  'steal-runnext': {
    title: 'stealing runnext is the last resort',
    body: <p>Thieves only take a victim’s runnext chair on their final pass, after a 3 µs back-off, so a producer/consumer pair isn’t torn across CPUs for nothing.</p>,
    edge: true,
  },
  'park-m': {
    title: 'nothing anywhere → the thread sleeps',
    body: <p>No local, global, network or stealable work. The P goes on the idle list and its thread parks (sleeps on a futex). Spinning forever would burn CPU.</p>,
  },
  'syscall-enter': {
    title: 'a blocking syscall holds the THREAD',
    body: (
      <p>
        Reading a regular file (or any blocking syscall or cgo call) blocks the OS thread inside the kernel, and the goroutine goes with it. For a moment the P is stuck too. Go doesn’t hand it off
        immediately, because most syscalls are fast.
      </p>
    ),
  },
  handoff: {
    title: 'sysmon hands the P to another thread',
    body: (
      <p>
        The syscall has lasted longer than a sysmon tick (~20 µs) and there’s work waiting, so sysmon <b>retakes the P</b> and gives it to another thread. It creates a new thread if none is idle. This
        is why blocking file I/O can grow your thread count far past GOMAXPROCS.
      </p>
    ),
  },
  'retake-idle': {
    title: 'retaken, but nothing to do',
    body: <p>The P was taken from the syscalling thread, but no work is queued, so it just goes idle instead of starting a new thread.</p>,
    edge: true,
  },
  'new-thread': {
    title: 'a new OS thread (M)',
    body: <p>No idle thread was available, so the runtime creates one. Threads are expensive, and the default limit is 10 000. Beyond that: <code>fatal error: thread exhaustion</code>.</p>,
    edge: true,
  },
  'exitsyscall-fast': {
    title: 'syscall returned quickly: keep the P',
    body: <p>The syscall ended before anyone took the P, so the goroutine keeps running. This fast path is why short syscalls are cheap.</p>,
  },
  'exitsyscall-idlep': {
    title: 'P was taken → grab an idle one',
    body: <p>The old P was handed off while we were in the kernel, but another P is idle, so this thread takes it and continues.</p>,
  },
  'exitsyscall-global': {
    title: 'no P free → goroutine to the global queue',
    body: <p>Every P is busy, so the returning goroutine can’t run. It goes to the global queue, and its thread goes to sleep with the idle threads.</p>,
    edge: true,
  },
  'net-park': {
    title: 'network I/O does NOT block a thread',
    body: (
      <p>
        Sockets are non-blocking and registered with epoll/kqueue. When there’s no data yet, the goroutine <b>parks on the netpoller</b> and the thread immediately runs something else. Compare with the
        file read: no thread is held and no handoff is needed. That’s why one Go server can hold 100k idle connections.
      </p>
    ),
  },
  'run-netpoll': {
    title: 'data arrived → back to work',
    body: <p>When a P has nothing else to do, it asks the netpoller which sockets are ready. The woken goroutine runs immediately; any others go to the global queue.</p>,
  },
  'netpoll-sysmon': {
    title: 'sysmon polls the network if nobody did',
    body: <p>If every P is busy and nobody has polled for 10 ms, sysmon polls the network itself and puts ready goroutines on the global queue, so busy CPUs can’t hide network readiness.</p>,
    edge: true,
  },
  'timer-ready': {
    title: 'timer fired → runnable, not running',
    body: (
      <p>
        The sleep is over and the goroutine is runnable again. But runnable only means “in a queue”: it still needs a <b>free P</b>. If every P is held by a goroutine that won’t yield, it waits — which
        is why <code>time.Sleep(1ms)</code> can take much longer under load.
      </p>
    ),
    edge: true,
  },
  'run-timer': {
    title: 'timer expired → back to work',
    body: <p>An idle P checks its timers (and the netpoller) before going to sleep, so the sleeper is picked up right away.</p>,
  },
  'sleep-park': {
    title: 'time.Sleep parks on a timer',
    body: <p>Timers live in a heap on each P. The goroutine parks with no thread held. When the timer fires, the goroutine becomes runnable again. But it still needs a free P to actually run.</p>,
  },
  'wait-park': {
    title: 'blocked on WaitGroup / channel / mutex',
    body: <p>The goroutine parks (<code>gopark</code>) and costs only its stack. It’s on no run queue until another goroutine wakes it.</p>,
  },
  'wg-wake': {
    title: 'woken up',
    body: <p>The last <code>wg.Done()</code> readies the waiter, putting it back on a run queue.</p>,
  },
  goexit: {
    title: 'goroutine finished',
    body: <p>Its G struct (and usually its 2 KiB stack) goes to a free list on the P, to be reused by the next <code>go</code> statement.</p>,
  },
}

export function whyTitle(k: EventKind) {
  return why[k]?.title ?? k
}

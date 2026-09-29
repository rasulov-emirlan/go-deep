import { Link } from 'react-router-dom'
import { Callout, Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { QuizList } from '../../components/Quiz'
import { Interview } from '../../components/Interview'
import { OrderPuzzle } from '../../components/OrderPuzzle'
import { NextTopic, Sources, TopicHero } from '../../components/TopicShell'
import { SchedLab } from './SchedLab'
import { GomaxprocsCalc, PreemptTimeline, StackGrowth } from './Widgets'
import { interview, quiz } from './content'
import { Story } from '../../components/Story'
import { containerProcs, meetGMP, whyP } from './stories'
import { GuidedSched } from './GuidedSched'

const toc = [
  { id: 'model', label: 'G · M · P' },
  { id: 'lab', label: 'Guided tours' },
  { id: 'find', label: 'findRunnable' },
  { id: 'runnext', label: 'runnext puzzles' },
  { id: 'syscalls', label: 'Syscalls & netpoll' },
  { id: 'preempt', label: 'Preemption' },
  { id: 'procs', label: 'GOMAXPROCS' },
  { id: 'stacks', label: 'Stacks' },
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'puzzles', label: 'Puzzles' },
  { id: 'interview', label: 'Interview' },
]

export default function GmpPage() {
  return (
    <>
      <TopicHero
        slug="scheduler"
        title={
          <>
            The GMP <span className="r">scheduler</span>
          </>
        }
        lead="How a Go program multiplexes millions of goroutines onto a handful of threads: who runs next, who steals from whom, what a syscall costs, and why a for {} loop used to freeze the world."
        toc={toc}
      />

      <Section id="model" n="01" kicker="Mental model" title="Three letters, one rule">
        <Story title="Meet G, M and P" frames={meetGMP} />
        <Story title="Why P exists" frames={whyP} />
        <div className="prose">
          <p>
            <b>G</b> is a goroutine: a stack (starts at 2 KiB) plus saved registers. <b>M</b> is an OS thread. <b>P</b> is a <em>processor</em> — a permission slip to run Go code that owns
            the scheduling resources: a local run queue, the <code>runnext</code> slot, an <code>mcache</code> for allocation, a timer heap. There are exactly <code>GOMAXPROCS</code> Ps.
          </p>
          <Callout label="The rule">
            <p>
              An M must hold a P to execute Go code. An M <em>without</em> a P is blocked in a syscall or cgo, idle, or is <code>sysmon</code>. So{' '}
              <b>parallelism is bounded by P; thread count is not</b> (default cap: 10 000, then <code>fatal error: thread exhaustion</code>).
            </p>
          </Callout>
          <Code>{`
// runtime/runtime2.go (heavily trimmed)
type p struct {
    status    uint32          // _Pidle, _Prunning, _Pgcstop, _Pdead
    schedtick uint32          // bumped on every schedule() that doesn't inherit time
    runqhead  uint32
    runqtail  uint32
    runq      [256]guintptr   // lock-free ring: owner produces, owner+thieves consume
    runnext   guintptr        // 1-slot fast lane, runs before runq
    mcache    *mcache
    timers    timers          // per-P 4-ary timer heap (since 1.14)
}
`}</Code>
        </div>
      </Section>

      <Section id="lab" n="02" kicker="Guided tours" title="Watch the scheduler work">
        <div className="prose">
          <p>
            Five short runs of a tested model of <code>runtime/proc.go</code>. Press <b>Autoplay</b>: it runs by itself and <b>stops at every important moment</b> — a goroutine sent to the global queue,
            a syscall losing its P, a network read parking on the netpoller, a steal, a preemption — with an explanation. Press <b>OK, next</b> to continue. The chips at the bottom show which cases you’ve
            seen.
          </p>
        </div>
        <GuidedSched />
      </Section>

      <Section id="find" n="03" kicker="schedule() → findRunnable()" title="Where does the next goroutine come from?">
        <div className="prose">
          <p>When a G blocks, yields or exits, its M calls <code>schedule()</code>, which asks <code>findRunnable()</code> for work — in this exact order:</p>
          <ol>
            <li>
              <b>Fairness check:</b> if <code>schedtick % 61 == 0</code>, take one G from the <em>global</em> queue first. Without it, two goroutines that keep re-spawning each other could starve the
              global queue forever. (61: prime, “not too small, not too big”.)
            </li>
            <li>
              <b>Local:</b> <code>runnext</code>, then the head of the 256-slot ring.
            </li>
            <li>
              <b>Global:</b> grab a batch — <code>min(len, len/GOMAXPROCS+1, 128)</code> — run one, queue the rest locally.
            </li>
            <li>
              <b>Netpoll</b> (non-blocking): goroutines whose sockets became ready.
            </li>
            <li>
              <b>Steal:</b> up to 4 passes over the other Ps in random order, taking <em>half</em> (rounded up) of a victim’s ring. Only on the last pass may it steal a victim’s timers or its{' '}
              <code>runnext</code> — and only after a 3 µs back-off so ping-pong pairs aren’t torn apart.
            </li>
            <li>
              <b>Give up:</b> put the P on the idle list, drop spinning, <em>re-check everything</em> (the famous StoreLoad dance that prevents lost wake-ups), block in netpoll if this M is the
              poller, otherwise <code>stopm()</code>.
            </li>
          </ol>
          <Callout label="Spinning Ms">
            <p>
              <code>wakep()</code> starts at most <em>one</em> spinning M at a time (and never more spinners than half the busy Ps). When a spinner finds work it wakes the next one. The result: parallelism
              ramps up one thread at a time instead of a thundering herd — you can watch it in the Fan-out scenario.
            </p>
          </Callout>
        </div>
      </Section>

      <Section id="runnext" n="04" kicker="runnext" title="Why the last goroutine runs first">
        <div className="prose">
          <p>
            <code>go f()</code> doesn’t run f. It creates a G and puts it in the current P’s <code>runnext</code>; whatever was there is kicked to the <em>tail</em> of the local ring. The creator keeps
            running. The same happens when a goroutine is woken by a channel op: the wakee goes to the waker’s runnext and <em>inherits the remaining time slice</em>, so a producer/consumer pair
            ping-pongs at near function-call speed on one hot cache.
          </p>
        </div>
        <OrderPuzzle
          id="scheduler.p1"
          title="GOMAXPROCS(1), five goroutines. What prints?"
          code={`runtime.GOMAXPROCS(1)
var wg sync.WaitGroup
for i := 0; i < 5; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); fmt.Print(i, " ") }()
}
wg.Wait()`}
          items={['0', '1', '2', '3', '4']}
          answer={['4', '0', '1', '2', '3']}
          explain={
            <p>
              Each <code>go</code> puts the new G in runnext and kicks the previous one to the ring’s tail. When main blocks in <code>wg.Wait</code>, runnext (4) runs first, then the FIFO ring 0…3.
              Under <code>-race</code> the scheduler randomizes runnext on purpose — never rely on this.
            </p>
          }
        />
        <OrderPuzzle
          id="scheduler.p3"
          title="Gosched inside the runnext goroutine. What prints?"
          code={`runtime.GOMAXPROCS(1)
wg.Add(3)
go func() { defer wg.Done(); fmt.Println("A") }()
go func() { defer wg.Done(); fmt.Println("B") }()
go func() { defer wg.Done(); runtime.Gosched(); fmt.Println("C") }()
wg.Wait()`}
          items={['A', 'B', 'C']}
          answer={['A', 'B', 'C']}
          explain={
            <p>
              C is in runnext and runs first — but <code>runtime.Gosched()</code> puts the caller on the <b>global</b> queue, not the local one. A and B run from the local ring, then C comes back from
              global. Most people answer “C A B”.
            </p>
          }
        />
        <OrderPuzzle
          id="scheduler.p5"
          title="Unbuffered channel ping-pong on one P. What prints?"
          code={`runtime.GOMAXPROCS(1)
ch := make(chan int)
go func() {
    for i := 0; i < 3; i++ { ch <- i; fmt.Println("sent", i) }
    close(ch)
}()
for v := range ch { fmt.Println("recv", v) }`}
          items={['sent 0', 'recv 0', 'sent 1', 'recv 1', 'sent 2', 'recv 2']}
          answer={['sent 0', 'recv 0', 'recv 1', 'sent 1', 'sent 2', 'recv 2']}
          explain={
            <p>
              main parks on receive. The sender finds it waiting, copies 0 straight onto main’s stack, readies main into runnext — and <em>keeps running</em>: “sent 0”. Its next send has no receiver, so
              it parks. main prints “recv 0”, its next receive finds the parked sender holding 1, takes it, readies the sender, keeps running: “recv 1”. And so on. “Unbuffered = synchronous” does not
              mean the lines alternate.
            </p>
          }
        />
      </Section>

      <Section id="syscalls" n="05" kicker="Syscalls, cgo, netpoller" title="Blocking without blocking">
        <div className="prose">
          <p>There are two very different ways for a goroutine to wait on I/O:</p>
          <ul>
            <li>
              <b>Network (sockets, pipes):</b> fds are non-blocking and registered with epoll/kqueue. A read that would block → <code>gopark</code> (“IO wait”). <b>No thread is consumed.</b> The
              netpoller readies it later — from <code>findRunnable</code>, or sysmon if nobody has polled for 10 ms.
            </li>
            <li>
              <b>Syscalls and cgo (file I/O on Linux, DNS via cgo, C calls):</b> the M really blocks in the kernel. The G enters <code>_Gsyscall</code> and keeps its M. If the call lasts past a sysmon
              tick (~20 µs) and other work is queued, sysmon <b>retakes the P</b> and <code>handoffp</code> gives it to another M — creating a thread if none is idle. On return,{' '}
              <code>exitsyscall</code> tries its old P, then any idle P, else puts the G on the global queue and parks the M.
            </li>
          </ul>
          <Callout label="Go 1.26 detail" red>
            <p>
              <code>_Psyscall</code> is gone. A P whose G is in a syscall stays <code>_Prunning</code>; sysmon grabs the G’s <code>_Gscan</code> bit to block its exit, then takes the P. Old blog posts
              describing a “P in syscall state” are describing Go ≤1.25.
            </p>
          </Callout>
          <p>
            Consequence: 1 000 goroutines doing blocking file reads can mean ~1 000 threads. 1 000 goroutines doing network reads mean ~GOMAXPROCS threads. Try both in the lab:
          </p>
        </div>
        <p className="prose">
          <a href="#lab">↑ Guided tour 4</a> runs exactly this: a file read and a socket read side by side.
        </p>
      </Section>

      <Section id="preempt" n="06" kicker="Preemption" title="Cooperative, then signals">
        <div className="prose">
          <p>
            <b>Cooperative (always):</b> every non-leaf function prologue compares the stack pointer with <code>g.stackguard0</code>. To preempt, the runtime poisons it with <code>stackPreempt</code>
            ; the next call “needs more stack”, enters <code>morestack</code>, notices the poison and yields (to the <em>global</em> queue).
          </p>
          <p>
            <b>Asynchronous (Go 1.14+):</b> a loop with no calls never checks. So sysmon, seeing the same <code>schedtick</code> for 10 ms, sends the thread <b>SIGURG</b>. If the PC is at an async safe
            point, the handler rewrites the signal context to call <code>asyncPreempt</code>, which spills all registers and enters the scheduler. SIGURG was picked because debuggers pass it through,
            libc doesn’t use it, and spurious delivery is harmless. Side effect: more <code>EINTR</code> for raw syscalls.
          </p>
        </div>
        <p className="prose">
          <a href="#lab">↑ Guided tour 6</a> shows both versions — flip between Go ≤ 1.13 and 1.14+.
        </p>
      </Section>

      <Section id="procs" n="07" kicker="GOMAXPROCS" title="Container-aware since Go 1.25">
        <div className="prose">
          <p>
            Before 1.25, GOMAXPROCS defaulted to the machine’s CPU count — 64 on a 64-core node even if your pod had a 2-CPU limit. The runtime then burned through its CFS quota in bursts and got
            throttled for the rest of each 100 ms period: classic tail-latency spikes, and the reason <code>uber-go/automaxprocs</code> existed. Since 1.25 the default respects the cgroup CPU limit
            (floored at 2), ignores requests, and is re-evaluated periodically — but only if <code>go.mod</code> says <code>go 1.25</code> or later.
          </p>
        </div>
        <Story title="GOMAXPROCS in a container" frames={containerProcs} />
        <GomaxprocsCalc />
      </Section>

      <Section id="stacks" n="08" kicker="Goroutine stacks" title="2 KiB, then double and copy">
        <div className="prose">
          <p>
            Goroutines start with a 2 KiB stack (since Go 1.19 the start size adapts to the average stack size the GC observes). When the prologue check fails, <code>newstack</code> allocates a stack
            twice as big and <code>copystack</code> moves every frame, adjusting pointers into the stack — possible only because the compiler knows where every pointer is. That’s why Go stacks can’t be
            handed to C, and why the answer to “how big is a goroutine?” is “2 KB” — not the “8 KB” of Go 1.2.
          </p>
        </div>
        <StackGrowth />
      </Section>

      <section className="section" id="sandbox">
        <div className="wrap">
          <span className="kicker red">Sandbox</span>
          <h2>Free-play labs</h2>
          <p className="prose" style={{ color: 'var(--g500)' }}>
            The full dashboards, for when the tours above make sense and you want to poke at the scheduler yourself: spawn goroutines on any P, change GOMAXPROCS, turn off async preemption.
          </p>
          <details className="sandbox">
            <summary>Scheduler dashboard</summary>
            <div className="sandbox-body">
              <SchedLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Preemption timeline</summary>
            <div className="sandbox-body">
              <PreemptTimeline />
            </div>
          </details>
        </div>
      </section>

      <Section id="puzzles" n="09" kicker="Test yourself" title="Scheduler puzzles">
        <QuizList items={quiz} />
      </Section>

      <Section id="interview" n="10" kicker="Interview prep" title="Questions you will be asked">
        <Interview items={interview} prefix="scheduler" />
        <p className="bank-link">
          <Link to="/interview?cat=goroutines-scheduler">Drill the real interview questions on this topic →</Link>
        </p>
        <Sources>
          <p>
            Go 1.26.4 source: <code>runtime/proc.go</code> (schedule, findRunnable, stealWork, sysmon, retake), <code>runtime2.go</code>, <code>preempt.go</code>, <code>signal_unix.go</code>,{' '}
            <code>stack.go</code>, <code>cgroup_linux.go</code>. Vyukov, <a href="https://golang.org/s/go11sched">Scalable Go Scheduler Design</a> (2012). Release notes{' '}
            <a href="https://go.dev/doc/go1.14">1.14</a>, <a href="https://go.dev/doc/go1.25">1.25</a>, <a href="https://go.dev/doc/go1.26">1.26</a>. All ordering puzzles verified on go1.26.4 linux/amd64.
          </p>
        </Sources>
      </Section>
      <NextTopic slug="scheduler" />
    </>
  )
}

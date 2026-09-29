import type { El, FlowDef } from '../../components/flow'
import { Code } from '../../components/Code'

/*
 * Visual language of this topic: ink = normal, grey = old / inactive, red = what this step is about,
 * dashed = absent, in flight or already gone, ✕ = dropped.
 * The ladder diagrams (PID 1) use the same lanes throughout: the sender on the left, the process on the right.
 */
const lane = (id: string, text: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...more }) as El

/* ---------- 01a · a container is a process with a costume ---------- */
export const costume: FlowDef = {
  h: 330,
  steps: [
    {
      caption: '`docker run` makes runc ask the kernel for a new process. So far it is an ordinary process: PID 4123 on the host.',
      add: [
        { t: 'box', id: 'kernel', x: 20, y: 272, w: 520, h: 44, text: 'one Linux kernel', tone: 'grey' },
        { t: 'node', id: 'runc', x: 80, y: 130, r: 30, text: 'runc', tone: 'grey' },
        { t: 'node', id: 'app', x: 280, y: 130, r: 34, text: 'app', sub: '4123' },
        { t: 'line', id: 'fork', x1: 112, y1: 130, x2: 244, y2: 130, arrow: true, text: 'clone' },
      ],
    },
    {
      caption: 'Flag one: a new PID namespace. The same process is PID 1 inside it, and still 4123 to the host. Namespaces change what a process can see.',
      add: [
        { t: 'box', id: 'pidbox', x: 200, y: 82, w: 160, h: 100, label: 'pid ns', tone: 'red', dashed: true },
        { t: 'text', id: 'r-pid', x: 375, y: 105, text: 'pid: 1 (host: 4123)', anchor: 'start', tone: 'red' },
      ],
    },
    {
      caption: 'Flag two: a new network namespace. It starts with only a loopback interface; a veth pair (a virtual cable) links it to the host.',
      set: { 'r-pid': { tone: 'grey' } },
      add: [{ t: 'text', id: 'r-net', x: 375, y: 135, text: 'net: lo only', anchor: 'start', tone: 'red' }],
    },
    {
      caption: 'Flag three: a mount namespace, then `pivot_root`. The image’s read-only layers, stacked by overlayfs, become `/`. Writes land in a throwaway layer.',
      set: { 'r-net': { tone: 'grey' } },
      add: [{ t: 'text', id: 'r-mnt', x: 375, y: 165, text: 'mnt: image as /', anchor: 'start', tone: 'red' }],
    },
    {
      caption: 'Five more namespaces each hide one more thing: hostname, SysV IPC, user IDs, the cgroup tree, monotonic clocks.',
      set: { 'r-mnt': { tone: 'grey' } },
      add: [
        { t: 'box', id: 'c-uts', x: 20, y: 205, w: 100, h: 46, text: 'uts', sub: 'hostname', tone: 'red' },
        { t: 'box', id: 'c-ipc', x: 127, y: 205, w: 100, h: 46, text: 'ipc', sub: 'SysV IPC', tone: 'red' },
        { t: 'box', id: 'c-user', x: 234, y: 205, w: 100, h: 46, text: 'user', sub: 'uid map', tone: 'red' },
        { t: 'box', id: 'c-cg', x: 341, y: 205, w: 100, h: 46, text: 'cgroup', sub: 'tree view', tone: 'red' },
        { t: 'box', id: 'c-time', x: 448, y: 205, w: 92, h: 46, text: 'time', sub: 'monotonic', tone: 'red' },
      ],
      stop: {
        title: 'What is not isolated',
        edge: true,
        body: (
          <>
            The kernel version, modules, <code>dmesg</code>, the wall clock and most sysctls are global. <code>/proc/meminfo</code> and <code>nproc</code> show the host, so a
            library sizing pools from them overshoots the limit.
          </>
        ),
      },
    },
    {
      caption: 'Nothing else was added. There is no guest OS: `uname -r` inside prints the host’s kernel. A container is not a small VM.',
      set: { kernel: { tone: 'red', text: 'same kernel as the host' }, 'c-uts': { tone: 'grey' }, 'c-ipc': { tone: 'grey' }, 'c-user': { tone: 'grey' }, 'c-cg': { tone: 'grey' }, 'c-time': { tone: 'grey' } },
    },
    {
      caption: 'Limits are a different mechanism: cgroups. Namespaces set what it can see; a cgroup sets what it can use: memory, CPU time, number of tasks.',
      drop: ['runc', 'fork'],
      set: { kernel: { tone: 'grey', text: 'one Linux kernel' } },
      add: [
        { t: 'text', id: 'h-use', x: 20, y: 78, text: 'cgroup: USE', anchor: 'start', tone: 'red' },
        { t: 'text', id: 'u1', x: 20, y: 108, text: 'memory.max', anchor: 'start', tone: 'red' },
        { t: 'text', id: 'u2', x: 20, y: 138, text: 'cpu.max', anchor: 'start', tone: 'red' },
        { t: 'text', id: 'u3', x: 20, y: 168, text: 'pids.max', anchor: 'start', tone: 'red' },
        { t: 'text', id: 'h-see', x: 375, y: 78, text: 'namespaces: SEE', anchor: 'start', tone: 'grey' },
      ],
      stop: {
        title: 'docker exec = setns',
        edge: true,
        body: (
          <>
            <code>docker exec</code> starts a second process and joins the first one’s namespaces with <code>setns</code>. <code>--privileged</code> removes most of the isolation.
          </>
        ),
      },
    },
  ],
}

/* ---------- 01b · containers vs VMs vs gVisor ---------- */
const COLX = { c: 8, g: 196, v: 384 }
const col = (id: string, x: number): El[] => [
  { t: 'box', id: id + '-app', x, y: 40, w: 168, h: 36, text: 'app' },
]
export const isolation: FlowDef = {
  h: 320,
  steps: [
    {
      caption: 'A container’s syscalls go straight to the host kernel. Hundreds of syscalls and every driver behind them are attack surface; one kernel bug can mean an escape.',
      add: [
        { t: 'box', id: 'hw', x: 8, y: 188, w: 544, h: 30, text: 'hardware', tone: 'grey' },
        { t: 'text', id: 'c-title', x: COLX.c + 84, y: 22, text: 'container', tone: 'ink' },
        ...col('c', COLX.c),
        { t: 'box', id: 'c-k', x: COLX.c, y: 84, w: 168, h: 96, text: 'host kernel', sub: 'shared' },
        { t: 'text', id: 'c-note', x: COLX.c + 84, y: 248, text: 'every syscall\nreaches the\nhost kernel', tone: 'red' },
      ],
    },
    {
      caption: 'A VM has its own guest kernel and talks to a hypervisor (KVM). The host-facing surface is the hypervisor and its device models: much smaller.',
      add: [
        { t: 'text', id: 'v-title', x: COLX.v + 84, y: 22, text: 'VM', tone: 'ink' },
        ...col('v', COLX.v),
        { t: 'box', id: 'v-k', x: COLX.v, y: 84, w: 168, h: 44, text: 'guest kernel', sub: 'its own' },
        { t: 'box', id: 'v-h', x: COLX.v, y: 136, w: 168, h: 44, text: 'hypervisor', sub: 'KVM + VMM' },
        { t: 'text', id: 'v-note', x: COLX.v + 84, y: 248, text: 'small VMM +\ndevice models', tone: 'red' },
      ],
      set: { 'c-note': { tone: 'grey' } },
    },
    {
      caption: 'gVisor sits between: an “application kernel” written in Go answers the app’s syscalls in userspace. It is not a VM, so less of the host kernel is exposed.',
      add: [
        { t: 'text', id: 'g-title', x: COLX.g + 84, y: 22, text: 'gVisor', tone: 'ink' },
        ...col('g', COLX.g),
        { t: 'box', id: 'g-k', x: COLX.g, y: 84, w: 168, h: 44, text: 'app kernel', sub: 'Go, userspace' },
        { t: 'box', id: 'g-h', x: COLX.g, y: 136, w: 168, h: 44, text: 'host kernel', sub: 'less exposed' },
        { t: 'text', id: 'g-note', x: COLX.g + 84, y: 248, text: 'slower syscalls,\nfs, network;\ncompat gaps', tone: 'red' },
      ],
      set: { 'v-note': { tone: 'grey' } },
    },
    {
      caption: 'Kata Containers puts each pod in a lightweight VM (not re-checked here). Firecracker is a minimal KVM VMM for fast microVMs, used by Lambda and Fargate.',
      set: { 'g-note': { tone: 'grey' }, 'v-title': { text: 'Kata · microVM', tone: 'red' }, 'v-h': { text: 'VMM', sub: 'Firecracker, QEMU' } },
      stop: {
        title: 'Rule of thumb',
        edge: true,
        body: (
          <>
            Untrusted, multi-tenant code: put a VM boundary (or gVisor) around it. Trusted services of one organisation: plain containers are fine.
          </>
        ),
      },
    },
  ],
}

/* ---------- 02a · memory limit: who dies ---------- */
// 1 MB = 8.8 units; the bucket spans x 60..500
export const memory: FlowDef = {
  h: 320,
  steps: [
    {
      caption: 'A cgroup memory limit is a bucket: here 50 MB (`docker run -m 50m`). The Go heap takes 8 MB of it. Sizes are illustrative.',
      add: [
        { t: 'box', id: 'bucket', x: 56, y: 30, w: 448, h: 100, label: 'memory.max = 50 MB', dashed: true, tone: 'grey' },
        { t: 'box', id: 'heap', x: 60, y: 62, w: 70, h: 50, text: 'heap', sub: '8 MB' },
        { t: 'text', id: 'status', x: 280, y: 165, text: '8 / 50 MB charged', tone: 'ink' },
      ],
    },
    {
      caption: 'Writing a 30 MB file fills the page cache, and cache is charged to the same bucket. Measured on cgroup v1: cache 31.5 MB, dirty 31.5 MB, RSS 168 KB.',
      add: [{ t: 'box', id: 'cache', x: 130, y: 62, w: 264, h: 50, text: 'page cache', sub: '30 MB, all dirty', tone: 'soft' }],
      set: { status: { text: '38 / 50 MB charged' } },
    },
    {
      caption: 'The app allocates 12 MB more. Charged memory reaches the limit, so the kernel must free something before it can grant more.',
      set: { heap: { w: 176, sub: '20 MB' }, cache: { x: 236 }, status: { text: '50 / 50 MB: at the limit', tone: 'red' } },
    },
    {
      caption: 'Clean cache can simply be dropped. Dirty pages must be written to disk first, so the allocation waits: a latency spike, not a kill.',
      set: { cache: { tone: 'red', sub: 'dirty: write out first' }, status: { text: 'app stalls in reclaim\nno kill yet', tone: 'red' } },
      stop: {
        title: 'Stall, not kill',
        edge: true,
        body: (
          <>
            Dirty pages force a wait before reclaim. cgroup v2’s <code>memory.high</code> is a deliberate throttle line: the service looks hung, but no OOM event fires (kernel docs; only v1 was run here).
          </>
        ),
      },
    },
    {
      caption: 'Writeback finishes, the pages turn clean, and the kernel drops them. The allocation succeeds. Nothing leaked: the “high usage” was mostly cache.',
      set: { cache: { w: 88, tone: 'soft', sub: '10 MB, clean' }, status: { text: '30 / 50 MB: allocation succeeds', tone: 'ink' } },
    },
    {
      caption: 'The app keeps growing. Cache is already gone, and anonymous memory can’t be dropped (assuming no swap). Nothing reclaimable is left.',
      drop: ['cache'],
      set: { heap: { w: 440, sub: '50 MB', tone: 'red' }, status: { text: '50 / 50 MB: nothing to reclaim', tone: 'red' } },
    },
    {
      caption: 'The cgroup’s OOM killer picks a victim inside it and sends SIGKILL: exit 137 (128 + 9). Only this cgroup is hit, even with free RAM on the node.',
      set: { heap: { tone: 'grey', dashed: true, text: 'killed', sub: 'SIGKILL' }, status: { text: 'exit 137 = 128 + 9', tone: 'red' } },
      add: [
        { t: 'text', id: 'no', x: 280, y: 200, text: 'no SIGTERM, no defer, no log', tone: 'ink' },
        { t: 'text', id: 'dmesg', x: 280, y: 228, text: 'dmesg: CONSTRAINT_MEMCG', tone: 'grey' },
        { t: 'box', id: 'node', x: 20, y: 262, w: 520, h: 40, text: 'node: RAM still free', tone: 'grey', dashed: true },
      ],
      stop: {
        title: 'OOMKilled, small heap',
        edge: true,
        body: (
          <>
            The limit counts page cache, tmpfs, stacks and socket buffers, not just the Go heap. <code>GOMEMLIMIT</code> sees only Go’s memory: set it 5–10% below the limit.
          </>
        ),
      },
    },
  ],
}

/* ---------- 02b · CPU limit: the 100 ms clock ---------- */
// one 100 ms period = x 48..512 (4.64 units per ms); 4 threads burn 50 ms of quota in 12.5 ms
const rows = [60, 90, 120, 150]
export const cpu: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'A CPU limit is a budget per 100 ms period (`cpu.max`). Limit 0.5 CPU means 50 ms of CPU time per period, summed over all threads.',
      add: [
        { t: 'box', id: 'period', x: 40, y: 44, w: 480, h: 170, label: 'one 100 ms period', dashed: true, tone: 'grey' },
        { t: 'box', id: 'bud', x: 48, y: 190, w: 464, h: 18 },
        { t: 'text', id: 'budtxt', x: 280, y: 246, text: 'budget left: 50 ms of CPU' },
      ],
    },
    {
      caption: 'Go 1.24 starts 4 threads (GOMAXPROCS = 4 host CPUs). They run in parallel, so the budget drains four times faster than the clock.',
      add: rows.map((y, i) => ({ t: 'box', id: 't' + i, x: 48, y, w: 29, h: 22, tone: 'ink' }) as El),
      set: { bud: { w: 232 }, budtxt: { text: 'budget left: 25 ms of CPU' } },
    },
    {
      caption: 'At about 12 ms the budget is 0. The kernel freezes every thread until the period ends: 88 ms of nothing. Threads are throttled together.',
      add: rows.map((y, i) => ({ t: 'box', id: 'f' + i, x: 106, y, w: 406, h: 22, tone: 'red', dashed: true }) as El),
      set: {
        ...Object.fromEntries(rows.map((_, i) => ['t' + i, { w: 58 }])),
        bud: { w: 4, tone: 'red' },
        budtxt: { text: 'budget left: 0 (throttled)', tone: 'red' },
      },
      stop: {
        title: 'Quota is pooled',
        edge: true,
        body: (
          <>
            The quota is shared by all threads: 8 busy threads on <code>limit=2</code> are throttled after 25 ms of every 100 ms. A limit is not a pinned core.
          </>
        ),
      },
    },
    {
      caption: 'A request arriving at 50 ms finds every thread frozen and waits for the next period. Average CPU can look low while p99 latency jumps.',
      add: [{ t: 'msg', id: 'req', y: 270, x1: 280, x2: 512, text: 'request waits', tone: 'red', dashed: true }],
      stop: {
        title: 'Low average, bad p99',
        edge: true,
        body: (
          <>
            Averages hide it. Watch <code>nr_throttled / nr_periods</code> and <code>throttled_time</code> in <code>cpu.stat</code>.
          </>
        ),
      },
    },
    {
      caption: 'Measured with Go 1.24 on a 0.5 CPU quota: 28 of 31 periods throttled; a 4-goroutine spin took 2.81 s instead of 0.73 s.',
      drop: ['req'],
      set: { budtxt: { text: 'cpu.stat: 28 of 31 periods throttled' } },
    },
    {
      caption: 'Fix: set GOMAXPROCS near the limit (Go 1.25+ derives it from the cgroup CPU limit; earlier, `automaxprocs`). Or keep a request, drop the limit.',
      drop: ['t1', 't2', 't3', 'f0', 'f1', 'f2', 'f3'],
      set: { t0: { tone: 'ink' }, bud: { w: 348, tone: 'ink' }, budtxt: { text: 'budget left: 38 ms of CPU', tone: 'ink' } },
    },
  ],
}

/* ---------- 03 · PID 1 ---------- */
const LX = { d: 70, p: 280, a: 460 }
export const pid1: FlowDef = {
  h: 320,
  steps: [
    {
      caption: '`CMD ./app` (shell form) makes `/bin/sh -c` PID 1 and the app its child, PID 7. `docker stop` signals PID 1, not the app.',
      add: [
        lane('d', 'docker', LX.d, 300),
        lane('p', 'PID 1', LX.p, 300, { w: 110, sub: '/bin/sh -c' }),
        lane('a', 'app', LX.a, 300, { sub: 'PID 7' }),
        { t: 'msg', id: 'm1', from: 'p', to: 'a', y: 92, text: 'spawns' },
      ],
    },
    {
      caption: '`docker stop` sends SIGTERM, the polite “please finish and exit” signal, to PID 1.',
      add: [{ t: 'msg', id: 'm2', from: 'd', to: 'p', y: 135, text: 'SIGTERM', tone: 'red' }],
    },
    {
      caption: 'The kernel delivers a signal to PID 1 only if it installed a handler. This shell has none, so SIGTERM is dropped: in my test the shell simply survived.',
      set: { m2: { lost: true } },
    },
    {
      caption: 'After the grace period (10 s by default) docker sends SIGKILL. When PID 1 dies the kernel kills the whole namespace: no cleanup, no drain.',
      add: [{ t: 'msg', id: 'm3', from: 'd', to: 'p', y: 205, text: 'SIGKILL +10s', tone: 'red' }],
      set: { p: { dead: true }, a: { dead: true } },
      stop: {
        title: 'Use exec form',
        edge: true,
        body: (
          <>
            <p>Make your binary PID 1, or use an init.</p>
            <Code>{`
CMD ["./app"]     # app is PID 1
exec ./app        # in a shell script
docker run --init # tini is PID 1
`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Now a Go binary is PID 1. Go installs handlers for almost every signal, so SIGTERM does arrive. With no `signal.Notify` the runtime exits at once: status 2, no defers.',
      drop: ['d', 'p', 'a', 'm1', 'm2', 'm3'],
      add: [
        lane('d2', 'docker', LX.d, 300),
        lane('g', 'Go app', LX.p, 300, { w: 110, sub: 'PID 1', dead: true }),
        { t: 'msg', id: 'n1', from: 'd2', to: 'g', y: 100, text: 'SIGTERM', tone: 'red' },
        { t: 'msg', id: 'n2', from: 'g', to: 'd2', y: 160, text: 'exit status 2', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'Catch SIGTERM with `signal.NotifyContext`, stop accepting work, drain, exit 0. In Kubernetes, Service traffic can still arrive briefly after SIGTERM.',
      drop: ['n2'],
      set: { g: { dead: false } },
      add: [
        { t: 'box', id: 'drain', x: 210, y: 130, w: 140, h: 30, text: 'srv.Shutdown', tone: 'ink' },
        { t: 'msg', id: 'n3', from: 'g', to: 'd2', y: 205, text: 'exit 0' },
      ],
      stop: {
        title: 'Handle it in Go',
        edge: true,
        body: (
          <>
            <p>Then give Shutdown a timeout below the grace period (Docker 10 s, Kubernetes 30 s by default).</p>
            <Code>{`
ctx, stop := signal.NotifyContext(
    context.Background(),
    syscall.SIGTERM, os.Interrupt)
defer stop()
<-ctx.Done()
stop() // a second signal kills
srv.Shutdown(shutdownCtx)
`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'PID 1 also adopts orphans and must `Wait` for them. A Go PID 1 that starts children and never waits leaves `Z` zombies, each still holding a PID.',
      drop: ['d2', 'g', 'n1', 'n3', 'drain'],
      add: [
        lane('pp', 'PID 1', 150, 300, { w: 110, sub: 'Go app' }),
        lane('ch', 'sleep', 410, 300, { sub: 'child' }),
        { t: 'msg', id: 'z1', from: 'pp', to: 'ch', y: 92, text: 'exec.Command' },
        { t: 'msg', id: 'z2', from: 'ch', to: 'pp', y: 135, text: 'exits', tone: 'red' },
        { t: 'box', id: 'zom', x: 345, y: 160, w: 130, h: 44, text: 'Z defunct', sub: 'still in table', tone: 'red', dashed: true },
      ],
      stop: {
        title: 'Zombies fill pids.max',
        edge: true,
        body: (
          <>
            Zombies keep their PID; enough of them hit <code>pids.max</code> and <code>fork</code> fails with EAGAIN. <code>docker run --init</code> (tini) reaps them.
          </>
        ),
      },
    },
    {
      caption: 'With `docker run --init`, tini is PID 1: it reaps every orphan with `wait()` and forwards signals to your app.',
      drop: ['zom'],
      set: { pp: { text: 'tini', sub: '--init' }, z2: { tone: 'grey' } },
      add: [{ t: 'msg', id: 'z3', from: 'pp', to: 'ch', y: 205, text: 'wait()' }],
    },
  ],
}

/* ---------- 04 · Kubernetes requests, limits, QoS ---------- */
// node bar: 8 Gi allocatable = x 60..500 (55 units per Gi)
export const k8s: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'The scheduler packs pods by requests, not by use: A, B and C request 3 + 3 + 1 = 7 of the node’s 8 Gi allocatable.',
      add: [
        { t: 'box', id: 'nodebar', x: 56, y: 30, w: 448, h: 70, label: 'node: 8 Gi allocatable', dashed: true, tone: 'grey' },
        { t: 'box', id: 'pa', x: 60, y: 46, w: 165, h: 48, text: 'A', sub: 'req 3 Gi' },
        { t: 'box', id: 'pb', x: 225, y: 46, w: 165, h: 48, text: 'B', sub: 'req 3 Gi' },
        { t: 'box', id: 'pc', x: 390, y: 46, w: 55, h: 48, text: 'C', sub: '1' },
      ],
    },
    {
      caption: 'Pod D requests 2 Gi and stays Pending, even if A, B and C actually use far less. Requests are reserved on paper.',
      add: [{ t: 'box', id: 'pd', x: 60, y: 140, w: 110, h: 48, text: 'D', sub: 'req 2 Gi', tone: 'red', dashed: true }, { t: 'text', id: 'pend', x: 190, y: 170, text: 'Pending: 1 Gi free < 2 Gi', anchor: 'start', tone: 'red' }],
    },
    {
      caption: 'Requests steer scheduling and CPU weight. Limits are kernel walls: a CPU limit throttles, a memory limit OOM-kills.',
      drop: ['nodebar', 'pa', 'pb', 'pc', 'pd', 'pend'],
      add: [
        { t: 'box', id: 'k1', x: 20, y: 30, w: 190, h: 44, text: 'requests.cpu' },
        { t: 'line', id: 'l1', x1: 214, y1: 52, x2: 262, y2: 52, arrow: true },
        { t: 'box', id: 'v1', x: 266, y: 30, w: 274, h: 44, text: 'cpu.weight', sub: 'share, only when busy' },
        { t: 'box', id: 'k2', x: 20, y: 96, w: 190, h: 44, text: 'limits.cpu', tone: 'red' },
        { t: 'line', id: 'l2', x1: 214, y1: 118, x2: 262, y2: 118, arrow: true, tone: 'red' },
        { t: 'box', id: 'v2', x: 266, y: 96, w: 274, h: 44, text: 'cpu.max', sub: 'throttles, even if idle', tone: 'red' },
        { t: 'box', id: 'k3', x: 20, y: 162, w: 190, h: 44, text: 'limits.memory', tone: 'red' },
        { t: 'line', id: 'l3', x1: 214, y1: 184, x2: 262, y2: 184, arrow: true, tone: 'red' },
        { t: 'box', id: 'v3', x: 266, y: 162, w: 274, h: 44, text: 'memory.max', sub: 'OOM kill, exit 137', tone: 'red' },
      ],
      stop: {
        title: 'A limit is a ceiling',
        edge: true,
        body: <>A limit is not a guarantee, and a request is not just a hint: it drives scheduling, CPU weight, OOM score and eviction order.</>,
      },
    },
    {
      caption: 'QoS class follows from requests and limits. In a node-level OOM the kernel kills the highest `oom_score_adj` first: BestEffort, then Burstable.',
      drop: ['k1', 'l1', 'v1', 'k2', 'l2', 'v2', 'k3', 'l3', 'v3'],
      add: [
        { t: 'box', id: 'q1', x: 20, y: 30, w: 520, h: 56, text: 'Guaranteed · adj −997', sub: 'every container: limit = request, CPU and memory' },
        { t: 'box', id: 'q2', x: 20, y: 100, w: 520, h: 56, text: 'Burstable · adj 2 to 999', sub: 'some request or limit, but not Guaranteed', tone: 'red' },
        { t: 'box', id: 'q3', x: 20, y: 170, w: 520, h: 56, text: 'BestEffort · adj 1000', sub: 'no requests, no limits: killed first', tone: 'red' },
      ],
    },
    {
      caption: 'Before the kernel OOMs, the kubelet evicts under node pressure: pods over their requests go first (by priority, then overage). QoS alone doesn’t decide.',
      drop: ['q1', 'q2', 'q3'],
      add: [
        { t: 'box', id: 'e1', x: 20, y: 40, w: 520, h: 64, text: 'evicted first', sub: 'usage above requests, any QoS class', tone: 'red' },
        { t: 'line', id: 'earrow', x1: 280, y1: 108, x2: 280, y2: 146, arrow: true, tone: 'grey' },
        { t: 'box', id: 'e2', x: 20, y: 150, w: 520, h: 64, text: 'evicted last', sub: 'usage within requests, incl. Guaranteed', tone: 'grey' },
      ],
      stop: {
        title: 'Guaranteed can still die',
        edge: true,
        body: <>Guaranteed pods are evicted last, and still OOM-killed if they exceed their own limit.</>,
      },
    },
  ],
}

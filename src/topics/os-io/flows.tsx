import type { El, FlowDef } from '../../components/flow'

/*
 * Visual language for this topic: ink = normal, grey = old / inactive, red = what the step is about,
 * dashed = absent / in-flight / unconfirmed. Ladders use App on the left, the kernel in the middle,
 * the device on the right.
 */
const lane = (id: string, text: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...more }) as El
const msg = (id: string, from: string, to: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'msg', id, from, to, y, text, ...more }) as El

/* ---------- 01 · three ways to wait ---------- */
export const ladders: FlowDef = {
  h: 262,
  steps: [
    {
      caption: 'Blocking: `read()` asks the kernel for data. The calling thread sleeps inside the call until there is an answer.',
      add: [
        lane('app', 'App', 90, 250),
        lane('ker', 'Kernel', 280, 250),
        lane('dev', 'Disk / NIC', 470, 250),
        msg('b1', 'app', 'ker', 70, 'read()'),
        { t: 'box', id: 'zz', x: 25, y: 92, w: 130, h: 30, text: 'thread asleep', tone: 'red' },
      ],
    },
    {
      caption: 'The kernel starts the disk or network read and waits. That thread can do nothing else in the meantime.',
      add: [msg('b2', 'ker', 'dev', 110, 'start I/O', { y2: 135 }), msg('b3', 'dev', 'ker', 160, 'data (DMA)', { y2: 185 })],
    },
    {
      caption: 'The data arrives and `read()` returns. Simple, but 10,000 waiting connections means 10,000 sleeping threads, each with a stack.',
      add: [msg('b4', 'ker', 'app', 212, 'bytes')],
      set: { zz: { tone: 'grey', text: 'thread awake' } },
    },
    {
      caption: 'Readiness: make the sockets non-blocking and register them with epoll. `epoll_wait` sleeps until any one of them is ready.',
      drop: ['b1', 'b2', 'b3', 'b4', 'zz'],
      add: [msg('e1', 'app', 'ker', 70, 'epoll_wait'), { t: 'box', id: 'zw', x: 25, y: 92, w: 130, h: 30, text: 'waits on all', tone: 'red' }],
    },
    {
      caption: 'A packet arrives and the kernel wakes `epoll_wait`: "fd 7 is readable". That is all epoll says.',
      add: [msg('e2', 'dev', 'ker', 110, 'packet (fd 7)', { y2: 135 }), msg('e3', 'ker', 'app', 165, 'fd 7 ready', { tone: 'red' })],
      set: { zw: { tone: 'grey', text: 'awake' } },
    },
    {
      caption: 'Now you call `read()` yourself. Ready means this call will not block; the copy still runs on your thread.',
      add: [msg('e4', 'app', 'ker', 200, 'read(7)'), msg('e5', 'ker', 'app', 228, 'bytes')],
      stop: {
        title: 'epoll is not async I/O',
        edge: true,
        body: 'Readiness only says a read would not block; the read itself is still yours to do. Real async I/O is the completion model that comes next.',
      },
    },
    {
      caption: 'Completion: write an operation (an SQE) into a ring buffer shared with the kernel. The app keeps working.',
      drop: ['e1', 'e2', 'e3', 'e4', 'e5', 'zw'],
      add: [msg('c1', 'app', 'ker', 70, 'SQE: read fd7', { dashed: true }), { t: 'box', id: 'free', x: 25, y: 92, w: 130, h: 30, text: 'keeps working' }],
    },
    {
      caption: 'The kernel does the whole read for you, and this works for regular files too, which epoll cannot do.',
      add: [msg('c2', 'ker', 'dev', 110, 'read block', { y2: 135 }), msg('c3', 'dev', 'ker', 160, 'done', { y2: 185 })],
    },
    {
      caption: 'The result lands in a second shared ring as a CQE. One `io_uring_enter` can submit and wait for many operations.',
      add: [msg('c4', 'ker', 'app', 212, 'CQE: 4096 B', { dashed: true, tone: 'red' })],
      stop: {
        title: 'Not free speed',
        edge: true,
        body: 'Wins come from batching syscalls and real async file I/O; for plain sockets epoll is often enough. Some environments switch io_uring off, so it may be missing in production.',
      },
    },
  ],
}

/* ---------- 01 · why epoll scales ---------- */
const dots = Array.from({ length: 16 }, (_, i) => i)
const dotId = (i: number) => 'd' + i
const dotX = (i: number) => 40 + i * 32
const ready = [2, 7, 12]
const dotEls: El[] = dots.map((i) => ({ t: 'node', id: dotId(i), x: dotX(i), y: 90, r: 7, tone: ready.includes(i) ? 'red' : 'ink' }) as El)
const setAll = (tone: string, except: number[] = []) => Object.fromEntries(dots.filter((i) => !except.includes(i)).map((i) => [dotId(i), { tone }]))

export const epollScale: FlowDef = {
  h: 290,
  steps: [
    {
      caption: '10,000 sockets, three have data (16 drawn). Trying a non-blocking `read()` on each would cost 10,000 syscalls. We want the kernel to say which.',
      add: [...dotEls, { t: 'text', id: 'lab', x: 280, y: 68, text: 'each dot is a socket', tone: 'grey' }, { t: 'box', id: 'thr', x: 20, y: 235, w: 130, h: 34, text: 'your thread' }],
    },
    {
      caption: '`select` and `poll` take the whole list on every call and the kernel checks every fd, even for 3 ready. `select` also stops at 1,024 fds.',
      set: setAll('grey', ready),
      add: [
        { t: 'box', id: 'scan', x: 140, y: 165, w: 280, h: 34, text: 'kernel scans all 10,000', tone: 'red' },
        { t: 'line', id: 'ask', x1: 85, y1: 235, x2: 175, y2: 201, arrow: true },
        { t: 'text', id: 'asklab', x: 20, y: 206, text: 'whole list', anchor: 'start' },
      ],
    },
    {
      caption: '`epoll_ctl(ADD)` registers each fd once. The kernel keeps the list and hangs a callback on each socket, so later waits never re-send or re-scan it.',
      drop: ['scan', 'ask', 'asklab'],
      set: setAll('ink', []),
      add: [{ t: 'box', id: 'int', x: 20, y: 14, w: 520, h: 32, text: 'kernel: interest list (registered once)' }],
    },
    {
      caption: 'Data lands on three sockets. Each callback puts its fd on a ready list: readiness is pushed to the kernel, not searched for.',
      set: Object.fromEntries(ready.map((i) => [dotId(i), { tone: 'red' }])),
      add: [
        { t: 'box', id: 'rdy', x: 140, y: 165, w: 280, h: 34, text: 'kernel: ready list' },
        ...ready.map((i, k) => ({ t: 'line', id: 'cb' + i, x1: dotX(i), y1: 99, x2: 200 + k * 80, y2: 163, arrow: true, tone: 'red' }) as El),
      ],
    },
    {
      caption: '`epoll_wait` returns only that list: 3 events. Cost follows the ready events, not the 10,000 registered fds.',
      add: [{ t: 'line', id: 'ret', x1: 200, y1: 201, x2: 100, y2: 233, arrow: true }, { t: 'text', id: 'retlab', x: 20, y: 206, text: '3 events', anchor: 'start' }],
    },
    {
      caption: '100 bytes arrive and you read 40. Level-triggered epoll reports the fd again. Edge-triggered (`EPOLLET`) fires only on new data, so it stays silent.',
      drop: [...dots.map(dotId), 'lab', 'int', 'rdy', 'thr', 'ret', 'retlab', ...ready.map((i) => 'cb' + i)],
      add: [
        { t: 'box', id: 'buf', x: 170, y: 40, w: 220, h: 56, label: 'SOCKET BUFFER', text: '100 B, read 40', tone: 'red' },
        { t: 'box', id: 'lt', x: 20, y: 150, w: 250, h: 62, label: 'LEVEL', text: 'reported again' },
        { t: 'box', id: 'et', x: 290, y: 150, w: 250, h: 62, label: 'EDGE (EPOLLET)', text: 'silent: 60 B stuck', tone: 'red', dashed: true },
      ],
      stop: {
        title: 'Drain to EAGAIN',
        edge: true,
        body: <>With <code>EPOLLET</code>, use non-blocking fds and read until <code>EAGAIN</code>, or you hang. Level is forgiving, but an fd you never read makes <code>epoll_wait</code> return at once, forever: a busy loop.</>,
      },
    },
    {
      caption: 'Many workers sleep on one listener. A connection arrives, all of them wake, one wins `accept`, the rest go back to sleep.',
      drop: ['buf', 'lt', 'et'],
      add: [
        { t: 'box', id: 'lsn', x: 170, y: 20, w: 220, h: 34, text: 'listening socket' },
        ...[0, 1, 2, 3].map((k) => ({ t: 'node', id: 'w' + k, x: 90 + k * 127, y: 190, r: 24, text: 'W' + (k + 1), tone: 'red' }) as El),
        ...[0, 1, 2, 3].map((k) => ({ t: 'line', id: 'wl' + k, x1: 280, y1: 56, x2: 90 + k * 127, y2: 164, arrow: true, tone: 'red', dashed: true }) as El),
      ],
      stop: {
        title: 'Fixing the herd',
        edge: true,
        body: <><code>EPOLLEXCLUSIVE</code> (Linux 4.5) wakes one or more waiters, not strictly one. <code>SO_REUSEPORT</code> gives each worker its own listener. Go has one epoll fd per process, so it has no herd.</>,
      },
    },
  ],
}

/* ---------- 02 · Go: sockets are parked, files block a thread ---------- */
export const netpollFile: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'A socket is non-blocking. `conn.Read` calls `read()`; with no data yet the kernel answers `EAGAIN` at once instead of sleeping the thread.',
      add: [
        lane('g', 'Goroutine', 80, 265),
        lane('r', 'Runtime', 280, 265),
        lane('k', 'Kernel', 480, 265),
        msg('m1', 'g', 'k', 70, 'read(conn)'),
        msg('m2', 'k', 'g', 98, 'EAGAIN', { tone: 'red' }),
      ],
    },
    {
      caption: 'The goroutine parks in the runtime. Its thread and P go on running other goroutines, so no thread sleeps in the kernel.',
      add: [msg('m3', 'g', 'r', 135, 'park G1'), { t: 'box', id: 'other', x: 215, y: 158, w: 130, h: 30, text: 'runs other Gs' }],
    },
    {
      caption: 'The socket was registered once with `EPOLLET`. When data lands, the scheduler\'s poll, or `sysmon` if nobody polled for 10 ms, finds the event and wakes G1.',
      add: [msg('m4', 'k', 'r', 205, 'fd ready', { y2: 225, tone: 'red' }), msg('m5', 'r', 'g', 250, 'run G1')],
    },
    {
      caption: 'A regular file is different. On `os.Open`, Go tries to register it with epoll and Linux answers `EPERM`. Go marks the file non-pollable.',
      drop: ['m1', 'm2', 'm3', 'm4', 'm5', 'other'],
      add: [msg('f1', 'g', 'k', 70, 'epoll_ctl(file)'), msg('f2', 'k', 'g', 98, 'EPERM', { tone: 'red' })],
      stop: {
        title: 'Why not pollable?',
        edge: true,
        body: <>Ready means data is already buffered. A file read is data not yet read: the kernel would have to start the disk I/O first. <code>select</code> and <code>poll</code> call files always ready; Linux epoll refuses them.</>,
      },
    },
    {
      caption: 'So `f.Read` is a plain blocking `read()`. The thread (M) sleeps in the kernel and holds its P, so that P runs nothing meanwhile.',
      add: [msg('f3', 'g', 'k', 135, 'read(file)', { y2: 160 }), { t: 'box', id: 'stuck', x: 15, y: 175, w: 130, h: 30, text: 'M blocked', tone: 'red' }],
    },
    {
      caption: '`sysmon` sees the thread stuck in a syscall and, once other goroutines are waiting for a P, retakes it and hands it to another thread (idle: after 10 ms).',
      add: [{ t: 'box', id: 'retake', x: 205, y: 205, w: 150, h: 46, text: 'sysmon retakes\nP → M2', tone: 'red' }],
      stop: {
        title: 'Threads pile up',
        edge: true,
        body: '500 goroutines stuck in slow file reads at once can mean hundreds of threads, one per blocked read (limit 10,000). Go\'s standard library does not use io_uring; issue #31908 is open and unplanned.',
      },
    },
  ],
}

/* ---------- 03 · write() is a promise to the page cache ---------- */
export const writeCache: FlowDef = {
  h: 490,
  steps: [
    {
      caption: '`write()` copies the bytes into a page of the page cache (spare RAM used for files) and marks it dirty. The disk has not been touched.',
      add: [
        lane('app', 'App', 70, 455),
        lane('pc', 'Page cache', 205, 455),
        lane('dc', 'Disk cache', 345, 455),
        lane('md', 'Flash/platter', 485, 455),
        msg('w1', 'app', 'pc', 72, 'write(4 KB)'),
        { t: 'box', id: 'dirty', x: 150, y: 96, w: 110, h: 30, text: 'page: dirty', tone: 'red' },
      ],
    },
    {
      caption: '`write()` returns success. That means the kernel has your data in RAM, not that the disk has it.',
      add: [msg('w2', 'pc', 'app', 152, 'ok')],
      stop: {
        title: 'kill -9 vs power cut',
        edge: true,
        body: 'Kill the process and the data survives: the kernel owns the page. Cut the power and every dirty page is gone. Flusher threads write back on a timer, here every 5 s for pages older than 30 s.',
      },
    },
    {
      caption: '`fsync` pushes the dirty pages to the device. The disk may only park them in its own volatile cache: a second place data can hide.',
      add: [
        msg('w3', 'app', 'pc', 195, 'fsync(fd)'),
        msg('w4', 'pc', 'dc', 220, 'write pages', { y2: 245 }),
        { t: 'box', id: 'inc', x: 275, y: 254, w: 140, h: 30, text: 'in disk cache', tone: 'red', dashed: true },
      ],
      set: { dirty: { tone: 'grey' } },
    },
    {
      caption: 'So the kernel also sends a flush command. The disk writes its cache out to flash or platter and only then acknowledges.',
      add: [
        msg('w5', 'pc', 'dc', 322, 'FLUSH cache', { y2: 332 }),
        msg('w6', 'dc', 'md', 358, 'persist', { y2: 383 }),
        { t: 'box', id: 'dur', x: 440, y: 391, w: 90, h: 30, text: 'durable' },
      ],
      set: { inc: { tone: 'grey' } },
    },
    {
      caption: 'Only then does `fsync` return. On this VM, 200 appends of 4 KiB took about 50 ms with `fsync` and under 1 ms without. Only the ratio matters; disks differ.',
      add: [msg('w7', 'dc', 'pc', 434, 'done'), msg('w8', 'pc', 'app', 460, 'fsync = 0', { tone: 'red' })],
      stop: {
        title: 'When fsync lies',
        edge: true,
        body: <><code>fsync</code> trusts the device. A drive or hypervisor that acks before persisting, or ignores flushes, breaks the promise. <code>fdatasync</code> skips metadata that is not needed to read the data back.</>,
      },
    },
  ],
}

/* ---------- 03 · three waiting rooms, and what fsync misses ---------- */
export const layers: FlowDef = {
  h: 245,
  steps: [
    {
      caption: 'Three waiting rooms for your bytes. `bufio.Writer.Flush` moves them to the kernel only. Forget it and the buffered tail is lost on exit.',
      add: [
        { t: 'box', id: 'l1', x: 10, y: 50, w: 130, h: 60, label: 'YOUR HEAP', text: 'bufio buffer', tone: 'red' },
        { t: 'box', id: 'l2', x: 215, y: 50, w: 130, h: 60, label: 'KERNEL RAM', text: 'page cache' },
        { t: 'box', id: 'l3', x: 420, y: 50, w: 130, h: 60, label: 'DEVICE', text: 'disk' },
        { t: 'line', id: 'fl', x1: 142, y1: 80, x2: 213, y2: 80, arrow: true, text: 'Flush()' },
      ],
    },
    {
      caption: '`f.Sync()` (`fsync`) is what reaches the disk. `Close` does not do it for you, and `Flush` alone makes nothing durable.',
      add: [{ t: 'line', id: 'fs', x1: 347, y1: 80, x2: 418, y2: 80, arrow: true, tone: 'red', text: 'fsync()' }],
      set: { l1: { tone: 'grey' } },
      stop: {
        title: 'O_DIRECT is not durability',
        edge: true,
        body: <><code>O_DIRECT</code> skips the page cache but promises no flush. It needs an aligned buffer, length and offset (else typically <code>EINVAL</code>), and you still need <code>fsync</code>.</>,
      },
    },
    {
      caption: 'A new file\'s name lives in its directory\'s blocks, which `fsync(file)` does not necessarily cover. Safe replace: write temp, `fsync`, `rename`, then `fsync` the directory.',
      add: [{ t: 'box', id: 'dir', x: 215, y: 170, w: 130, h: 60, label: 'KERNEL RAM', text: 'dir entry', sub: 'not synced', tone: 'red', dashed: true }],
      set: { fl: { tone: 'grey' }, fs: { tone: 'grey' } },
    },
    {
      caption: 'If write-back fails, `fsync` returns `EIO`. The error may concern data written through another descriptor of the same file.',
      drop: ['dir', 'fl'],
      set: { fs: { tone: 'red', dashed: true, text: 'EIO' }, l3: { tone: 'red' } },
      stop: {
        title: 'After fsync fails',
        edge: true,
        body: 'Do not retry and carry on: the state of the file is unknown. Treat it as fatal and rebuild from your log, not from the file you just failed to sync.',
      },
    },
  ],
}

/* ---------- 04 · zero-copy ---------- */
const col = { x: 40, w: 170, h: 44 }
const gap = { d: 8, p: 84, u: 160, s: 236, n: 312 }
const box = (id: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'box', id, x: col.x, y, w: col.w, h: col.h, text, ...more }) as El
const down = (id: string, y1: number, y2: number, more: Partial<El> = {}): El => ({ t: 'line', id, x1: 125, y1, x2: 125, y2, arrow: true, ...more }) as El
const note = (id: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'text', id, x: 235, y, text, anchor: 'start', ...more }) as El

export const zeroCopy: FlowDef = {
  h: 362,
  steps: [
    {
      caption: 'Naive: `read()` then `write()`. Two syscalls and two CPU copies through your buffer; the disk and NIC move their data by DMA.',
      add: [
        box('disk', gap.d, 'Disk'),
        box('pc', gap.p, 'Page cache'),
        box('ub', gap.u, 'Your buffer', { tone: 'soft' }),
        box('sb', gap.s, 'Socket buffer'),
        box('nic', gap.n, 'NIC'),
        down('a1', gap.d + col.h, gap.p),
        down('a2', gap.p + col.h, gap.u, { tone: 'red' }),
        down('a3', gap.u + col.h, gap.s, { tone: 'red' }),
        down('a4', gap.s + col.h, gap.n),
        note('n1', gap.d + col.h + 16, 'DMA', { tone: 'grey' }),
        note('n4', gap.s + col.h + 16, 'DMA', { tone: 'grey' }),
        note('n2', gap.p + col.h + 16, 'read(): CPU copy', { tone: 'red' }),
        note('n3', gap.u + col.h + 16, 'write(): CPU copy', { tone: 'red' }),
      ],
    },
    {
      caption: '`sendfile` moves the pages from the page cache to the socket inside the kernel. Your buffer is skipped: one syscall, no copy through user space.',
      drop: ['n2', 'n3'],
      set: { ub: { tone: 'grey', dashed: true }, a2: { tone: 'grey', dashed: true }, a3: { tone: 'grey', dashed: true } },
      add: [
        { t: 'line', id: 'sf', x1: 235, y1: gap.p + col.h, x2: 235, y2: gap.s, arrow: true },
        note('nsf', 165, 'sendfile(): no user hop', { x: 250 } as Partial<El>),
      ],
    },
    {
      caption: 'In Go, `io.Copy(conn, file)` gets this for free. `strace` on Go 1.24 to 1.26 shows `sendfile` calls and no 32 KiB copies; `io.LimitReader` and `bufio.Reader` keep it.',
      add: [note('st', 205, 'sendfile(6, 8, NULL,', { x: 250, size: 13, tone: 'grey' } as Partial<El>), note('st2', 222, '  2147483647) = 3922432', { x: 250, size: 13, tone: 'grey' } as Partial<El>)],
    },
    {
      caption: 'Put your own reader, `io.TeeReader` or `io.SectionReader` in the path and Go falls back to a 32 KiB read/write loop.',
      drop: ['sf', 'nsf', 'st', 'st2'],
      set: { ub: { tone: 'soft', dashed: false }, a2: { tone: 'red', dashed: false }, a3: { tone: 'red', dashed: false } },
      add: [note('nl', 122, '32 KiB read', { tone: 'red' }), note('nl2', 198, '32 KiB write', { tone: 'red' })],
      stop: {
        title: 'Does bufio break it?',
        edge: true,
        body: <>No: <code>bufio.Reader</code> hands over to the file's <code>WriteTo</code>, still <code>sendfile</code>. A <code>bufio.Writer</code> on the conn broke it in Go 1.24 but not in 1.25 or 1.26 (strace-checked). It varies by version: check with strace.</>,
      },
    },
    {
      caption: 'A proxy copying one TCP conn to another uses `splice` through a kernel pipe, moving pages by reference. A `tls.Conn` breaks it: encryption happens in user space.',
      drop: ['ub', 'a1', 'a2', 'a3', 'a4', 'nl', 'nl2', 'nic', 'n1', 'n4'],
      set: { disk: { text: 'Client socket' }, pc: { text: 'Pipe (kernel)' }, sb: { y: 160, text: 'Backend socket' } },
      add: [down('p1', gap.d + col.h, gap.p, { tone: 'red' }), down('p2', gap.p + col.h, 160, { tone: 'red' }), note('sp1', 60, 'splice()', { tone: 'red' }), note('sp2', 136, 'splice()', { tone: 'red' })],
    },
  ],
}

/* ---------- 04 · file descriptors ---------- */
const fdBox = (id: string, y: number, text: string, more: Partial<El> = {}): El => ({ t: 'box', id, x: 10, y, w: 110, h: 40, text, ...more }) as El
const ofd = (id: string, y: number, more: Partial<El> = {}): El => ({ t: 'box', id, x: 190, y, w: 170, h: 52, label: 'OPEN FILE DESC', text: 'offset 0', ...more }) as El
const arrow = (id: string, x1: number, y1: number, x2: number, y2: number, more: Partial<El> = {}): El => ({ t: 'line', id, x1, y1, x2, y2, arrow: true, ...more }) as El

export const descriptors: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'An fd is a small integer indexing your process\'s table. It points to an open file description (offset, flags), which points to the file itself.',
      add: [
        fdBox('f3', 50, 'fd 3'),
        ofd('o1', 44),
        { t: 'box', id: 'ino', x: 440, y: 50, w: 110, h: 40, label: 'INODE', text: 'the file' },
        arrow('l1', 122, 70, 188, 70),
        arrow('l2', 362, 70, 438, 70),
      ],
    },
    {
      caption: '`dup` and `fork` copy the table entry, not the description: both fds share one offset and flags such as `O_NONBLOCK`.',
      add: [fdBox('f4', 110, 'fd 4', { tone: 'red' }), arrow('l3', 122, 122, 200, 96, { tone: 'red' })],
    },
    {
      caption: 'A second `open()` of the same path makes a new description with its own offset. Only the inode is shared.',
      add: [fdBox('f5', 200, 'fd 5'), ofd('o2', 194, { tone: 'red' }), arrow('l4', 122, 220, 188, 220), arrow('l5', 362, 210, 460, 92)],
      set: { l3: { tone: 'ink' }, f4: { tone: 'ink' } },
    },
    {
      caption: '`close(3)` leaves the description alive while fd 4 still points at it. epoll registrations belong to the description, so a "closed" fd can keep delivering events.',
      set: { f3: { tone: 'grey', dashed: true, text: 'fd 3 closed' }, l1: { tone: 'grey', dashed: true }, o2: { tone: 'ink' }, o1: { tone: 'red' } },
      stop: {
        title: 'Running out of fds',
        edge: true,
        body: <><code>accept</code> fails with <code>EMFILE</code> at the <code>ulimit -n</code> limit, and <code>http.Server</code> backs off (up to 1 s) instead of spinning. Go raises the soft limit at startup and opens every fd <code>O_CLOEXEC</code>. Unclosed <code>resp.Body</code> and <code>os.File</code> leaks are the usual cause.</>,
      },
    },
  ],
}

import type { ReactNode } from 'react'
import type { TEventKind } from '../../sim/tricolor'
import type { GEventKind } from '../../sim/greentea'

export type Card = { title: string; body: ReactNode; edge?: boolean }

/** Why-cards for every tri-color event the guided tour can stop on. */
export const whyMark: Partial<Record<TEventKind, Card>> = {
  'root-scan': {
    title: 'scan a root',
    body: (
      <p>
        Marking starts at the roots: every goroutine stack and the globals. A stack is scanned while only its own goroutine is paused, so the rest of the program keeps running. Once scanned, the root
        box turns black.
      </p>
    ),
  },
  shade: {
    title: 'shade grey',
    body: <p>A house reached by a road gets its mark bit set and goes on the to-do list. Grey = “found, but I haven’t looked inside yet”. A house already grey or black is left alone.</p>,
  },
  'scan-black': {
    title: 'scan → black',
    body: <p>The marker pops a grey house (red while it looks inside), shades everything its roads lead to, and paints it black. It will never look inside a black house again.</p>,
  },
  'alloc-black': {
    title: 'allocate black',
    body: (
      <p>
        New objects allocated during marking are born black, so they survive this cycle even if dropped immediately (floating garbage). This is also why a freshly scanned stack can stay black: anything
        new it points to is already black.
      </p>
    ),
    edge: true,
  },
  'mark-done': {
    title: 'no grey left',
    body: <p>Marking ends when no grey house remains anywhere (no per-P queue, no write-barrier buffer). Mark termination, a short stop-the-world, finalizes the cycle.</p>,
  },
  'sweep-free': {
    title: 'sweep frees white',
    body: <p>The barrier goes off and the sweeper frees every white house. Black is the only proof that something is reachable; the GC can only be as correct as the marking was.</p>,
  },
  'sweep-cycle': {
    title: 'garbage cycle freed',
    body: <p>E and F point at each other, but no road from a root reaches them. Tracing doesn’t count references, so cycles are collected like any other garbage.</p>,
    edge: true,
  },
  safe: {
    title: 'every reachable object survived',
    body: <p>Every house the program can still reach was black at the end of marking, so nothing live was swept.</p>,
  },
  'heap-write': {
    title: 'the program writes a heap pointer',
    body: (
      <p>
        Marking is concurrent: your program keeps moving roads while the marker works. A write into a heap object is exactly where the <b>write barrier</b> runs, if one is on.
      </p>
    ),
  },
  'black-to-white': {
    title: 'black now points at white',
    body: (
      <p>
        The marker never revisits black houses, so this road will never be followed. It’s only safe while some grey house still leads to the white one (the “weak” tri-color invariant). Watch what
        happens next.
      </p>
    ),
    edge: true,
  },
  'barrier-insertion': {
    title: 'insertion half (Dijkstra)',
    body: <p>The barrier shades the NEW target of the write. This stops the program from hiding a pointer, taken from a stack the marker hasn’t reached yet, inside a black object.</p>,
  },
  'barrier-deletion': {
    title: 'deletion half (Yuasa)',
    body: <p>The barrier shades the OLD target, the one being overwritten. Anything unlinked from the heap is shaded, so it can’t escape onto an already-scanned stack.</p>,
  },
  'insert-skipped': {
    title: 'insertion skipped: stack already black',
    body: (
      <p>
        The hybrid barrier’s pseudocode only shades the new target “if the current stack is grey”. A scanned stack can’t be hiding a white pointer, so this write can’t lose anything on its own. (The real
        runtime shades both anyway: checking the stack’s color would cost more than shading.)
      </p>
    ),
    edge: true,
  },
  'stack-write': {
    title: 'stack write: no barrier',
    body: <p>Writes to local variables are never guarded: far too frequent. So a stack can pick up or drop a pointer without the GC noticing. The hybrid barrier is designed around that gap.</p>,
    edge: true,
  },
  lost: {
    title: 'use-after-free: a live object was freed',
    body: <p>The swept house is still reachable. The program will read memory that gets reused for something else. This is what a missing (or half) write barrier causes.</p>,
    edge: true,
  },
}

/** Why-cards for the Green Tea vs classic comparison. */
export const whyTea: Partial<Record<GEventKind, Card>> = {
  'c-root': {
    title: 'roots onto a stack',
    body: <p>The classic marker keeps a LIFO stack of individual objects. The roots’ targets are pushed first.</p>,
  },
  'c-scan': {
    title: 'one object at a time',
    body: (
      <p>
        Pop one object, read its pointers, and for each target look up that span’s bookkeeping to set a mark bit. Each lookup is a separate trip to memory. The counter shows the trips that missed our
        tiny two-street cache.
      </p>
    ),
  },
  'c-jump': {
    title: 'hop to another street',
    body: <p>The next object lives on a different span, so the CPU has to fetch new memory. In a real heap almost every step does this: the Go team measured at least 35% of mark time stalled on memory.</p>,
  },
  'c-skip': {
    title: 'already marked, but still a trip',
    body: <p>A pointer to an already-marked object costs nothing to mark, but the marker still had to fetch that span’s mark bits to find out.</p>,
    edge: true,
  },
  'g-enqueue': {
    title: 'first mark → queue the street',
    body: (
      <p>
        Green Tea sets the house’s seen bit, stored at the end of its own 8 KiB span, and since the street isn’t queued yet it queues the <b>street</b>, not the house. Only small objects (16–512 B) work
        this way.
      </p>
    ),
  },
  'g-accumulate': {
    title: 'street already queued → just tick',
    body: <p>Another house on a queued street is found. Its seen bit is set and nothing is queued. The street quietly collects work while it waits.</p>,
  },
  'g-dequeue-many': {
    title: 'one visit, many houses',
    body: (
      <p>
        The street comes off the FIFO queue and every seen-but-not-scanned house (<code>seen &amp;^ scanned</code>) is scanned in one sequential pass. With AVX-512 a dense street is a few vector
        instructions.
      </p>
    ),
  },
  'g-requeue': {
    title: 'a street can be queued again',
    body: <p>This street was already scanned, but a new house on it was just found. It goes back in the queue. That’s fine: the scanned bits make sure nothing is scanned twice.</p>,
    edge: true,
  },
  'g-dequeue-one': {
    title: 'single-object fast path',
    body: (
      <p>
        Nobody else ticked this street while it waited, so just the one house is scanned, like the classic marker would. Workloads where this happens all the time (deep, low-fan-out pointer chains) are
        where Green Tea can be slightly slower.
      </p>
    ),
    edge: true,
  },
}

package main

import (
	"fmt"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// probe is a fake fetch that tracks how many calls overlap. Each call waits
// (briefly) until k calls are in flight together.
type probe struct {
	k            int32
	cur, peak, n atomic.Int32
	full         chan struct{}
	once         sync.Once
}

func newProbe(k int) *probe { return &probe{k: int32(k), full: make(chan struct{})} }

func (p *probe) fetch(u string) int {
	p.n.Add(1)
	c := p.cur.Add(1)
	defer p.cur.Add(-1)
	for m := p.peak.Load(); c > m && !p.peak.CompareAndSwap(m, c); m = p.peak.Load() {
	}
	if c >= p.k {
		p.once.Do(func() { close(p.full) })
	}
	select {
	case <-p.full:
		time.Sleep(time.Millisecond)
	case <-time.After(50 * time.Millisecond):
	}
	return len(u)
}

func settled(before int) bool {
	for range 100 {
		if runtime.NumGoroutine() <= before {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func urls(n int) []string {
	var us []string
	for i := range n {
		us = append(us, strconv.Itoa(i))
	}
	return us
}

func main() {
	check("keeps input order", func() (any, any) {
		// Earlier URLs are slower, so they finish last.
		slow := func(u string) int {
			i, _ := strconv.Atoi(u)
			time.Sleep(time.Duration(10-i) * 2 * time.Millisecond)
			return 200 + i
		}
		return Crawl(urls(10), 4, slow), []int{200, 201, 202, 203, 204, 205, 206, 207, 208, 209}
	})
	check("empty list", func() (any, any) {
		return Crawl([]string{}, 3, func(string) int { return 200 }), []int{}
	})
	ok("never more than k at once", func() (bool, string) {
		p := newProbe(3)
		res := Crawl(urls(15), 3, p.fetch)
		return len(res) == 15 && p.peak.Load() <= 3, fmt.Sprintf("peak %d calls in flight, want ≤ 3", p.peak.Load())
	})
	ok("uses all k slots", func() (bool, string) {
		p := newProbe(4)
		Crawl(urls(8), 4, p.fetch)
		return p.peak.Load() == 4, fmt.Sprintf("peak %d calls in flight, want 4", p.peak.Load())
	})
	ok("fetches each URL once", func() (bool, string) {
		p := newProbe(1)
		Crawl(urls(7), 1, p.fetch)
		return p.n.Load() == 7 && p.peak.Load() == 1, fmt.Sprintf("%d calls (want 7), peak %d (want 1 for k = 1)", p.n.Load(), p.peak.Load())
	})
	ok("no goroutines left behind", func() (bool, string) {
		before := runtime.NumGoroutine()
		Crawl(urls(10), 3, func(string) int { return 200 })
		return settled(before), fmt.Sprintf("%d goroutines still running", runtime.NumGoroutine()-before)
	})
	done()
}

package main

import (
	"errors"
	"fmt"
	"runtime"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

func feed(urls ...string) <-chan string {
	ch := make(chan string)
	go func() {
		defer close(ch)
		for _, u := range urls {
			ch <- u
		}
	}()
	return ch
}

// drain reads until out closes; closed is false if that takes over a second.
func drain(out <-chan string) (got []string, closed bool) {
	timeout := time.After(time.Second)
	for {
		select {
		case s, open := <-out:
			if !open {
				return got, true
			}
			got = append(got, s)
		case <-timeout:
			return got, false
		}
	}
}

// probe is a fake fetch that tracks how many calls overlap. Each call waits
// (briefly) until k calls are in flight together.
type probe struct {
	k         int32
	cur, peak atomic.Int32
	full      chan struct{}
	once      sync.Once
}

func newProbe(k int) *probe { return &probe{k: int32(k), full: make(chan struct{})} }

func (p *probe) fetch(string) (int, error) {
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
	return 200, nil
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
		us = append(us, fmt.Sprint("u", i))
	}
	return us
}

func main() {
	status := map[string]int{"a": 200, "b": 404, "d": 500}
	fake := func(u string) (int, error) {
		if code, ok := status[u]; ok {
			return code, nil
		}
		return 0, errors.New("no such host")
	}

	check("ok and not ok", func() (any, any) {
		got, _ := drain(CheckURLs(feed("a", "b", "c", "d"), 2, fake))
		slices.Sort(got)
		return got, []string{"a ok", "b not ok", "c not ok", "d not ok"}
	})
	ok("closes on empty input", func() (bool, string) {
		got, closed := drain(CheckURLs(feed(), 3, fake))
		return closed && len(got) == 0, fmt.Sprintf("closed=%v, got %v", closed, got)
	})
	ok("at most `workers` fetches at once", func() (bool, string) {
		p := newProbe(3)
		got, closed := drain(CheckURLs(feed(urls(20)...), 3, p.fetch))
		return closed && len(got) == 20 && p.peak.Load() <= 3,
			fmt.Sprintf("peak %d fetches in flight, want ≤ 3 (%d results, closed=%v)", p.peak.Load(), len(got), closed)
	})
	ok("workers run in parallel", func() (bool, string) {
		p := newProbe(4)
		drain(CheckURLs(feed(urls(8)...), 4, p.fetch))
		return p.peak.Load() == 4, fmt.Sprintf("peak %d fetches in flight, want 4", p.peak.Load())
	})
	ok("no goroutines left behind", func() (bool, string) {
		before := runtime.NumGoroutine()
		drain(CheckURLs(feed(urls(10)...), 5, fake))
		return settled(before), fmt.Sprintf("%d goroutines still running", runtime.NumGoroutine()-before)
	})
	done()
}
